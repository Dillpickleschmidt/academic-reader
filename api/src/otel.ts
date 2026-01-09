/**
 * OpenTelemetry initialization for logs.
 * Preload this file with: bun --preload ./src/otel.ts
 */

import {
  LoggerProvider,
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
} from "@opentelemetry/sdk-logs"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions"
import pkg from "../package.json"

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: "academic-reader-api",
  [ATTR_SERVICE_VERSION]: pkg.version,
})

const processor = endpoint
  ? new BatchLogRecordProcessor(
      new OTLPLogExporter({ url: `${endpoint}/v1/logs` })
    )
  : new BatchLogRecordProcessor(new ConsoleLogRecordExporter())

if (endpoint) {
  console.log(`[otel] Exporting logs to ${endpoint}/v1/logs`)
} else {
  console.log("[otel] No OTEL_EXPORTER_OTLP_ENDPOINT set, using console exporter")
}

const loggerProvider = new LoggerProvider({
  resource,
  processors: [processor],
})

// Graceful shutdown
process.on("SIGTERM", async () => {
  await loggerProvider.shutdown()
})

process.on("SIGINT", async () => {
  await loggerProvider.shutdown()
})

export const logger = loggerProvider.getLogger("wide-events")
