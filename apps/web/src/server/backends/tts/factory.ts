import type { TTSBackend } from "./interface"
import { createLocalTTSBackend } from "./local"
import { createRunpodTTSBackend } from "./runpod"
import { env } from "../../env"

/**
 * Create the appropriate TTS backend based on environment configuration.
 *
 * Uses existing BACKEND_MODE to determine which backend to use:
 * - "local" -> Local TTS worker container
 * - "runpod" or "datalab" -> RunPod TTS endpoint
 */
export function createTTSBackend(): TTSBackend {
  switch (env.BACKEND_MODE) {
    case "local":
      return createLocalTTSBackend({
        TTS_WORKER_URL: env.TTS_WORKER_URL,
      })

    case "runpod":
    case "datalab":
      // Both runpod and datalab modes use Runpod for TTS
      // (Datalab doesn't provide TTS, so we use our Runpod TTS endpoint)
      return createRunpodTTSBackend({
        RUNPOD_TTS_ENDPOINT_ID: env.RUNPOD_TTS_ENDPOINT_ID,
        RUNPOD_API_KEY: env.RUNPOD_API_KEY,
      })
  }
}
