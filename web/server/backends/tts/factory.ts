import type { TTSBackend } from "./interface"
import { createLocalTTSBackend } from "./local"
import { createModalTTSBackend } from "./modal"
import { getEngineConfig } from "./registry"
import { env } from "../../env"

/**
 * Create TTS backend for a specific voice.
 * Routes to the appropriate engine based on VOICE_REGISTRY.
 */
export function createTTSBackend(voiceId: string): TTSBackend {
  const engineConfig = getEngineConfig(voiceId)

  switch (env.BACKEND_MODE) {
    case "local": {
      return createLocalTTSBackend({
        TTS_WORKER_URL: engineConfig.getLocalUrl(),
      })
    }

    case "datalab":
    case "modal": {
      // Cloud modes use Modal for TTS
      return createModalTTSBackend({
        MODAL_CHATTERBOX_TTS_URL: env.MODAL_CHATTERBOX_TTS_URL,
        MODAL_QWEN3_TTS_URL: env.MODAL_QWEN3_TTS_URL,
      })
    }
  }
}
