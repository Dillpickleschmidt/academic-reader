import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const rootEnvPath = resolve(root, ".env.local");
const children: Bun.Subprocess[] = [];

// A CONVEX_DEPLOYMENT inherited from the shell (or a pre-self-hosted
// .env.local auto-loaded by bun) makes the Convex CLI refuse to start.
delete process.env.CONVEX_DEPLOYMENT;

process.on("SIGINT", () => void stopChildren(130));
process.on("SIGTERM", () => void stopChildren(143));

try {
	await main();
} catch (error) {
	await stopChildren();
	throw error;
}

async function main() {
	await run("setup", "bun", ["scripts/setup-dev.ts", "--no-sync"], root);
	const rootEnv = parseEnvFile(rootEnvPath);
	const services = ["minio", "convex"];
	if (rootEnv.CONVERSION_BACKEND === "local") services.push("marker");
	if (rootEnv.TTS_BACKEND === "local") {
		services.push("kokoro-tts", "qwen3-tts");
	}
	await run(
		"storage",
		"docker",
		["compose", "--env-file", ".env.local", "up", "-d", ...services],
		root,
	);
	await waitForHttp("convex", "http://localhost:3210/version", 60_000);
	if (rootEnv.CONVERSION_BACKEND === "local") {
		await waitForHttp("marker", "http://localhost:8800/health", 120_000);
	}
	if (rootEnv.TTS_BACKEND === "local") {
		await waitForHttp("kokoro", "http://localhost:8801/health", 180_000);
		await waitForHttp("qwen3", "http://localhost:8802/health", 600_000);
	}
	await run(
		"storage",
		"docker",
		["compose", "--env-file", ".env.local", "run", "--rm", "minio-init"],
		root,
	);

	if (rootEnv.CONVERSION_BACKEND === "modal" && !rootEnv.MODAL_MARKER_URL) {
		throw new Error(
			"MODAL_MARKER_URL is required when CONVERSION_BACKEND=modal. Deploy workers/marker/modal_app.py and set the URL in .env.local.",
		);
	}

	if (rootEnv.TTS_BACKEND === "modal") {
		if (!rootEnv.MODAL_KOKORO_TTS_URL) {
			throw new Error(
				"MODAL_KOKORO_TTS_URL is required when TTS_BACKEND=modal. Deploy workers/kokoro-tts/modal_app.py and set the URL in .env.local.",
			);
		}
		if (!rootEnv.MODAL_QWEN3_TTS_URL) {
			throw new Error(
				"MODAL_QWEN3_TTS_URL is required when TTS_BACKEND=modal. Deploy workers/qwen3-tts/modal_app.py and set the URL in .env.local.",
			);
		}
	}

	// Now that the backend is up, the full setup run can generate the Convex
	// admin key and sync deployment env vars before the function watcher starts.
	await run("setup", "bun", ["scripts/setup-dev.ts"], root);

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

	const apiEnv: Record<string, string> = {};
	if (rootEnv.CONVERSION_BACKEND === "modal") {
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
	await stopChildren();
	process.exit(exitCode ?? 0);
}

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
		kokoro: "\x1b[36m",
		qwen3: "\x1b[36m",
	};
	const reset = "\x1b[0m";
	return `${colors[label] ?? ""}${label.padEnd(7)}${reset}`;
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

async function stopChildren(exitCode?: number) {
	for (const child of children) {
		child.kill();
	}
	await Promise.race([
		Promise.allSettled(children.map((child) => child.exited)),
		sleep(5_000),
	]);
	if (exitCode !== undefined) process.exit(exitCode);
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
}
