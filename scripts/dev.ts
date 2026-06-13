import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const convexEnvPath = resolve(root, "packages/convex/.env.local");
const children: Bun.Subprocess[] = [];

process.on("SIGINT", stopChildren);
process.on("SIGTERM", stopChildren);

await run("setup", "bun", ["scripts/setup-dev.ts", "--no-sync"], root);

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

spawn("api", "bun", ["run", "dev:api"], root);
spawn("web", "bun", ["run", "dev:web"], root);

const exitCode = await Promise.race(children.map((child) => child.exited));
stopChildren();
process.exit(exitCode ?? 0);

function spawn(
	label: string,
	command: string,
	args: string[],
	cwd: string,
	onText?: (text: string) => void,
) {
	const child = Bun.spawn([command, ...args], {
		cwd,
		stdin: "inherit",
		stdout: "pipe",
		stderr: "pipe",
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
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	return { promise, resolve, reject };
}
