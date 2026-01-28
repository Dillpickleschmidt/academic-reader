import { existsSync, readFileSync, writeFileSync } from "fs"
import { resolve, dirname } from "path"
import { spawn, spawnSync, type Subprocess } from "bun"
import type { Env } from "./types"

// =============================================================================
// Constants
// =============================================================================

export const ROOT_DIR = resolve(dirname(import.meta.path), "../..")
export const DEV_ENV_FILE = resolve(ROOT_DIR, ".env.local")

export const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
}

// =============================================================================
// Public API
// =============================================================================

export function loadEnv(modeOverride?: string): Env {
  if (!existsSync(DEV_ENV_FILE)) {
    console.error(colors.red("Error: .env.local not found"))
    console.log(`Run: ${colors.cyan("cp .env.local.example .env.local")}`)
    process.exit(1)
  }

  const env = parseEnvFile(DEV_ENV_FILE)
  env.BACKEND_MODE = modeOverride || env.BACKEND_MODE || "local"
  return env
}

export async function runProcess(
  cmd: string[],
  options?: { cwd?: string; env?: Record<string, string> },
): Promise<Subprocess> {
  return spawn({
    cmd,
    cwd: options?.cwd || ROOT_DIR,
    env: { ...getSystemEnv(), ...options?.env },
    stdout: "inherit",
    stderr: "inherit",
  })
}

export function runProcessSync(cmd: string[]): { success: boolean; output: string } {
  try {
    const result = spawnSync({
      cmd,
      cwd: ROOT_DIR,
      env: getSystemEnv(),
      stdout: "pipe",
      stderr: "pipe",
    })
    return {
      success: result.exitCode === 0,
      output: result.stdout.toString(),
    }
  } catch {
    // Command not found or other spawn error
    return { success: false, output: "" }
  }
}

export function generateBetterAuthSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const secret = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  const envContent = readFileSync(DEV_ENV_FILE, "utf-8")
  // Check for uncommented key with a value (not just a placeholder)
  const hasKey = /^BETTER_AUTH_SECRET=.+/m.test(envContent)
  if (!hasKey) {
    // Replace placeholder (commented or empty) in place, or append if not found
    const placeholder = /^#?\s*BETTER_AUTH_SECRET=.*$/m
    const newContent = placeholder.test(envContent)
      ? envContent.replace(placeholder, `BETTER_AUTH_SECRET=${secret}`)
      : envContent.trimEnd() + `\nBETTER_AUTH_SECRET=${secret}\n`
    writeFileSync(DEV_ENV_FILE, newContent)
    console.log(
      colors.green("Generated BETTER_AUTH_SECRET and saved to .env.local"),
    )
  }

  return secret
}

// =============================================================================
// Helpers
// =============================================================================

const SYSTEM_ENV_VARS = [
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "TERM",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "XDG_RUNTIME_DIR",
] as const

export function getSystemEnv(): Record<string, string> {
  const env: Record<string, string> = { BUN_CONFIG_NO_DOTENV: "1" }
  for (const key of SYSTEM_ENV_VARS) {
    if (process.env[key]) env[key] = process.env[key]!
  }
  return env
}

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}

  const content = readFileSync(path, "utf-8")
  const env: Record<string, string> = {}

  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const eqIndex = trimmed.indexOf("=")
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    } else {
      const commentIndex = value.indexOf(" #")
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim()
      }
    }

    env[key] = value
  }

  return env
}
