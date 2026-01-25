/**
 * Simple error helpers for conversion backends.
 */

export type BackendName = "local" | "runpod" | "datalab"

/**
 * Create a "worker not configured" error.
 */
export function workerNotConfiguredError(
  backend: BackendName,
  workerName: string,
): Error {
  return new Error(`[${backend}] ${workerName} worker is not configured`)
}
