/**
 * Wide event utilities for structured logging.
 * One comprehensive log per request with all relevant context.
 */

import type { BackendType, WideEvent } from "../types"
import pkg from "../../package.json"

interface WideEventEnv {
  backendMode: BackendType
  siteUrl?: string
}

/**
 * Create initial wide event with request metadata.
 */
export function createWideEvent(
  method: string,
  path: string,
  env: WideEventEnv
): WideEvent {
  return {
    requestId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    service: "academic-reader-api",
    version: pkg.version,
    environment: env.backendMode,
    deployment: env.siteUrl?.includes("localhost") ? "dev" : "prod",
    method,
    path,
  }
}

/**
 * Emit a wide event.
 * Currently logs to console as JSON.
 * Can be updated later to use OTel for export to Axiom/Grafana.
 */
export function emitEvent(event: WideEvent): void {
  // Remove undefined values for cleaner output
  const clean = Object.fromEntries(
    Object.entries(event).filter(([, v]) => v !== undefined)
  )
  console.log(JSON.stringify(clean))
}

