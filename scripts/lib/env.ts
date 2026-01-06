import type { Env } from "./types";
import { colors } from "./utils";

// =============================================================================
// Validation Rules
// =============================================================================

type EnvRule = {
  key: string;
  required?: boolean | ((env: Env) => boolean);
  message?: string;
};

// prettier-ignore
export const devEnvRules: EnvRule[] = [
  { key: "DEV_BACKEND_MODE", required: true, message: "Set DEV_BACKEND_MODE to 'local', 'datalab', or 'runpod'" },
  { key: "SITE_URL", required: true },
  { key: "GOOGLE_API_KEY", required: (env) => env.DEV_BACKEND_MODE !== "datalab" },
  { key: "DATALAB_API_KEY", required: (env) => env.DEV_BACKEND_MODE === "datalab" },
  { key: "RUNPOD_API_KEY", required: (env) => env.DEV_BACKEND_MODE === "runpod" },
  { key: "RUNPOD_ENDPOINT_ID", required: (env) => env.DEV_BACKEND_MODE === "runpod" },
];

// prettier-ignore
export const deployEnvRules: EnvRule[] = [
  { key: "PROD_BACKEND_MODE", required: (env) => env.PROD_BACKEND_MODE !== "local", message: "Set PROD_BACKEND_MODE to 'datalab' or 'runpod'" },
  { key: "PROD_VPS_HOST_IP", required: true },
  { key: "PROD_VPS_USER", required: true },
  { key: "PROD_VPS_PATH", required: true },
  { key: "PROD_DOMAIN", required: true },
  { key: "PROD_CLOUDFLARE_PROJECT", required: true },
  // Mode-specific
  { key: "DATALAB_API_KEY", required: (env) => env.PROD_BACKEND_MODE === "datalab" },
  { key: "RUNPOD_API_KEY", required: (env) => env.PROD_BACKEND_MODE === "runpod" },
  { key: "RUNPOD_ENDPOINT_ID", required: (env) => env.PROD_BACKEND_MODE === "runpod" },
  { key: "GOOGLE_API_KEY", required: (env) => env.PROD_BACKEND_MODE === "runpod" },
  { key: "PROD_S3_ENDPOINT", required: (env) => env.PROD_BACKEND_MODE === "runpod" },
  { key: "PROD_S3_ACCESS_KEY", required: (env) => env.PROD_BACKEND_MODE === "runpod" },
  { key: "PROD_S3_SECRET_KEY", required: (env) => env.PROD_BACKEND_MODE === "runpod" },
  { key: "PROD_S3_BUCKET", required: (env) => env.PROD_BACKEND_MODE === "runpod" },
];

// =============================================================================
// VPS Environment Mapping
// =============================================================================

const vpsEnvMapping = [
  "CLOUDFLARE_TUNNEL_TOKEN",
  "DATALAB_API_KEY",
  "RUNPOD_API_KEY",
  "RUNPOD_ENDPOINT_ID",
  "GOOGLE_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "PROD_S3_ENDPOINT",
  "PROD_S3_ACCESS_KEY",
  "PROD_S3_SECRET_KEY",
  "PROD_S3_BUCKET",
] as const;

// =============================================================================
// Helpers
// =============================================================================

export function validateEnv(env: Env, rules: EnvRule[]): void {
  const errors: string[] = [];

  for (const rule of rules) {
    const isRequired =
      typeof rule.required === "function" ? rule.required(env) : rule.required;

    if (isRequired && !env[rule.key]) {
      errors.push(rule.message || `Missing ${rule.key}`);
    }
  }

  if (errors.length) {
    errors.forEach((e) => console.error(colors.red(e)));
    process.exit(1);
  }
}

export function buildVpsEnv(env: Env, derived: Record<string, string>): string {
  const lines = [...vpsEnvMapping]
    .filter((key) => env[key])
    .map((key) => `${key}=${env[key]}`);

  for (const [key, value] of Object.entries(derived)) {
    lines.push(`${key}=${value}`);
  }

  return lines.join("\n");
}
