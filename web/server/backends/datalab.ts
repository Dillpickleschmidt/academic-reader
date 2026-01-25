import type { ConversionBackend } from "./interface"
import type { ConversionInput, ConversionJob } from "../types"
import { mapDatalabResponse, type DatalabResponse } from "./response-mapper"

const TIMEOUT_MS = 300_000 // 5 minutes per request

interface DatalabConfig {
  apiKey: string
}

/**
 * Datalab backend - hosted Marker API from Datalab.
 * API docs: https://www.datalab.to/docs/marker
 */
class DatalabBackend implements ConversionBackend {
  readonly name = "datalab"
  private config: DatalabConfig
  private readonly baseUrl = "https://www.datalab.to/api/v1/marker"

  constructor(config: DatalabConfig) {
    this.config = config
  }

  async submitJob(input: ConversionInput): Promise<string> {
    const formData = new FormData()

    // Direct file upload - Datalab accepts file as multipart form data
    if (!input.fileData) {
      throw new Error("[datalab] fileData is required for direct upload")
    }

    // Convert Buffer to Uint8Array if needed (Blob accepts Uint8Array but not Buffer)
    const fileBytes = Buffer.isBuffer(input.fileData)
      ? new Uint8Array(input.fileData)
      : input.fileData
    const blob = new Blob([fileBytes], { type: "application/pdf" })
    formData.append("file", blob, input.filename || "document.pdf")

    // Request all output formats with block IDs for TTS
    formData.append("output_format", "html,markdown,json,chunks")
    formData.append("add_block_ids", "true")

    // Processing mode: fast, balanced, or accurate
    formData.append("mode", input.processingMode)

    if (input.pageRange) {
      formData.append("page_range", input.pageRange)
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "X-API-Key": this.config.apiKey,
      },
      body: formData,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`[datalab] Submit failed: ${error}`)
    }

    const data = (await response.json()) as {
      request_id: string
      status: string
    }
    return data.request_id
  }

  async getJobStatus(jobId: string): Promise<ConversionJob> {
    const response = await fetch(`${this.baseUrl}/${jobId}`, {
      headers: {
        "X-API-Key": this.config.apiKey,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`[datalab] Failed to get job status (${response.status}): ${body}`)
    }

    const data = (await response.json()) as DatalabResponse
    return mapDatalabResponse(data)
  }

  supportsStreaming(): boolean {
    return false
  }

  supportsCancellation(): boolean {
    return false
  }
}

/**
 * Create Datalab backend from environment.
 */
export function createDatalabBackend(env: {
  DATALAB_API_KEY?: string
}): DatalabBackend {
  if (!env.DATALAB_API_KEY) {
    throw new Error("Datalab backend requires DATALAB_API_KEY")
  }

  return new DatalabBackend({
    apiKey: env.DATALAB_API_KEY,
  })
}
