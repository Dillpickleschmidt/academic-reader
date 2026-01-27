import type { ConversionBackend } from "./interface"
import type { ConversionInput, ConversionJob } from "../types"
import { parseJobId, prefixJobId } from "./job-id"
import { workerNotConfiguredError } from "./errors"
import { mapRunpodResponse, type RunpodResponse } from "./response-mapper"

const TIMEOUT_MS = 30_000

interface RunpodConfig {
  markerEndpointId: string
  lightOnOcrEndpointId?: string
  chandraEndpointId?: string
  apiKey: string
}

/**
 * Runpod backend - self-hosted serverless GPU on Runpod.
 */
class RunpodBackend implements ConversionBackend {
  readonly name = "runpod"
  private config: RunpodConfig
  private markerBaseUrl: string
  private lightOnOcrBaseUrl: string | null
  private chandraBaseUrl: string | null

  constructor(config: RunpodConfig) {
    this.config = config
    this.markerBaseUrl = `https://api.runpod.ai/v2/${config.markerEndpointId}`
    this.lightOnOcrBaseUrl = config.lightOnOcrEndpointId
      ? `https://api.runpod.ai/v2/${config.lightOnOcrEndpointId}`
      : null
    this.chandraBaseUrl = config.chandraEndpointId
      ? `https://api.runpod.ai/v2/${config.chandraEndpointId}`
      : null
  }

  async submitJob(input: ConversionInput): Promise<string> {
    const useChandra = input.processingMode === "aggressive"
    const useLightOnOcr = input.processingMode === "balanced"

    // Validate endpoint availability
    if (useChandra && !this.chandraBaseUrl) {
      throw workerNotConfiguredError("runpod", "CHANDRA")
    }
    if (useLightOnOcr && !this.lightOnOcrBaseUrl) {
      throw workerNotConfiguredError("runpod", "LightOnOCR")
    }

    // Build payload based on endpoint
    let inputPayload: Record<string, unknown>
    let baseUrl: string
    let workerType: "marker" | "lightonocr" | "chandra"

    if (useChandra) {
      inputPayload = {
        file_url: input.fileUrl,
        mime_type: input.mimeType,
        page_range: input.pageRange || undefined,
      }
      baseUrl = this.chandraBaseUrl!
      workerType = "chandra"
    } else if (useLightOnOcr) {
      inputPayload = {
        file_url: input.fileUrl,
        mime_type: input.mimeType,
        page_range: input.pageRange || undefined,
      }
      baseUrl = this.lightOnOcrBaseUrl!
      workerType = "lightonocr"
    } else {
      inputPayload = {
        file_url: input.fileUrl,
        use_llm: input.useLlm,
        page_range: input.pageRange,
      }
      baseUrl = this.markerBaseUrl
      workerType = "marker"
    }

    const body: Record<string, unknown> = { input: inputPayload }

    const response = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`[runpod] Submit failed (${response.status}): ${error}`)
    }

    const data = (await response.json()) as { id?: string }
    if (typeof data.id !== "string" || data.id.trim() === "") {
      throw new Error(
        `[runpod] Invalid job ID returned: ${JSON.stringify(data)}`,
      )
    }

    // Prefix job ID to track which endpoint it belongs to
    return prefixJobId(data.id, workerType)
  }

  async getJobStatus(jobId: string): Promise<ConversionJob> {
    const { baseUrl, rawJobId } = this.getWorkerUrl(jobId)
    const response = await fetch(`${baseUrl}/status/${rawJobId}`, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`[runpod] Failed to get job status (${response.status}): ${body}`)
    }

    const data = (await response.json()) as RunpodResponse
    return mapRunpodResponse(data)
  }

  supportsStreaming(): boolean {
    return false
  }

  supportsCancellation(): boolean {
    return true
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const { baseUrl, rawJobId } = this.getWorkerUrl(jobId)
    try {
      const response = await fetch(`${baseUrl}/cancel/${rawJobId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      return response.ok
    } catch (error) {
      console.warn(`[Runpod] Failed to cancel job ${jobId}:`, error)
      return false
    }
  }

  // Private helpers

  /**
   * Get base URL and raw job ID from a prefixed job ID.
   */
  private getWorkerUrl(jobId: string): { baseUrl: string; rawJobId: string } {
    const { worker, rawId } = parseJobId(jobId)

    if (worker === "chandra") {
      if (!this.chandraBaseUrl) {
        throw workerNotConfiguredError("runpod", "CHANDRA")
      }
      return { baseUrl: this.chandraBaseUrl, rawJobId: rawId }
    }

    if (worker === "lightonocr") {
      if (!this.lightOnOcrBaseUrl) {
        throw workerNotConfiguredError("runpod", "LightOnOCR")
      }
      return { baseUrl: this.lightOnOcrBaseUrl, rawJobId: rawId }
    }

    return { baseUrl: this.markerBaseUrl, rawJobId: rawId }
  }
}

/**
 * Create Runpod backend from environment.
 */
export function createRunpodBackend(env: {
  RUNPOD_MARKER_ENDPOINT_ID?: string
  RUNPOD_LIGHTONOCR_ENDPOINT_ID?: string
  RUNPOD_CHANDRA_ENDPOINT_ID?: string
  RUNPOD_API_KEY?: string
}): RunpodBackend {
  if (!env.RUNPOD_MARKER_ENDPOINT_ID || !env.RUNPOD_API_KEY) {
    throw new Error(
      "Runpod backend requires RUNPOD_MARKER_ENDPOINT_ID and RUNPOD_API_KEY",
    )
  }

  return new RunpodBackend({
    markerEndpointId: env.RUNPOD_MARKER_ENDPOINT_ID,
    lightOnOcrEndpointId: env.RUNPOD_LIGHTONOCR_ENDPOINT_ID,
    chandraEndpointId: env.RUNPOD_CHANDRA_ENDPOINT_ID,
    apiKey: env.RUNPOD_API_KEY,
  })
}
