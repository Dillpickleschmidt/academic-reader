/**
 * Shared job ID utilities for routing between Marker and LightOnOCR workers.
 *
 * Job IDs are prefixed to identify which worker to query:
 * - "marker:abc123" → Marker worker (fast mode)
 * - "lightonocr:abc123" → LightOnOCR worker (accurate mode)
 * - "abc123" → Legacy format, assumed to be Marker
 */

export type WorkerType = "marker" | "lightonocr"

/**
 * Prefix a raw job ID with the worker type.
 */
export function prefixJobId(rawId: string, worker: WorkerType): string {
  return `${worker}:${rawId}`
}

/**
 * Parse a prefixed job ID to extract the worker type and raw ID.
 */
export function parseJobId(jobId: string): { worker: WorkerType; rawId: string } {
  if (jobId.startsWith("lightonocr:")) {
    return { worker: "lightonocr", rawId: jobId.slice(11) }
  }
  if (jobId.startsWith("marker:")) {
    return { worker: "marker", rawId: jobId.slice(7) }
  }
  // Legacy: no prefix, assume marker
  return { worker: "marker", rawId: jobId }
}

/**
 * Determine which worker to use based on processing mode.
 */
export function getWorkerFromProcessingMode(
  processingMode: string | undefined,
): WorkerType {
  return processingMode === "accurate" ? "lightonocr" : "marker"
}
