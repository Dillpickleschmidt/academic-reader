/**
 * SSE stream transformation utilities.
 */

const MAX_BUFFER_SIZE = 1024 * 1024 // 1MB

/**
 * Transform SSE events in a stream.
 * Parses SSE format, applies transform to event data, re-emits.
 */
export function transformSSEStream(
  input: ReadableStream<Uint8Array>,
  transform: (event: string, data: string) => string,
): ReadableStream<Uint8Array> {
  let buffer = ""

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
          const transformed = processSSEBlock(block, transform)
          if (transformed) {
            controller.enqueue(new TextEncoder().encode(transformed + "\n\n"))
          }
        }
      },
      flush(controller) {
        if (buffer.trim()) {
          const transformed = processSSEBlock(buffer, transform)
          if (transformed) {
            controller.enqueue(new TextEncoder().encode(transformed))
          }
        }
      },
    }),
  )
}

/**
 * Process a single SSE block, applying transform to data.
 * Handles multi-line data per SSE spec.
 */
function processSSEBlock(
  block: string,
  transform: (event: string, data: string) => string,
): string {
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

  if (dataLines.length === 0) return block

  const data = dataLines.join("\n")
  const transformedData = transform(event, data)
  return `event: ${event}\ndata: ${transformedData}`
}
