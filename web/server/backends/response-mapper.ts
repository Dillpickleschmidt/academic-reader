/**
 * Unified response mapping for all conversion backends.
 *
 * Each backend returns different response shapes - this module normalizes them
 * to a consistent ConversionJob format.
 */

import type { ChunkOutput, ConversionJob, JobStatus } from "../types"

// ============================================================================
// Raw response types from each backend
// ============================================================================

/**
 * Raw response from Local workers (Marker and CHANDRA).
 */
export interface LocalWorkerResponse {
  job_id: string
  status: "pending" | "processing" | "html_ready" | "completed" | "failed" | "cancelled"
  result?: {
    content: string
    metadata: Record<string, unknown>
    formats?: {
      html: string
      markdown: string
      chunks?: ChunkOutput
    }
    images?: Record<string, string>
  }
  html_content?: string
  error?: string
  progress?: {
    stage: string
    current: number
    total: number
    elapsed?: number
  }
}

/**
 * Raw response from Datalab hosted API.
 */
export interface DatalabResponse {
  request_id: string
  status: "pending" | "processing" | "complete" | "failed"
  success?: boolean
  markdown?: string
  html?: string
  json?: unknown
  chunks?: ChunkOutput
  error?: string
  images?: Record<string, string>
}

// ============================================================================
// Status mappings
// ============================================================================

const LOCAL_STATUS_MAP: Record<string, JobStatus> = {
  pending: "pending",
  processing: "processing",
  html_ready: "html_ready",
  completed: "completed",
  failed: "failed",
  cancelled: "failed",
}

const DATALAB_STATUS_MAP: Record<string, JobStatus> = {
  pending: "pending",
  processing: "processing",
  complete: "completed",
  failed: "failed",
}

// ============================================================================
// Mapper functions
// ============================================================================

/**
 * Map a Local worker response to ConversionJob.
 */
export function mapLocalResponse(data: LocalWorkerResponse): ConversionJob {
  const status = LOCAL_STATUS_MAP[data.status] ?? "failed"
  const isComplete = status === "completed"
  const result = data.result

  return {
    jobId: data.job_id,
    status,
    htmlContent: data.html_content || result?.formats?.html,
    result:
      isComplete && result
        ? {
            content: result.content,
            metadata: result.metadata,
            formats: result.formats
              ? {
                  html: result.formats.html,
                  markdown: result.formats.markdown,
                  chunks: result.formats.chunks,
                }
              : undefined,
            images: result.images,
          }
        : undefined,
    error: data.error,
    progress: data.progress,
  }
}

/**
 * Map a Datalab response to ConversionJob.
 */
export function mapDatalabResponse(data: DatalabResponse): ConversionJob {
  // Datalab uses success=false for failures even when status is "complete"
  const rawStatus = data.status === "complete" && !data.success ? "failed" : data.status
  const status = DATALAB_STATUS_MAP[rawStatus] ?? "failed"
  const isComplete = status === "completed"
  const rawHtml = data.html ?? ""

  return {
    jobId: data.request_id,
    status,
    htmlContent: isComplete ? rawHtml : undefined,
    result: isComplete
      ? {
          content: rawHtml,
          metadata: {},
          formats: {
            html: rawHtml,
            markdown: data.markdown ?? "",
            chunks: data.chunks,
          },
          images: data.images,
        }
      : undefined,
    error: data.error,
  }
}
