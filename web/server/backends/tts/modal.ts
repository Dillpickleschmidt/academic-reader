import type { TTSBackend, SynthesisResult, VoiceInfo } from "./interface"

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
 * Modal TTS backend.
 * Routes voices to appropriate Modal endpoints (chatterbox or qwen3).
 */
export class ModalTTSBackend implements TTSBackend {
  readonly name = "modal-tts"
  private config: ModalTTSConfig

  constructor(config: ModalTTSConfig) {
    this.config = config
  }

  async synthesize(text: string, voiceId: string): Promise<SynthesisResult> {
    if (!text.trim()) {
      return { error: "Empty text" }
    }

    const engine = VOICE_ENGINE_MAP[voiceId]
    if (!engine) {
      return { error: `Unknown voice: ${voiceId}` }
    }

    const baseUrl = engine === "chatterbox" ? this.config.chatterboxUrl : this.config.qwen3Url
    if (!baseUrl) {
      return { error: `No endpoint configured for ${engine} TTS` }
    }

    try {
      // Submit for synthesis
      const synthesizeRes = await fetch(`${baseUrl}/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: [{ text, voice_id: voiceId }],
        }),
        signal: AbortSignal.timeout(30_000),
      })

      if (!synthesizeRes.ok) {
        const error = await synthesizeRes.text()
        return { error: `Synthesis failed: ${error}` }
      }

      const { call_ids } = (await synthesizeRes.json()) as { call_ids: string[] }
      const callId = call_ids[0]
      if (!callId) {
        return { error: "No call ID returned" }
      }

      // Poll for result
      const startTime = Date.now()
      while (Date.now() - startTime < MAX_POLL_TIME_MS) {
        const res = await fetch(`${baseUrl}/result/${callId}`, {
          signal: AbortSignal.timeout(10_000),
        })

        if (!res.ok) {
          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
          continue
        }

        const data = (await res.json()) as {
          status: string
          audio?: string
          sampleRate?: number
          durationMs?: number
          wordTimestamps?: Array<{ word: string; startMs: number; endMs: number }>
          error?: string
        }

        if (data.status === "completed") {
          if (data.error) {
            return { error: data.error }
          }
          return {
            audio: data.audio,
            sampleRate: data.sampleRate,
            durationMs: data.durationMs,
            wordTimestamps: data.wordTimestamps,
          }
        }

        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
      }

      return { error: "Synthesis timed out" }
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Synthesis failed" }
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
