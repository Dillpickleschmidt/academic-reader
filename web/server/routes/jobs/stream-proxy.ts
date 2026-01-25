/**
 * SSE stream proxy for local backend (Marker and LightOnOCR workers).
 *
 * Proxies the worker's SSE stream while processing events:
 * - html_ready: Apply HTML transforms for early preview
 * - completed: Upload images, rewrite URLs, save to S3
 */

import type { WideEvent } from "../../types"
import type { Storage } from "../../storage/types"
import { processHtml } from "../../utils/html-processing"
import { transformSSEStream } from "../../utils/sse-transform"
import { tryCatch, getErrorMessage } from "../../utils/try-catch"
import { emitStreamingEvent } from "../../middleware/wide-event-middleware"
import {
  processCompletedJob,
  getJobFileInfo,
  clearJobFileInfo,
  HTML_TRANSFORMS,
  SSE_HEADERS,
} from "./processing"

interface StreamProxyOptions {
  jobId: string
  streamUrl: string
  storage: Storage
  event: WideEvent
}

/**
 * Handle streaming job by proxying local backend SSE stream.
 */
export async function handleStreamingJob(
  options: StreamProxyOptions,
): Promise<Response> {
  const { jobId, streamUrl, storage, event } = options
  const fileInfo = getJobFileInfo(jobId)
  const streamStart = performance.now()

  const responseResult = await tryCatch(fetch(streamUrl))
  if (!responseResult.success) {
    event.error = {
      category: "network",
      message: getErrorMessage(responseResult.error),
      code: "STREAM_CONNECT_ERROR",
    }
    emitStreamingEvent(event)
    return new Response(JSON.stringify({ error: "Failed to connect to stream" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!responseResult.data.ok || !responseResult.data.body) {
    event.error = {
      category: "backend",
      message: "Stream not available",
      code: "STREAM_NOT_OK",
    }
    emitStreamingEvent(event)
    return new Response(JSON.stringify({ error: "Failed to connect to stream" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Transform SSE events with async image handling for completed event
  const transformedStream = transformSSEStream(
    responseResult.data.body,
    // Sync transform for non-completed events (progress, html_ready)
    (sseEvent, data) => {
      if (sseEvent === "html_ready") {
        try {
          const parsed = JSON.parse(data)
          // Process HTML for early preview (images will show skeleton)
          if (parsed.content) {
            parsed.content = processHtml(parsed.content, HTML_TRANSFORMS)
          }
          return JSON.stringify(parsed)
        } catch {
          return data
        }
      }
      return data
    },
    // Async handler for completed event - upload images and rewrite URLs
    async (data) => {
      try {
        const parsed = JSON.parse(data)

        const { content, imageUrls } = await processCompletedJob(
          jobId,
          parsed,
          fileInfo,
          storage,
          event,
        )

        // Update with processed content and metadata for frontend
        parsed.content = content
        parsed.jobId = jobId
        parsed.fileId = fileInfo?.fileId
        if (imageUrls) parsed.images = imageUrls

        clearJobFileInfo(jobId)

        emitStreamingEvent(event, {
          durationMs: Math.round(performance.now() - streamStart),
          status: 200,
        })

        return JSON.stringify(parsed)
      } catch (err) {
        event.error = {
          category: "internal",
          message: err instanceof Error ? err.message : String(err),
          code: "COMPLETED_EVENT_PROCESSING_ERROR",
        }
        return data
      }
    },
  )

  return new Response(transformedStream, { headers: SSE_HEADERS })
}
