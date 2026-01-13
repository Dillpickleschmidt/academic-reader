import { Hono } from "hono"
import type { BackendType } from "../types"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { Storage } from "../storage/types"
import { S3Storage } from "../storage/s3"
import { tryCatch, getErrorMessage } from "../utils/try-catch"

// Worker upload response type and validator
type WorkerUploadResponse = { file_id: string; filename: string; size: number }

function isWorkerUploadResponse(v: unknown): v is WorkerUploadResponse {
  return (
    typeof v === "object" && v !== null &&
    "file_id" in v && typeof v.file_id === "string" &&
    "filename" in v && typeof v.filename === "string" &&
    "size" in v && typeof v.size === "number"
  )
}

type Variables = {
  storage: Storage
}

export const upload = new Hono<{ Variables: Variables }>()

// Upload file directly
upload.post("/upload", async (c) => {
  const event = c.get("event")
  const backend = process.env.BACKEND_MODE || "local"
  event.backend = backend as BackendType

  // Local mode: passthrough to FastAPI worker
  if (backend === "local") {
    const localUrl = process.env.LOCAL_WORKER_URL || "http://localhost:8000"

    const formDataResult = await tryCatch(c.req.formData())
    if (!formDataResult.success) {
      event.error = { category: "validation", message: getErrorMessage(formDataResult.error), code: "FORM_PARSE_ERROR" }
      return c.json({ error: "Invalid form data" }, { status: 400 })
    }

    const responseResult = await tryCatch(
      fetch(`${localUrl}/upload`, {
        method: "POST",
        body: formDataResult.data,
        signal: AbortSignal.timeout(30_000),
      })
    )
    if (!responseResult.success) {
      event.error = { category: "network", message: getErrorMessage(responseResult.error), code: "LOCAL_WORKER_ERROR" }
      return c.json({ error: "Failed to connect to worker" }, { status: 502 })
    }
    const response = responseResult.data

    if (!response.ok) {
      const errorText = await response.text()
      event.error = { category: "backend", message: errorText, code: "LOCAL_WORKER_REJECTED" }
      return c.json({ error: errorText }, response.status as ContentfulStatusCode)
    }

    const result: unknown = await response.json()
    if (!isWorkerUploadResponse(result)) {
      event.error = { category: "backend", message: "Invalid response from worker", code: "INVALID_WORKER_RESPONSE" }
      return c.json({ error: "Invalid response from worker" }, { status: 502 })
    }
    event.fileId = result.file_id
    event.filename = result.filename
    event.fileSize = result.size
    return c.json(result)
  }

  // Datalab/Runpod modes: upload to unified storage
  if (backend === "datalab" || backend === "runpod") {
    const storage = c.get("storage")

    const formDataResult = await tryCatch(c.req.formData())
    if (!formDataResult.success) {
      event.error = { category: "validation", message: getErrorMessage(formDataResult.error), code: "FORM_PARSE_ERROR" }
      return c.json({ error: "Invalid form data" }, { status: 400 })
    }

    const file = formDataResult.data.get("file") as File | null
    if (!file || typeof file === "string") {
      event.error = { category: "validation", message: "No file provided", code: "MISSING_FILE" }
      return c.json({ error: "No file provided" }, { status: 400 })
    }

    event.filename = file.name
    event.contentType = file.type

    const arrayBufferResult = await tryCatch(file.arrayBuffer())
    if (!arrayBufferResult.success) {
      event.error = { category: "validation", message: getErrorMessage(arrayBufferResult.error), code: "FILE_READ_ERROR" }
      return c.json({ error: "Failed to read file" }, { status: 500 })
    }

    event.fileSize = arrayBufferResult.data.byteLength

    const uploadResult = await tryCatch(
      storage.uploadFile(arrayBufferResult.data, file.name, file.type || "application/pdf")
    )
    if (!uploadResult.success) {
      event.error = { category: "storage", message: getErrorMessage(uploadResult.error), code: "UPLOAD_ERROR" }
      return c.json({ error: "Upload failed" }, { status: 500 })
    }

    event.fileId = uploadResult.data.fileId
    return c.json({
      file_id: uploadResult.data.fileId,
      filename: uploadResult.data.filename,
      size: uploadResult.data.size,
    })
  }

  event.error = { category: "validation", message: `Unknown backend: ${backend}`, code: "UNKNOWN_BACKEND" }
  return c.json({ error: `Unknown backend: ${backend}` }, { status: 400 })
})

// Get presigned upload URL (S3 only - production)
upload.post("/upload-url", async (c) => {
  const event = c.get("event")
  const backend = process.env.BACKEND_MODE || "local"
  event.backend = backend as BackendType

  const storage = c.get("storage")

  // Presigned URLs only work with S3Storage
  if (!(storage instanceof S3Storage)) {
    event.error = { category: "validation", message: "Presigned URLs require S3 storage", code: "WRONG_STORAGE" }
    return c.json({ error: "Presigned URLs require S3 storage" }, { status: 400 })
  }

  const bodyResult = await tryCatch(c.req.json<{ filename: string }>())
  if (!bodyResult.success) {
    event.error = { category: "validation", message: getErrorMessage(bodyResult.error), code: "JSON_PARSE_ERROR" }
    return c.json({ error: "Invalid request body" }, { status: 400 })
  }

  event.filename = bodyResult.data.filename

  const urlResult = await tryCatch(storage.getPresignedUploadUrl(bodyResult.data.filename))
  if (!urlResult.success) {
    event.error = { category: "storage", message: getErrorMessage(urlResult.error), code: "PRESIGN_URL_ERROR" }
    return c.json({ error: "Failed to generate upload URL" }, { status: 500 })
  }

  event.fileId = urlResult.data.fileId
  return c.json(urlResult.data)
})

/**
 * Validate URL for SSRF protection (defense-in-depth, complements iptables rules).
 * Returns error message if blocked, null if allowed.
 */
function validateExternalUrl(urlString: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    return "Invalid URL"
  }

  // Only allow http/https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only http/https URLs allowed"
  }

  const hostname = parsed.hostname.toLowerCase()

  // Block obvious internal hostnames
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal"
  ) {
    return "URL not allowed"
  }

  // Block private/internal IP ranges
  // Note: This can be bypassed via DNS, iptables is the real protection
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number)
    if (
      a === 127 ||                          // 127.0.0.0/8 loopback
      a === 10 ||                            // 10.0.0.0/8 private
      (a === 172 && b >= 16 && b <= 31) ||   // 172.16.0.0/12 private
      (a === 192 && b === 168) ||            // 192.168.0.0/16 private
      (a === 169 && b === 254) ||            // 169.254.0.0/16 link-local
      a === 0                                // 0.0.0.0/8
    ) {
      return "URL not allowed"
    }
  }

  // Block IPv6 private ranges (matches iptables rules in README)
  if (
    hostname === "[::1]" ||                   // ::1 loopback
    /^\[?fc/i.test(hostname) ||               // fc00::/7 unique local
    /^\[?fd/i.test(hostname) ||               // fd00::/8 unique local
    /^\[?fe80:/i.test(hostname)               // fe80::/10 link-local
  ) {
    return "URL not allowed"
  }

  return null
}

// Fetch file from URL
upload.post("/fetch-url", async (c) => {
  const event = c.get("event")
  const url = c.req.query("url")

  if (!url) {
    event.error = { category: "validation", message: "Missing url parameter", code: "MISSING_URL" }
    return c.json({ error: "Missing url parameter" }, { status: 400 })
  }

  // Validate URL (defense-in-depth, iptables is primary protection)
  const urlError = validateExternalUrl(url)
  if (urlError) {
    event.error = { category: "validation", message: urlError, code: "BLOCKED_URL" }
    return c.json({ error: urlError }, { status: 400 })
  }

  event.sourceUrl = url
  const backend = process.env.BACKEND_MODE || "local"
  event.backend = backend as BackendType

  // Local mode: passthrough to FastAPI worker
  if (backend === "local") {
    const localUrl = process.env.LOCAL_WORKER_URL || "http://localhost:8000"

    const responseResult = await tryCatch(
      fetch(`${localUrl}/fetch-url?url=${encodeURIComponent(url)}`, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
      })
    )
    if (!responseResult.success) {
      event.error = { category: "network", message: getErrorMessage(responseResult.error), code: "LOCAL_WORKER_ERROR" }
      return c.json({ error: "Failed to connect to worker" }, { status: 502 })
    }

    if (!responseResult.data.ok) {
      const errorText = await responseResult.data.text()
      event.error = { category: "backend", message: errorText, code: "LOCAL_WORKER_REJECTED" }
      return c.json({ error: errorText }, responseResult.data.status as ContentfulStatusCode)
    }

    const result: unknown = await responseResult.data.json()
    if (!isWorkerUploadResponse(result)) {
      event.error = { category: "backend", message: "Invalid response from worker", code: "INVALID_WORKER_RESPONSE" }
      return c.json({ error: "Invalid response from worker" }, { status: 502 })
    }
    event.fileId = result.file_id
    event.filename = result.filename
    event.fileSize = result.size
    return c.json(result)
  }

  // Fetch the file
  const fileResponseResult = await tryCatch(
    fetch(url, { signal: AbortSignal.timeout(30_000) })
  )
  if (!fileResponseResult.success) {
    event.error = { category: "network", message: getErrorMessage(fileResponseResult.error), code: "URL_FETCH_ERROR" }
    return c.json({ error: "Failed to fetch URL" }, { status: 500 })
  }

  if (!fileResponseResult.data.ok) {
    event.error = { category: "network", message: `Failed to fetch URL: ${fileResponseResult.data.statusText}`, code: "URL_FETCH_FAILED" }
    return c.json({ error: `Failed to fetch URL: ${fileResponseResult.data.statusText}` }, { status: 400 })
  }

  const contentType = fileResponseResult.data.headers.get("content-type") || "application/pdf"

  // Extract and sanitize filename from URL
  const rawFilename = url.split("/").pop()?.split("?")[0] || ""
  const filename = rawFilename
    .replace(/\.\./g, "") // Remove path traversal
    .replace(/[^\w.\-]/g, "_") // Only allow safe characters
    .slice(0, 255) // Limit length
    || "document.pdf"

  const arrayBufferResult = await tryCatch(fileResponseResult.data.arrayBuffer())
  if (!arrayBufferResult.success) {
    event.error = { category: "network", message: getErrorMessage(arrayBufferResult.error), code: "URL_READ_ERROR" }
    return c.json({ error: "Failed to read fetched content" }, { status: 500 })
  }

  event.filename = filename
  event.contentType = contentType
  event.fileSize = arrayBufferResult.data.byteLength

  // Datalab/Runpod modes: upload to unified storage
  if (backend === "datalab" || backend === "runpod") {
    const storage = c.get("storage")

    const uploadResult = await tryCatch(
      storage.uploadFile(arrayBufferResult.data, filename, contentType)
    )
    if (!uploadResult.success) {
      event.error = { category: "storage", message: getErrorMessage(uploadResult.error), code: "UPLOAD_ERROR" }
      return c.json({ error: "Failed to store file" }, { status: 500 })
    }

    event.fileId = uploadResult.data.fileId
    return c.json({
      file_id: uploadResult.data.fileId,
      filename: uploadResult.data.filename,
      size: uploadResult.data.size,
    })
  }

  event.error = { category: "validation", message: `Unknown backend: ${backend}`, code: "UNKNOWN_BACKEND" }
  return c.json({ error: `Unknown backend: ${backend}` }, { status: 400 })
})
