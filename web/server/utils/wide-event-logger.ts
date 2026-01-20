/**
 * Wide event utilities for structured logging.
 * One comprehensive log per request with all relevant context.
 */

import { SeverityNumber } from "@opentelemetry/api-logs"
import { logger } from "../otel"
import type { BackendType, WideEvent } from "../types"
import pkg from "../../../package.json"

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
 * Emit a wide event via OpenTelemetry.
 * Sends to Alloy/Loki in production, console in development.
 */
export function emitEvent(event: WideEvent): void {
  // Remove null/undefined and serialize non-primitives for OTel attributes
  const clean = Object.fromEntries(
    Object.entries(event)
      .filter(([, v]) => v != null)
      .map(([k, v]) => {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          return [k, v]
        }
        return [k, JSON.stringify(v)]
      })
  ) as Record<string, string | number | boolean>

  const severityNumber = event.error ? SeverityNumber.ERROR : SeverityNumber.INFO
  const severityText = event.error ? "ERROR" : "INFO"

  logger.emit({
    severityNumber,
    severityText,
    attributes: clean,
  })
}

