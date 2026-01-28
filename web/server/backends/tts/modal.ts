import type {
  TTSBackend,
  BatchSegmentInput,
  BatchSegmentResult,
  VoiceInfo,
} from "./interface"

const POLL_INTERVAL_MS = 500
const MAX_POLL_TIME_MS = 300_000 // 5 minutes

interface ModalTTSConfig {
  chatterboxUrl?: string
  qwen3Url?: string
}

// Voice to engine mapping
const VOICE_ENGINE_MAP: Record<string, "chatterbox" | "qwen3"> = {
  male_2: "chatterbox",
  female_1: "chatterbox",
  male_1: "qwen3",
}

/**
 * Modal TTS backend with batch streaming support.
 * Routes voices to appropriate Modal endpoints (chatterbox or qwen3).
 */
export class ModalTTSBackend implements TTSBackend {
  readonly name = "modal-tts"
  private config: ModalTTSConfig

  constructor(config: ModalTTSConfig) {
    this.config = config
  }

  async *synthesizeBatch(
    segments: BatchSegmentInput[],
    voiceId: string,
  ): AsyncGenerator<BatchSegmentResult> {
    const engine = VOICE_ENGINE_MAP[voiceId]
    if (!engine) {
      yield { segmentIndex: segments[0]?.index ?? 0, error: `Unknown voice: ${voiceId}` }
      return
    }

    const baseUrl = engine === "chatterbox" ? this.config.chatterboxUrl : this.config.qwen3Url
    if (!baseUrl) {
      yield { segmentIndex: segments[0]?.index ?? 0, error: `No endpoint configured for ${engine} TTS` }
      return
    }

    // Submit all segments for synthesis
    const synthesizeRes = await fetch(`${baseUrl}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segments: segments.map(s => ({ text: s.text, voice_id: voiceId })),
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!synthesizeRes.ok) {
      const error = await synthesizeRes.text()
      yield { segmentIndex: segments[0]?.index ?? 0, error: `Synthesis failed: ${error}` }
      return
    }

    const { call_ids } = (await synthesizeRes.json()) as { call_ids: string[] }

    // Track pending calls
    const pending = new Map<string, number>() // call_id -> segment index
    call_ids.forEach((id, idx) => pending.set(id, segments[idx].index))

    // Poll for results
    const startTime = Date.now()
    while (pending.size > 0 && Date.now() - startTime < MAX_POLL_TIME_MS) {
      for (const [callId, segmentIndex] of pending) {
        try {
          const res = await fetch(`${baseUrl}/result/${callId}`, {
            signal: AbortSignal.timeout(10_000),
          })

          if (!res.ok) continue

          const data = (await res.json()) as {
            status: string
            audio?: string
            sampleRate?: number
            durationMs?: number
            wordTimestamps?: Array<{ word: string; startMs: number; endMs: number }>
            error?: string
          }

          if (data.status === "completed") {
            pending.delete(callId)

            if (data.error) {
              yield { segmentIndex, error: data.error }
            } else {
              yield {
                segmentIndex,
                audio: data.audio,
                sampleRate: data.sampleRate,
                durationMs: data.durationMs,
                wordTimestamps: data.wordTimestamps,
              }
            }
          }
        } catch {
          // Ignore errors during polling, will retry
        }
      }

      if (pending.size > 0) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
      }
    }

    // Yield errors for any remaining pending calls
    for (const [, segmentIndex] of pending) {
      yield { segmentIndex, error: "Synthesis timed out" }
    }
  }

  async listVoices(): Promise<VoiceInfo[]> {
    const voices: VoiceInfo[] = []

    if (this.config.chatterboxUrl) {
      try {
        const res = await fetch(`${this.config.chatterboxUrl}/voices`, {
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) {
          const data = (await res.json()) as { voices: VoiceInfo[] }
          voices.push(...data.voices)
        }
      } catch {
        // Ignore errors
      }
    }

    if (this.config.qwen3Url) {
      try {
        const res = await fetch(`${this.config.qwen3Url}/voices`, {
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) {
          const data = (await res.json()) as { voices: VoiceInfo[] }
          voices.push(...data.voices)
        }
      } catch {
        // Ignore errors
      }
    }

    return voices
  }

  async healthCheck(): Promise<boolean> {
    // Check at least one endpoint is healthy
    const checks: Promise<boolean>[] = []

    if (this.config.chatterboxUrl) {
      checks.push(
        fetch(`${this.config.chatterboxUrl}/health`, {
          signal: AbortSignal.timeout(5_000),
        })
          .then(r => r.ok)
          .catch(() => false),
      )
    }

    if (this.config.qwen3Url) {
      checks.push(
        fetch(`${this.config.qwen3Url}/health`, {
          signal: AbortSignal.timeout(5_000),
        })
          .then(r => r.ok)
          .catch(() => false),
      )
    }

    const results = await Promise.all(checks)
    return results.some(r => r)
  }
}

/**
 * Create Modal TTS backend from environment.
 */
export function createModalTTSBackend(env: {
  MODAL_CHATTERBOX_TTS_URL?: string
  MODAL_QWEN3_TTS_URL?: string
}): ModalTTSBackend {
  return new ModalTTSBackend({
    chatterboxUrl: env.MODAL_CHATTERBOX_TTS_URL,
    qwen3Url: env.MODAL_QWEN3_TTS_URL,
  })
}
