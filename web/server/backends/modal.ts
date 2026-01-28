import type { ConversionBackend } from "./interface"
import type { ConversionInput, ConversionJob, JobStatus } from "../types"
import type { Storage } from "../storage/types"
import { prefixJobId, parseJobId, type WorkerType } from "./job-id"
import { workerNotConfiguredError } from "./errors"

const TIMEOUT_MS = 30_000

const STATUS_MAP: Record<string, JobStatus> = {
  IN_PROGRESS: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
}

interface ModalEndpoints {
  marker: string
  lightonocr?: string
  chandra?: string
}

/**
 * Modal backend for conversion workers.
 * Supports marker (fast), lightonocr (balanced), and chandra (aggressive) modes.
 */
export class ModalBackend implements ConversionBackend {
  readonly name = "modal"
  private endpoints: ModalEndpoints
  private storage: Storage

  constructor(endpoints: ModalEndpoints, storage: Storage) {
    this.endpoints = endpoints
    this.storage = storage
  }

  async submitJob(input: ConversionInput): Promise<string> {
    const useChandra = input.processingMode === "aggressive"
    const useLightOnOcr = input.processingMode === "balanced"

    // Validate endpoint availability
    if (useChandra && !this.endpoints.chandra) {
      throw workerNotConfiguredError("modal", "CHANDRA")
    }
    if (useLightOnOcr && !this.endpoints.lightonocr) {
      throw workerNotConfiguredError("modal", "LightOnOCR")
    }

    // Generate presigned URL for result upload
    if (!input.documentPath) {
      throw new Error("[modal] documentPath is required for result upload")
    }
    const resultKey = `${input.documentPath}/result.json`
    const { uploadUrl: resultUploadUrl } = await this.storage.getPresignedUploadUrl(resultKey)

    // Build payload based on endpoint
    let endpoint: string
    let workerType: WorkerType

    if (useChandra) {
      endpoint = this.endpoints.chandra!
      workerType = "chandra"
    } else if (useLightOnOcr) {
      endpoint = this.endpoints.lightonocr!
      workerType = "lightonocr"
    } else {
      endpoint = this.endpoints.marker
      workerType = "marker"
    }

    const res = await fetch(`${endpoint}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_url: input.fileUrl,
        result_upload_url: resultUploadUrl,
        use_llm: input.useLlm,
        page_range: input.pageRange || null,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!res.ok) {
      throw new Error(`[modal] Submit failed: ${await res.text()}`)
    }

    const data = (await res.json()) as { id: string }
    return prefixJobId(data.id, workerType)
  }

  async getJobStatus(jobId: string): Promise<ConversionJob> {
    const { worker, rawId } = parseJobId(jobId)
    const endpoint = this.getEndpointForWorker(worker)

    const res = await fetch(`${endpoint}/status/${rawId}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!res.ok) {
      throw new Error(`[modal] Failed to get job status: ${await res.text()}`)
    }

    const data = (await res.json()) as {
      status: string
      output?: { s3_result?: boolean }
      error?: string
    }

    return {
      jobId,
      status: STATUS_MAP[data.status] ?? "pending",
      s3Result: data.output?.s3_result,
      error: data.error,
    }
  }

  supportsStreaming(): boolean {
    return false
  }

  supportsCancellation(): boolean {
    return false
  }

  // Private helpers

  private getEndpointForWorker(worker: WorkerType): string {
    if (worker === "chandra") {
      if (!this.endpoints.chandra) {
        throw workerNotConfiguredError("modal", "CHANDRA")
      }
      return this.endpoints.chandra
    }

    if (worker === "lightonocr") {
      if (!this.endpoints.lightonocr) {
        throw workerNotConfiguredError("modal", "LightOnOCR")
      }
      return this.endpoints.lightonocr
    }

    return this.endpoints.marker
  }
}
