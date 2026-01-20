/**
 * SSE stream transformation utilities.
 */

const MAX_BUFFER_SIZE = 1024 * 1024 // 1MB

/**
 * Format data as an SSE event.
 */
function formatSSE(event: string, data: string): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${data}\n\n`)
}

/**
 * Parse an SSE block into event name and data.
 */
function parseSSEBlock(block: string): { event: string; data: string } {
  const lines = block.split("\n")
  let event = "message"
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim()
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  return { event, data: dataLines.join("\n") }
}

/**
 * Transform SSE events in a stream.
 *
 * @param input - Input SSE stream
 * @param transform - Sync transform for events. Return null to skip emitting.
 * @param onCompleted - Optional async handler for "completed" event.
 *                      If provided, the completed event is buffered and processed
 *                      in flush() to allow async operations like image upload.
 */
export function transformSSEStream(
  input: ReadableStream<Uint8Array>,
  transform: (event: string, data: string) => string | null,
  onCompleted?: (data: string) => Promise<string | null>,
): ReadableStream<Uint8Array> {
  let buffer = ""
  let pendingCompleted: string | null = null

  return input.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += new TextDecoder().decode(chunk, { stream: true })

        if (buffer.length > MAX_BUFFER_SIZE) {
          controller.error(new Error("SSE buffer overflow - malformed stream"))
          return
        }

        buffer = buffer.replace(/\r\n/g, "\n")

        const blocks = buffer.split("\n\n")
        buffer = blocks.pop() || ""

        for (const block of blocks) {
          if (!block.trim()) continue

          const { event, data } = parseSSEBlock(block)

          // Buffer completed event for async processing in flush
          if (event === "completed" && onCompleted) {
            pendingCompleted = data
            continue // Don't emit yet
          }

          // Other events: transform and emit immediately
          const transformed = transform(event, data)
          if (transformed !== null) {
            controller.enqueue(formatSSE(event, transformed))
          }
        }
      },

      async flush(controller) {
        // Handle any remaining buffer content
        if (buffer.trim()) {
          const { event, data } = parseSSEBlock(buffer)

          if (event === "completed" && onCompleted) {
            pendingCompleted = data
          } else {
            const transformed = transform(event, data)
            if (transformed !== null) {
              controller.enqueue(formatSSE(event, transformed))
            }
          }
        }

        // Process buffered completed event with async handler
        if (pendingCompleted !== null && onCompleted) {
          const processed = await onCompleted(pendingCompleted)
          if (processed !== null) {
            controller.enqueue(formatSSE("completed", processed))
          }
        }
      },
    }),
  )
}
