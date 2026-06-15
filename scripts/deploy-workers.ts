import { createHash, randomBytes } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

interface ModalWorker {
	appName: string;
	envKey: string;
	file: string;
	hashPaths: string[];
}

interface DeploymentCache {
	workers?: Record<string, { hash: string; deployedAt: string }>;
}

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, ".env.local");
const cachePath = resolve(
	root,
	"node_modules/.cache/academic-reader/modal-workers.json",
);
const forceDeploy = process.argv.includes("--force");
const workers: ModalWorker[] = [
	{
		appName: "marker",
		envKey: "MODAL_MARKER_URL",
		file: "workers/marker/modal_app.py",
		hashPaths: [
			"workers/marker/modal_app.py",
			"workers/marker/app",
			"workers/marker/requirements.txt",
		],
	},
	{
		appName: "kokoro-tts",
		envKey: "MODAL_KOKORO_TTS_URL",
		file: "workers/kokoro-tts/modal_app.py",
		hashPaths: [
			"workers/kokoro-tts/modal_app.py",
			"workers/kokoro-tts/core",
			"workers/kokoro-tts/requirements.txt",
		],
	},
];

if (!existsSync(envPath)) {
	console.error(
		"[workers] .env.local not found. Run `bun run setup:dev` first.",
	);
	process.exit(1);
}

const env = parseEnvFile(envPath);
const cache = readDeploymentCache();
const modalCommand = requireModalCommand();
const pythonCommand = requireModalPythonCommand(modalCommand[0]);
await assertModalAuthenticated(modalCommand);

let envChanged = false;

for (const worker of workers) {
	const hash = hashWorker(worker);
	const cachedHash = cache.workers?.[worker.appName]?.hash;

	if (!forceDeploy && cachedHash === hash) {
		console.log(`[workers] ${worker.appName} unchanged; skipping deploy`);
	} else {
		if (worker.appName === "marker") {
			await syncGoogleApiSecretIfPresent(env, modalCommand);
		}
		console.log(`[workers] Deploying ${worker.appName}...`);
		await run(
			modalCommand[0],
			[...modalCommand.slice(1), "deploy", worker.file],
			{
				cwd: root,
				stdio: "inherit",
			},
		);
		cache.workers = {
			...(cache.workers ?? {}),
			[worker.appName]: { hash, deployedAt: new Date().toISOString() },
		};
	}

	const url = await discoverWorkerUrl(worker, pythonCommand);
	if (url && env[worker.envKey] !== url) {
		env[worker.envKey] = url;
		envChanged = true;
	}
}

writeDeploymentCache(cache);
if (envChanged) {
	writeEnvValues(envPath, env);
	console.log("[workers] Updated .env.local");
}

console.log("[workers] Worker deployment check complete");

function hashWorker(worker: ModalWorker) {
	const hash = createHash("sha256");
	for (const file of workerFiles(worker)) {
		hash.update(relative(root, file));
		hash.update("\0");
		hash.update(readFileSync(file));
		hash.update("\0");
	}
	return hash.digest("hex");
}

function workerFiles(worker: ModalWorker) {
	const files = worker.hashPaths.flatMap((hashPath) =>
		listFiles(resolve(root, hashPath)),
	);
	return files.sort();
}

function listFiles(path: string): string[] {
	if (!existsSync(path)) return [];
	const stat = statSync(path);
	if (stat.isFile()) return shouldHashFile(path) ? [path] : [];
	if (!stat.isDirectory()) return [];

	return readdirSync(path).flatMap((entry) => {
		if (entry === "__pycache__") return [];
		return listFiles(resolve(path, entry));
	});
}

function shouldHashFile(path: string) {
	return !path.endsWith(".pyc") && !path.endsWith(".pyo");
}

async function syncGoogleApiSecretIfPresent(
	env: Record<string, string>,
	modalCommand: string[],
) {
	const googleApiKey = env.GOOGLE_API_KEY;
	if (!googleApiKey) {
		console.log(
			"[workers] GOOGLE_API_KEY is not in .env.local; assuming Modal secret google-api-key already exists",
		);
		return;
	}

	const dir = resolve(
		tmpdir(),
		`academic-reader-modal-${randomBytes(8).toString("hex")}`,
	);
	const secretPath = join(dir, "google-api-key.json");
	mkdirSync(dir, { recursive: true });
	writeFileSync(secretPath, JSON.stringify({ GOOGLE_API_KEY: googleApiKey }));

	try {
		await run(
			modalCommand[0],
			[
				...modalCommand.slice(1),
				"secret",
				"create",
				"google-api-key",
				"--from-json",
				secretPath,
				"--force",
			],
			{ cwd: root, stdio: "pipe" },
		);
		console.log("[workers] Synced Modal secret google-api-key");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function discoverWorkerUrl(worker: ModalWorker, pythonCommand: string[]) {
	const code = `
import modal
function = modal.Function.from_name("${worker.appName}", "api")
print(function.get_web_url() or "")
`.trim();
	const result = await run(
		pythonCommand[0],
		[...pythonCommand.slice(1), "-c", code],
		{
			cwd: root,
			stdio: "pipe",
			allowFailure: true,
		},
	);
	const url = result.stdout.trim();
	if (result.code === 0 && url) {
		console.log(`[workers] ${worker.envKey}=${url}`);
		return url;
	}
	console.warn(`[workers] Could not discover URL for ${worker.appName}`);
	return null;
}

function parseEnvFile(path: string): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const line of readFileSync(path, "utf8").split("\n")) {
		const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
		if (match) vars[match[1]] = match[2].trim();
	}
	return vars;
}

function writeEnvValues(path: string, values: Record<string, string>) {
	const lines = readFileSync(path, "utf8").split("\n");
	const written = new Set<string>();
	const nextLines = lines.map((line) => {
		const match = line.match(/^(\s*#?\s*)([A-Z0-9_]+)=.*$/);
		if (!match) return line;

		const key = match[2];
		const value = values[key];
		if (value === undefined) return line;

		written.add(key);
		return `${key}=${value}`;
	});

	for (const [key, value] of Object.entries(values)) {
		if (!written.has(key)) nextLines.push(`${key}=${value}`);
	}

	writeFileSync(path, `${nextLines.join("\n").trimEnd()}\n`);
}

function readDeploymentCache(): DeploymentCache {
	if (!existsSync(cachePath)) return {};
	try {
		return JSON.parse(readFileSync(cachePath, "utf8"));
	} catch {
		return {};
	}
}

function writeDeploymentCache(cache: DeploymentCache) {
	mkdirSync(resolve(cachePath, ".."), { recursive: true });
	writeFileSync(cachePath, `${JSON.stringify(cache, null, "\t")}\n`);
}

function requireModalCommand() {
	const path = commandPath("modal");
	if (path) return [path];

	console.error(
		"[workers] Modal CLI is not installed. Install Modal and run `modal setup`.",
	);
	process.exit(1);
}

function requireModalPythonCommand(modalPath: string) {
	try {
		const firstLine = readFileSync(modalPath, "utf8").split("\n")[0];
		const match = firstLine.match(/^#!(.+)$/);
		if (match && existsSync(match[1])) return [match[1]];
	} catch {}

	const pythonPath = commandPath("python3") ?? commandPath("python");
	if (pythonPath) return [pythonPath];

	console.error("[workers] Could not locate Python for Modal URL discovery.");
	process.exit(1);
}

async function assertModalAuthenticated(modalCommand: string[]) {
	const result = await run(
		modalCommand[0],
		[...modalCommand.slice(1), "token", "info"],
		{ stdio: "pipe", allowFailure: true },
	);

	if (result.code === 0) return;

	if (result.stderr.trim()) console.error(result.stderr.trim());
	console.error("[workers] Modal is not authenticated. Run `modal setup`.");
	process.exit(1);
}

function commandPath(name: string) {
	const result = Bun.spawnSync(["bash", "-lc", `command -v ${name}`], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.exitCode !== 0) return null;
	return result.stdout.toString().trim() || null;
}

async function run(
	command: string,
	args: string[],
	options: {
		cwd?: string;
		stdio?: "inherit" | "pipe";
		allowFailure?: boolean;
	} = {},
) {
	const proc = Bun.spawn([command, ...args], {
		cwd: options.cwd,
		stdin: "inherit",
		stdout: options.stdio === "inherit" ? "inherit" : "pipe",
		stderr: options.stdio === "inherit" ? "inherit" : "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		proc.stdout ? new Response(proc.stdout).text() : Promise.resolve(""),
		proc.stderr ? new Response(proc.stderr).text() : Promise.resolve(""),
		proc.exited,
	]);

	if (code !== 0 && !options.allowFailure) {
		if (stdout.trim()) console.log(stdout.trim());
		if (stderr.trim()) console.error(stderr.trim());
		process.exit(code);
	}

	return { code, stdout, stderr };
}
