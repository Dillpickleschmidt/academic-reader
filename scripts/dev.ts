import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const rootEnvPath = resolve(root, ".env.local");
const convexEnvPath = resolve(root, "packages/convex/.env.local");
const children: Bun.Subprocess[] = [];

process.on("SIGINT", stopChildren);
process.on("SIGTERM", stopChildren);

await run("setup", "bun", ["scripts/setup-dev.ts", "--no-sync"], root);
const rootEnv = parseEnvFile(rootEnvPath);
const services = ["minio"];
if (rootEnv.CONVERSION_BACKEND === "local") services.push("marker");
await run(
	"storage",
	"docker",
	["compose", "--env-file", ".env.local", "up", "-d", ...services],
	root,
);
if (rootEnv.CONVERSION_BACKEND === "local") {
	await waitForHttp("marker", "http://localhost:8800/health", 120_000);
}
await run(
	"storage",
	"docker",
	["compose", "--env-file", ".env.local", "run", "--rm", "minio-init"],
	root,
);

const apiEnv: Record<string, string> = {};
if (rootEnv.CONVERSION_BACKEND === "modal") {
	if (!rootEnv.MODAL_MARKER_URL) {
		throw new Error(
			"MODAL_MARKER_URL is required when CONVERSION_BACKEND=modal. Deploy workers/marker/modal_app.py and set the URL in .env.local.",
		);
	}

	const minioTunnelUrl = await startCloudflareTunnel(
		"s3-tun",
		"http://localhost:9000",
	);
	const apiTunnelUrl = await startCloudflareTunnel(
		"api-tun",
		"http://localhost:8787",
	);
	apiEnv.WORKER_APP_API_URL = apiTunnelUrl;
	apiEnv.S3_WORKER_PRESIGNED_URL_ENDPOINT = minioTunnelUrl;
}

const convexReady = deferred<void>();
const convex = spawn("convex", "bun", ["run", "dev:convex"], root, (text) => {
	if (text.includes("Convex functions ready!")) convexReady.resolve();
});

await Promise.race([
	convexReady.promise,
	convex.exited.then((code) => {
		throw new Error(`Convex exited before becoming ready (${code})`);
	}),
]);
await waitForConvexEnv();
await run("setup", "bun", ["scripts/setup-dev.ts"], root);

spawn(
	"api",
	"bun",
	["--env-file", "../../.env.local", "--watch", "src/main.ts"],
	resolve(root, "apps/api"),
	undefined,
	{ PORT: "8787", ...apiEnv },
);
spawn("web", "bun", ["run", "dev"], resolve(root, "apps/web"));

const exitCode = await Promise.race(children.map((child) => child.exited));
stopChildren();
process.exit(exitCode ?? 0);

function spawn(
	label: string,
	command: string,
	args: string[],
	cwd: string,
	onText?: (text: string) => void,
	env?: Record<string, string>,
) {
	const child = Bun.spawn([command, ...args], {
		cwd,
		stdin: "inherit",
		stdout: "pipe",
		stderr: "pipe",
		...(env && Object.keys(env).length > 0
			? { env: { ...process.env, ...env } }
			: {}),
	});
	children.push(child);
	void pipeOutput(label, child.stdout, false, onText);
	void pipeOutput(label, child.stderr, true, onText);
	return child;
}

async function run(
	label: string,
	command: string,
	args: string[],
	cwd: string,
) {
	const child = Bun.spawn([command, ...args], {
		cwd,
		stdin: "inherit",
		stdout: "pipe",
		stderr: "pipe",
	});
	void pipeOutput(label, child.stdout, false);
	void pipeOutput(label, child.stderr, true);
	const exitCode = await child.exited;
	if (exitCode !== 0) process.exit(exitCode);
}

async function startCloudflareTunnel(label: string, originUrl: string) {
	const ready = deferred<string>();
	let output = "";
	const child = spawn(
		label,
		"docker",
		[
			"run",
			"--rm",
			"--network",
			"host",
			"cloudflare/cloudflared:latest",
			"tunnel",
			"--no-autoupdate",
			"--url",
			originUrl,
		],
		root,
		(text) => {
			output += text;
			const url = output.match(
				/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/,
			)?.[0];
			if (url) ready.resolve(url);
		},
	);

	try {
		const url = await Promise.race([
			ready.promise,
			child.exited.then((code) => {
				throw new Error(
					`${label} exited before publishing a tunnel URL (${code})`,
				);
			}),
			timeout(60_000, `${label} did not publish a tunnel URL`),
		]);
		console.log(`[dev] ${label} ${originUrl} -> ${url}`);
		return url;
	} catch (error) {
		child.kill();
		throw error;
	}
}

async function pipeOutput(
	label: string,
	stream: ReadableStream<Uint8Array> | null,
	isError: boolean,
	onText?: (text: string) => void,
) {
	if (!stream) return;

	const decoder = new TextDecoder();
	const writer = isError ? process.stderr : process.stdout;
	let buffer = "";

	for await (const chunk of stream) {
		const text = decoder.decode(chunk, { stream: true }).replaceAll("\r", "\n");
		onText?.(text);
		buffer += text;
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";

		for (const line of lines) {
			if (line.length === 0) continue;
			writer.write(`${prefix(label)} | ${line}\n`);
		}
	}

	const tail = buffer.trim();
	if (tail) writer.write(`${prefix(label)} | ${tail}\n`);
}

function prefix(label: string) {
	const colors: Record<string, string> = {
		setup: "\x1b[36m",
		convex: "\x1b[35m",
		api: "\x1b[32m",
		web: "\x1b[34m",
		storage: "\x1b[33m",
		"api-tun": "\x1b[36m",
		"s3-tun": "\x1b[36m",
	};
	const reset = "\x1b[0m";
	return `${colors[label] ?? ""}${label.padEnd(7)}${reset}`;
}

async function waitForConvexEnv() {
	while (true) {
		const env = parseEnvFile(convexEnvPath);
		if (env.CONVEX_DEPLOYMENT && (env.CONVEX_URL || env.VITE_CONVEX_URL)) {
			return;
		}
		await sleep(250);
	}
}

function parseEnvFile(path: string) {
	if (!existsSync(path)) return {} as Record<string, string>;

	const vars: Record<string, string> = {};
	for (const line of readFileSync(path, "utf8").split("\n")) {
		const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
		if (match) vars[match[1]] = match[2].trim();
	}
	return vars;
}

async function waitForHttp(label: string, url: string, timeoutMs: number) {
	const start = Date.now();

	while (Date.now() - start < timeoutMs) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {}
		await sleep(500);
	}

	throw new Error(`${label} did not become ready at ${url}`);
}

function timeout(ms: number, message: string) {
	return new Promise<never>((_, reject) => {
		setTimeout(() => reject(new Error(message)), ms);
	});
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopChildren() {
	for (const child of children) {
		child.kill();
	}
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
}
