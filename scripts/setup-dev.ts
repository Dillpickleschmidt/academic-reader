import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const rootEnvPath = resolve(root, ".env.local");
const rootEnvExamplePath = resolve(root, ".env.local.example");
const convexEnvPath = resolve(root, "packages/convex/.env.local");
const shouldSyncConvex = !process.argv.includes("--no-sync");

const rootEnv = parseEnvFile(rootEnvPath);
const convexEnv = parseEnvFile(convexEnvPath);
const nextEnv = {
	...rootEnv,
	SITE_URL: rootEnv.SITE_URL ?? "http://localhost:5173",
	CONVEX_URL: firstValidUrl(
		rootEnv.CONVEX_URL,
		convexEnv.CONVEX_URL,
		convexEnv.VITE_CONVEX_URL,
		"http://localhost:3210",
	),
	VITE_CONVEX_URL: firstValidUrl(
		rootEnv.VITE_CONVEX_URL,
		convexEnv.VITE_CONVEX_URL,
		convexEnv.CONVEX_URL,
		"http://localhost:3210",
	),
	VITE_CONVEX_SITE_URL: firstValidUrl(
		rootEnv.VITE_CONVEX_SITE_URL,
		convexEnv.VITE_CONVEX_SITE_URL,
		convexEnv.CONVEX_SITE_URL,
		"http://localhost:3211",
	),
	STORAGE_BACKEND: rootEnv.STORAGE_BACKEND ?? "minio",
	S3_API_ENDPOINT: rootEnv.S3_API_ENDPOINT ?? "http://localhost:9000",
	S3_PRESIGNED_URL_ENDPOINT:
		rootEnv.S3_PRESIGNED_URL_ENDPOINT ?? "http://localhost:9000",
	S3_REGION: rootEnv.S3_REGION ?? "us-east-1",
	S3_ACCESS_KEY: rootEnv.S3_ACCESS_KEY ?? "minioadmin",
	S3_SECRET_KEY: rootEnv.S3_SECRET_KEY ?? "minioadmin",
	S3_BUCKET: rootEnv.S3_BUCKET ?? "academic-reader",
	MINIO_ROOT_USER: rootEnv.MINIO_ROOT_USER ?? "minioadmin",
	MINIO_ROOT_PASSWORD: rootEnv.MINIO_ROOT_PASSWORD ?? "minioadmin",
	CONVERSION_BACKEND: rootEnv.CONVERSION_BACKEND ?? "local",
	MODAL_MARKER_URL: rootEnv.MODAL_MARKER_URL,
	TTS_BACKEND: rootEnv.TTS_BACKEND ?? "local",
	KOKORO_TTS_WORKER_URL:
		rootEnv.KOKORO_TTS_WORKER_URL ?? "http://localhost:8801",
	QWEN3_TTS_WORKER_URL:
		rootEnv.QWEN3_TTS_WORKER_URL ?? "http://localhost:8802",
	MODAL_KOKORO_TTS_URL: rootEnv.MODAL_KOKORO_TTS_URL,
	MODAL_QWEN3_TTS_URL: rootEnv.MODAL_QWEN3_TTS_URL,
	AI_PROVIDER: rootEnv.AI_PROVIDER ?? "groq",
	GROQ_API_KEY: rootEnv.GROQ_API_KEY,
	NARRATION_ELIGIBILITY_MODEL:
		rootEnv.NARRATION_ELIGIBILITY_MODEL ?? "openai/gpt-oss-120b",
	NARRATION_GUIDE_MODEL: rootEnv.NARRATION_GUIDE_MODEL ?? "openai/gpt-oss-120b",
	NARRATION_REWRITE_MODEL:
		rootEnv.NARRATION_REWRITE_MODEL ?? "openai/gpt-oss-120b",
	BETTER_AUTH_SECRET:
		rootEnv.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex"),
	API_TO_CONVEX_SERVICE_SECRET:
		rootEnv.API_TO_CONVEX_SERVICE_SECRET ?? randomBytes(32).toString("hex"),
	CONVEX_DEPLOYMENT: convexEnv.CONVEX_DEPLOYMENT,
	GOOGLE_CLIENT_ID: rootEnv.GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET: rootEnv.GOOGLE_CLIENT_SECRET,
};

writeEnvFile(rootEnvPath, nextEnv);
console.log("[setup-dev] Wrote .env.local");

if (shouldSyncConvex) {
	await syncConvexEnv(nextEnv);
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

function firstValidUrl(...values: Array<string | undefined>) {
	for (const value of values) {
		if (!value || value.includes("=")) continue;
		try {
			return new URL(value)
				.toString()
				.replace(/\/$/, "")
				.replace("http://127.0.0.1:", "http://localhost:");
		} catch {}
	}
	throw new Error("No valid URL fallback provided");
}

function writeEnvFile(path: string, env: Record<string, string | undefined>) {
	writeFileSync(path, renderEnv(env));
}

function renderEnv(env: Record<string, string | undefined>) {
	const template = readFileSync(rootEnvExamplePath, "utf8");
	const lines = template.split("\n").map((line) => {
		const match = line.match(/^(#\s*)?([A-Z0-9_]+)=.*$/);
		if (!match) return line;

		const key = match[2];
		const value = env[key];
		return value ? `${key}=${value}` : line;
	});

	return `${lines.join("\n").replace(/\n*$/, "")}\n`;
}

async function syncConvexEnv(env: Record<string, string | undefined>) {
	const keys = [
		"SITE_URL",
		"BETTER_AUTH_SECRET",
		"API_TO_CONVEX_SERVICE_SECRET",
	];
	const convexCwd = resolve(root, "packages/convex");
	let didSync = false;

	for (const key of keys) {
		const value = env[key];
		if (!value) continue;

		const proc = Bun.spawn(["bunx", "convex", "env", "set", key, value], {
			cwd: convexCwd,
			env: { ...process.env, ...env, CONVEX_AGENT_MODE: "anonymous" },
			stdout: "pipe",
			stderr: "pipe",
		});
		const stderr = await new Response(proc.stderr).text();
		await proc.exited;

		if (proc.exitCode === 0) {
			didSync = true;
			console.log(`[setup-dev] Synced Convex ${key}`);
			continue;
		}

		const message = stderr.trim();
		if (message) console.log(`[setup-dev] Convex env sync skipped: ${message}`);
		else console.log("[setup-dev] Convex env sync skipped");
		return;
	}

	if (!didSync) {
		console.log("[setup-dev] Convex env sync skipped");
	}
}
