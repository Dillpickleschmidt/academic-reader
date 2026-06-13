import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const rootEnvPath = resolve(root, ".env.local");
const convexEnvPath = resolve(root, "packages/convex/.env.local");
const shouldSyncConvex = !process.argv.includes("--no-sync");

const rootEnv = parseEnvFile(rootEnvPath);
const convexEnv = parseEnvFile(convexEnvPath);
const nextEnv = {
	...rootEnv,
	CONVEX_DEPLOYMENT: rootEnv.CONVEX_DEPLOYMENT ?? convexEnv.CONVEX_DEPLOYMENT,
	SITE_URL: rootEnv.SITE_URL ?? "http://localhost:5173",
	VITE_CONVEX_URL:
		rootEnv.VITE_CONVEX_URL ??
		convexEnv.VITE_CONVEX_URL ??
		convexEnv.CONVEX_URL ??
		"http://localhost:3210",
	VITE_CONVEX_SITE_URL:
		rootEnv.VITE_CONVEX_SITE_URL ??
		convexEnv.VITE_CONVEX_SITE_URL ??
		convexEnv.CONVEX_SITE_URL ??
		"http://localhost:3211",
	BETTER_AUTH_SECRET:
		rootEnv.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex"),
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

function writeEnvFile(path: string, env: Record<string, string | undefined>) {
	const order = [
		"CONVEX_DEPLOYMENT",
		"SITE_URL",
		"VITE_CONVEX_URL",
		"VITE_CONVEX_SITE_URL",
		"BETTER_AUTH_SECRET",
	];
	const lines = order
		.map((key) => [key, env[key]] as const)
		.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
		.map(([key, value]) => `${key}=${value}`);

	const remaining = Object.entries(env)
		.filter(([key, value]) => value && !order.includes(key))
		.map(([key, value]) => `${key}=${value}`);

	writeFileSync(path, `${[...lines, ...remaining].join("\n")}\n`);
}

async function syncConvexEnv(env: Record<string, string | undefined>) {
	const keys = ["SITE_URL", "BETTER_AUTH_SECRET"];
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
