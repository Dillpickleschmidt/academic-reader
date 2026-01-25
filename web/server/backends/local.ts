import type { ConversionBackend } from "./interface"
import type { ConversionInput, ConversionJob } from "../types"
import { parseJobId, prefixJobId } from "./job-id"
import { workerNotConfiguredError } from "./errors"
import { mapLocalResponse, type LocalWorkerResponse } from "./response-mapper"

const TIMEOUT_MS = 30_000

interface LocalConfig {
  baseUrl: string
  lightonocrUrl?: string
}

/**
 * Local backend - passes through to FastAPI workers running locally.
 * Routes to Marker (fast mode) or LightOnOCR (accurate mode) based on processingMode.
 */
export class LocalBackend implements ConversionBackend {
  readonly name = "local"
  private markerUrl: string
  private lightonocrUrl: string | null

  constructor(config: LocalConfig) {
    this.markerUrl = config.baseUrl.replace(/\/+$/, "")
    this.lightonocrUrl = config.lightonocrUrl?.replace(/\/+$/, "") ?? null
  }

  /**
   * Get base URL and raw job ID from a prefixed job ID.
   */
  private getWorkerUrl(jobId: string): { baseUrl: string; rawJobId: string } {
    const { worker, rawId } = parseJobId(jobId)

    if (worker === "lightonocr") {
      if (!this.lightonocrUrl) {
        throw workerNotConfiguredError("local", "LightOnOCR")
      }
      return { baseUrl: this.lightonocrUrl, rawJobId: rawId }
    }

    return { baseUrl: this.markerUrl, rawJobId: rawId }
  }

  async submitJob(input: ConversionInput): Promise<string> {
    const useLightOnOCR = input.processingMode === "accurate"

    // Validate LightOnOCR endpoint if needed
    if (useLightOnOCR && !this.lightonocrUrl) {
      throw workerNotConfiguredError("local", "LightOnOCR")
    }

    if (useLightOnOCR) {
      // LightOnOCR: simple API with file_url and page_range
      const params = new URLSearchParams()
      if (input.fileUrl) {
        params.set("file_url", input.fileUrl)
      }
      if (input.pageRange) {
        params.set("page_range", input.pageRange)
      }

      const response = await fetch(`${this.lightonocrUrl}/convert?${params}`, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`[local] LightOnOCR submit failed: ${error}`)
      }

      const data = (await response.json()) as { job_id: string }
      return prefixJobId(data.job_id, "lightonocr")
    } else {
      // Marker: existing API with file_id path param
      const params = new URLSearchParams({
        output_format: input.outputFormat,
        use_llm: String(input.useLlm),
      })

      if (input.pageRange) {
        params.set("page_range", input.pageRange)
      }

      if (input.fileUrl) {
        params.set("file_url", input.fileUrl)
      }

      const response = await fetch(
        `${this.markerUrl}/convert/${input.fileId}?${params}`,
        { method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS) },
      )

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`[local] Marker submit failed: ${error}`)
      }

      const data = (await response.json()) as { job_id: string }
      return prefixJobId(data.job_id, "marker")
    }
  }

  async getJobStatus(jobId: string): Promise<ConversionJob> {
    const { baseUrl, rawJobId } = this.getWorkerUrl(jobId)
    const response = await fetch(`${baseUrl}/jobs/${rawJobId}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`[local] Failed to get job status (${response.status}): ${body}`)
    }

    const data = (await response.json()) as LocalWorkerResponse
    return mapLocalResponse(data)
  }

  supportsStreaming(): boolean {
    return true
  }

  getStreamUrl(jobId: string): string {
    const { baseUrl, rawJobId } = this.getWorkerUrl(jobId)
    // Note: LightOnOCR doesn't support streaming, but this returns the URL anyway
    // The frontend should check for stream availability
    return `${baseUrl}/jobs/${rawJobId}/stream`
  }

  supportsCancellation(): boolean {
    return true
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const { baseUrl, rawJobId } = this.getWorkerUrl(jobId)
    try {
      const response = await fetch(`${baseUrl}/cancel/${rawJobId}`, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      return response.ok
    } catch (error) {
      console.warn(`[Local] Failed to cancel job ${jobId}:`, error)
      return false
    }
  }
}

/**
 * Create Local backend from environment.
 */
export function createLocalBackend(env: {
  LOCAL_WORKER_URL?: string
  LIGHTONOCR_WORKER_URL?: string
}): LocalBackend {
  return new LocalBackend({
    baseUrl: env.LOCAL_WORKER_URL || "http://localhost:8000",
    lightonocrUrl: env.LIGHTONOCR_WORKER_URL,
  })
}
