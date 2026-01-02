#!/usr/bin/env bun
/**
 * Unified development orchestration script.
 * Cross-platform (Windows/Mac/Linux) TypeScript alternative to shell scripts.
 *
 * Usage:
 *   bun scripts/dev.ts dev           # Start dev servers (mode from .env.local)
 *   bun scripts/dev.ts dev --mode X  # Override mode (local/runpod/datalab)
 *   bun scripts/dev.ts sync          # Sync .env.local to tool-specific files
 *   bun scripts/dev.ts status        # Show current configuration
 *   bun scripts/dev.ts secrets       # Push secrets to Cloudflare Workers
 *   bun scripts/dev.ts deploy        # Deploy to production
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { spawn, type Subprocess } from "bun";

const ROOT_DIR = resolve(dirname(import.meta.path), "..");
const ENV_FILE = resolve(ROOT_DIR, ".env.local");

type BackendMode = "local" | "runpod" | "datalab";

interface Config {
  BACKEND_MODE: BackendMode;
  GOOGLE_API_KEY?: string;
  DATALAB_API_KEY?: string;
  RUNPOD_API_KEY?: string;
  RUNPOD_ENDPOINT_ID?: string;
  CORS_ORIGINS?: string;
  API_URL?: string;
  LOCAL_WORKER_URL?: string;
  // S3 storage (for Runpod)
  S3_ENDPOINT?: string;
  S3_ACCESS_KEY?: string;
  S3_SECRET_KEY?: string;
  S3_BUCKET?: string;
  S3_PUBLIC_URL?: string;
  // Convex (cloud modes)
  CONVEX_DEPLOYMENT?: string;
  CONVEX_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  // Convex (self-hosted local)
  CONVEX_SELF_HOSTED_ADMIN_KEY?: string;
  // Deploy
  DEPLOY_API_URL?: string;
}

// Colors for terminal output
const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};

  const content = readFileSync(path, "utf-8");
  const env: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      // Strip inline comments (only for unquoted values)
      const commentIndex = value.indexOf(" #");
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    env[key] = value;
  }

  return env;
}

function loadConfig(modeOverride?: string): Config {
  if (!existsSync(ENV_FILE)) {
    console.error(colors.red("Error: .env.local not found"));
    console.log(`Run: ${colors.cyan("cp .env.example .env.local")}`);
    process.exit(1);
  }

  const env = parseEnvFile(ENV_FILE);
  const mode = (modeOverride || env.BACKEND_MODE || "local") as BackendMode;

  return {
    BACKEND_MODE: mode,
    GOOGLE_API_KEY: env.GOOGLE_API_KEY,
    DATALAB_API_KEY: env.DATALAB_API_KEY,
    RUNPOD_API_KEY: env.RUNPOD_API_KEY,
    RUNPOD_ENDPOINT_ID: env.RUNPOD_ENDPOINT_ID,
        CORS_ORIGINS: env.CORS_ORIGINS,
    API_URL: env.API_URL,
    LOCAL_WORKER_URL: env.LOCAL_WORKER_URL || "http://localhost:8000",
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_ACCESS_KEY: env.S3_ACCESS_KEY,
    S3_SECRET_KEY: env.S3_SECRET_KEY,
    S3_BUCKET: env.S3_BUCKET,
    S3_PUBLIC_URL: env.S3_PUBLIC_URL,
    // Convex (cloud modes)
    CONVEX_DEPLOYMENT: env.CONVEX_DEPLOYMENT,
    CONVEX_URL: env.CONVEX_URL,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    // Convex (self-hosted local)
    CONVEX_SELF_HOSTED_ADMIN_KEY: env.CONVEX_SELF_HOSTED_ADMIN_KEY,
    // Deploy
    DEPLOY_API_URL: env.DEPLOY_API_URL,
  };
}

function validateConfig(config: Config): void {
  const missing: string[] = [];

  switch (config.BACKEND_MODE) {
    case "runpod":
      if (!config.RUNPOD_API_KEY) missing.push("RUNPOD_API_KEY");
      if (!config.RUNPOD_ENDPOINT_ID) missing.push("RUNPOD_ENDPOINT_ID");
      break;
    case "datalab":
      if (!config.DATALAB_API_KEY) missing.push("DATALAB_API_KEY");
      break;
    case "local":
      // No required secrets for local mode
      break;
  }

  if (missing.length > 0) {
    console.error(
      colors.red(`Missing required variables for ${config.BACKEND_MODE} mode:`),
    );
    missing.forEach((v) => console.error(`  - ${v}`));
    process.exit(1);
  }
}

function syncConfigs(config: Config): void {
  // Generate api/.dev.vars for wrangler (cloud modes only)
  if (config.BACKEND_MODE !== "local") {
    const devVars = [
      "# Auto-generated from .env.local - do not edit directly",
      `BACKEND_MODE=${config.BACKEND_MODE}`,
      config.GOOGLE_API_KEY ? `GOOGLE_API_KEY=${config.GOOGLE_API_KEY}` : "",
      config.DATALAB_API_KEY ? `DATALAB_API_KEY=${config.DATALAB_API_KEY}` : "",
      config.RUNPOD_API_KEY ? `RUNPOD_API_KEY=${config.RUNPOD_API_KEY}` : "",
      config.RUNPOD_ENDPOINT_ID
        ? `RUNPOD_ENDPOINT_ID=${config.RUNPOD_ENDPOINT_ID}`
        : "",
            config.CORS_ORIGINS ? `CORS_ORIGINS=${config.CORS_ORIGINS}` : "",
      // S3 config
      config.S3_ENDPOINT ? `S3_ENDPOINT=${config.S3_ENDPOINT}` : "",
      config.S3_ACCESS_KEY ? `S3_ACCESS_KEY=${config.S3_ACCESS_KEY}` : "",
      config.S3_SECRET_KEY ? `S3_SECRET_KEY=${config.S3_SECRET_KEY}` : "",
      config.S3_BUCKET ? `S3_BUCKET=${config.S3_BUCKET}` : "",
      config.S3_PUBLIC_URL ? `S3_PUBLIC_URL=${config.S3_PUBLIC_URL}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    writeFileSync(resolve(ROOT_DIR, "api/.dev.vars"), devVars + "\n");
  }

  // Generate frontend/.env.local for Vite
  // All dev modes use self-hosted Convex
  const apiUrl = config.API_URL || "http://localhost:8787";
  const frontendEnvLines = [
    `VITE_API_URL=${apiUrl}`,
    `VITE_CONVEX_URL=http://127.0.0.1:3210`,
    `VITE_CONVEX_SITE_URL=http://127.0.0.1:3211`,
  ];

  if (config.CONVEX_SELF_HOSTED_ADMIN_KEY) {
    frontendEnvLines.push(
      `CONVEX_SELF_HOSTED_ADMIN_KEY=${config.CONVEX_SELF_HOSTED_ADMIN_KEY}`,
    );
    frontendEnvLines.push(`CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210`);
  }

  writeFileSync(
    resolve(ROOT_DIR, "frontend/.env.local"),
    frontendEnvLines.join("\n") + "\n",
  );

  console.log(colors.green(`Configs synced for mode: ${config.BACKEND_MODE}`));
}

async function generateConvexAdminKey(): Promise<string | null> {
  console.log(colors.cyan("Generating Convex admin key..."));

  const proc = spawn({
    cmd: [
      "docker",
      "compose",
      "--profile",
      "local",
      "exec",
      "convex-backend",
      "./generate_admin_key.sh",
    ],
    cwd: ROOT_DIR,
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    console.error(colors.red("Failed to generate admin key"));
    return null;
  }

  // Parse the admin key from output (format: "Admin key: <key>")
  const match = output.match(/Admin key:\s*(\S+)/);
  if (!match) {
    console.error(colors.red("Could not parse admin key from output:"));
    console.error(output || "(empty output)");
    return null;
  }

  const adminKey = match[1];

  // Append to .env.local
  const envContent = readFileSync(ENV_FILE, "utf-8");
  if (!envContent.includes("CONVEX_SELF_HOSTED_ADMIN_KEY")) {
    writeFileSync(ENV_FILE, envContent + `\nCONVEX_SELF_HOSTED_ADMIN_KEY=${adminKey}\n`);
    console.log(colors.green("Admin key saved to .env.local"));
  }

  return adminKey;
}

async function syncConvexEnv(config: Config): Promise<void> {
  const convexEnvVars: Record<string, string | undefined> = {
    GOOGLE_CLIENT_ID: config.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: config.GOOGLE_CLIENT_SECRET,
  };

  const varsToSet = Object.entries(convexEnvVars).filter(
    ([, value]) => value !== undefined,
  );

  if (varsToSet.length === 0) return;

  console.log(colors.cyan("Syncing Convex environment variables..."));

  for (const [key, value] of varsToSet) {
    const proc = spawn({
      cmd: ["bunx", "convex", "env", "set", key, value!],
      cwd: resolve(ROOT_DIR, "frontend"),
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    if (proc.exitCode === 0) {
      console.log(`  ${key} ${colors.green("✓")}`);
    } else {
      console.log(`  ${key} ${colors.yellow("(skipped)")}`);
    }
  }
}

function showStatus(config: Config): void {
  const set = colors.green("[set]");
  const notSet = colors.yellow("[not set]");
  const showVar = (name: string, value: string | undefined, indent = 2) =>
    console.log(
      `${" ".repeat(indent)}${name.padEnd(23 - indent)} ${value ? set : notSet}`,
    );

  console.log(colors.bold("\nAcademic Reader Configuration"));
  console.log("─".repeat(40));
  console.log(`BACKEND_MODE         ${colors.cyan(config.BACKEND_MODE)}`);
  console.log("");
  console.log(colors.bold("Datalab (fully managed)"));
  showVar("DATALAB_API_KEY", config.DATALAB_API_KEY);
  console.log("");
  console.log(colors.bold("Runpod (self-hosted)"));
  showVar("RUNPOD_API_KEY", config.RUNPOD_API_KEY);
  showVar("RUNPOD_ENDPOINT_ID", config.RUNPOD_ENDPOINT_ID);
  showVar("GOOGLE_API_KEY", config.GOOGLE_API_KEY);
  console.log("");
  console.log(colors.bold("S3 Storage (for Runpod)"));
  showVar("S3_ENDPOINT", config.S3_ENDPOINT);
  showVar("S3_ACCESS_KEY", config.S3_ACCESS_KEY);
  showVar("S3_SECRET_KEY", config.S3_SECRET_KEY);
  showVar("S3_BUCKET", config.S3_BUCKET);
  console.log("");
}

async function runProcess(
  cmd: string[],
  options?: { cwd?: string; env?: Record<string, string> },
): Promise<Subprocess> {
  return spawn({
    cmd,
    cwd: options?.cwd || ROOT_DIR,
    env: { ...process.env, ...options?.env },
    stdout: "inherit",
    stderr: "inherit",
  });
}

async function startDev(config: Config): Promise<void> {
  validateConfig(config);

  const processes: Subprocess[] = [];

  const cleanup = async () => {
    console.log("\nShutting down...");
    processes.forEach((p) => p.kill());

    // Stop docker containers
    const dockerDown = spawn({
      cmd: ["docker", "compose", "--profile", config.BACKEND_MODE, "down"],
      cwd: ROOT_DIR,
      stdout: "inherit",
      stderr: "inherit",
    });
    await dockerDown.exited;

    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // All dev modes use self-hosted Convex
  const modeLabel = config.BACKEND_MODE === "local"
    ? "Docker worker + Convex + API + Vite"
    : `${config.BACKEND_MODE} backend + Convex + Vite`;

  console.log(colors.green(`\nStarting development (${modeLabel})`));
  if (config.BACKEND_MODE === "local") {
    console.log(colors.yellow("Note: Make sure Docker is running with GPU support\n"));
  }

  // Start docker with --wait to ensure Convex is healthy before proceeding
  const dockerUp = await runProcess(
    [
      "docker",
      "compose",
      "--profile",
      config.BACKEND_MODE,
      "--env-file",
      ".env.local",
      "up",
      "-d",
      "--wait",
    ],
    { cwd: ROOT_DIR, env: { BACKEND_MODE: config.BACKEND_MODE } },
  );
  await dockerUp.exited;

  // Generate admin key if not already set
  if (!config.CONVEX_SELF_HOSTED_ADMIN_KEY) {
    const adminKey = await generateConvexAdminKey();
    if (adminKey) {
      config.CONVEX_SELF_HOSTED_ADMIN_KEY = adminKey;
    }
  }

  // Sync configs with admin key
  syncConfigs(config);

  // Show docker logs in background
  processes.push(
    await runProcess(
      ["docker", "compose", "--profile", config.BACKEND_MODE, "logs", "-f"],
      { cwd: ROOT_DIR },
    ),
  );

  // Start Convex dev server (self-hosted)
  processes.push(
    await runProcess(["bunx", "convex", "dev"], {
      cwd: resolve(ROOT_DIR, "frontend"),
    }),
  );

  // Start frontend
  processes.push(
    await runProcess(["bun", "run", "dev"], {
      cwd: resolve(ROOT_DIR, "frontend"),
      env: { VITE_API_URL: "http://localhost:8787" },
    }),
  );

  // Wait for all processes
  await Promise.all(processes.map((p) => p.exited));
}

async function pushSecrets(config: Config): Promise<void> {
  if (config.BACKEND_MODE === "local") {
    console.error(colors.yellow("Local mode doesn't use Cloudflare secrets"));
    process.exit(1);
  }

  validateConfig(config);

  const secretsByMode: Record<BackendMode, (keyof Config)[]> = {
    local: [],
    datalab: ["DATALAB_API_KEY"],
    runpod: [
      "RUNPOD_API_KEY",
      "RUNPOD_ENDPOINT_ID",
            "S3_ENDPOINT",
      "S3_ACCESS_KEY",
      "S3_SECRET_KEY",
      "S3_BUCKET",
      "GOOGLE_API_KEY",
    ],
  };

  const keys = secretsByMode[config.BACKEND_MODE];
  const secrets = keys
    .filter((key) => config[key])
    .map((key) => ({ name: key, value: config[key] as string }));

  if (secrets.length === 0) {
    console.log(colors.yellow("No secrets to push"));
    return;
  }

  console.log(colors.cyan(`\nPushing secrets for ${config.BACKEND_MODE} environment...\n`));

  for (const secret of secrets) {
    const proc = spawn({
      cmd: [
        "wrangler",
        "secret",
        "put",
        secret.name,
        "--env",
        config.BACKEND_MODE,
      ],
      cwd: resolve(ROOT_DIR, "api"),
      stdin: new TextEncoder().encode(secret.value),
      stdout: "pipe",
      stderr: "pipe",
    });

    await proc.exited;

    if (proc.exitCode === 0) {
      console.log(`  ${secret.name} ${colors.green("✓")}`);
    } else {
      const stderr = await new Response(proc.stderr).text();
      console.log(`  ${secret.name} ${colors.red("✗")} ${stderr.trim()}`);
    }
  }

  console.log(colors.green("\nSecrets pushed!"));
}

async function deploy(config: Config): Promise<void> {
  if (config.BACKEND_MODE === "local") {
    console.error(
      colors.yellow("Warning: local mode cannot be deployed to production"),
    );
    console.log("Change BACKEND_MODE to 'runpod' or 'datalab' in .env.local");
    process.exit(1);
  }

  validateConfig(config);

  // Require Convex Cloud for production deployment
  const missingConvex: string[] = [];
  if (!config.CONVEX_URL) missingConvex.push("CONVEX_URL");
  if (!config.CONVEX_DEPLOYMENT) missingConvex.push("CONVEX_DEPLOYMENT");

  if (missingConvex.length > 0) {
    console.error(colors.red("Convex Cloud is required for production deployment:"));
    missingConvex.forEach((v) => console.error(`  - ${v}`));
    console.log("\nRun `bunx convex dev` in frontend/ to create a deployment,");
    console.log("then add CONVEX_DEPLOYMENT and CONVEX_URL to .env.local");
    process.exit(1);
  }

  console.log(
    colors.green(`\nDeploying with ${config.BACKEND_MODE} backend...\n`),
  );

  // Deploy API
  console.log(colors.cyan("Deploying API worker..."));
  const apiDeploy = await runProcess(
    ["bun", "run", `deploy:${config.BACKEND_MODE}`],
    { cwd: resolve(ROOT_DIR, "api") },
  );
  await apiDeploy.exited;

  // Build frontend
  console.log(colors.cyan("\nBuilding frontend..."));
  if (!config.DEPLOY_API_URL) {
    console.error(colors.red("DEPLOY_API_URL is required for deployment"));
    console.log("Set it in .env.local to your deployed API URL");
    process.exit(1);
  }
  // Derive Convex site URL from Convex URL
  // e.g., https://foo.convex.cloud -> https://foo.convex.site
  const convexSiteUrl = config.CONVEX_URL!.replace(".convex.cloud", ".convex.site");

  const frontendBuild = await runProcess(["bun", "run", "build"], {
    cwd: resolve(ROOT_DIR, "frontend"),
    env: {
      VITE_API_URL: config.DEPLOY_API_URL,
      VITE_CONVEX_URL: config.CONVEX_URL,
      VITE_CONVEX_SITE_URL: convexSiteUrl,
    },
  });
  await frontendBuild.exited;

  // Deploy frontend
  console.log(colors.cyan("\nDeploying frontend..."));
  const frontendDeploy = await runProcess(
    [
      "wrangler",
      "pages",
      "deploy",
      "frontend/dist",
      "--project-name",
      "academic-reader",
    ],
    { cwd: ROOT_DIR },
  );
  await frontendDeploy.exited;

  console.log(colors.green("\nDeployment complete!"));
}

// CLI entry point
const args = process.argv.slice(2);
const command = args[0];
const modeIndex = args.indexOf("--mode");
const modeOverride = modeIndex !== -1 ? args[modeIndex + 1] : undefined;

switch (command) {
  case "status": {
    const config = loadConfig(modeOverride);
    showStatus(config);
    break;
  }
  case "sync": {
    const config = loadConfig(modeOverride);
    syncConfigs(config);
    break;
  }
  case "dev": {
    const config = loadConfig(modeOverride);
    await startDev(config);
    break;
  }
  case "deploy": {
    const config = loadConfig(modeOverride);
    await deploy(config);
    break;
  }
  case "secrets": {
    const config = loadConfig(modeOverride);
    await pushSecrets(config);
    break;
  }
  default:
    console.log(`
${colors.bold("Academic Reader Dev Script")}

Usage: bun scripts/dev.ts <command> [options]

Commands:
  ${colors.cyan("status")}    Show current configuration
  ${colors.cyan("sync")}      Sync .env.local to tool-specific files
  ${colors.cyan("dev")}       Start development servers
  ${colors.cyan("secrets")}   Push secrets to Cloudflare Workers
  ${colors.cyan("deploy")}    Deploy to Cloudflare

Options:
  ${colors.cyan("--mode <mode>")}   Override BACKEND_MODE (local/runpod/datalab)

Modes (dev):
  ${colors.cyan("local")}    Docker worker + self-hosted Convex + Vite
  ${colors.cyan("datalab")}  Datalab API + self-hosted Convex + Vite
  ${colors.cyan("runpod")}   Runpod + MinIO + self-hosted Convex + Vite

Modes (deploy):
  ${colors.cyan("datalab")}  Datalab API + Convex Cloud
  ${colors.cyan("runpod")}   Runpod + S3 + Convex Cloud

Examples:
  bun scripts/dev.ts dev                  # Use mode from .env.local
  bun scripts/dev.ts dev --mode datalab   # Override to datalab
  bun scripts/dev.ts status               # Check configuration
`);
    break;
}
