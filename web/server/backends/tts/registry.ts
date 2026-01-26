/**
 * TTS Voice and Engine Registry
 *
 * To add a new voice: Add entry to VOICE_REGISTRY
 * To add a new engine: Add entry to ENGINE_REGISTRY + create worker
 */

import { env } from "../../env"

export type TTSEngine = "chatterbox" | "qwen3"

export interface VoiceDefinition {
  id: string
  displayName: string
  engine: TTSEngine
}

export interface EngineConfig {
  getLocalUrl: () => string
  getRunpodEndpointId: () => string | undefined
}

// ═══════════════════════════════════════════════════════════════
// VOICE REGISTRY - Add new voices here
// ═══════════════════════════════════════════════════════════════
export const VOICE_REGISTRY: Record<string, VoiceDefinition> = {
  male_1: {
    id: "male_1",
    displayName: "Male 1",
    engine: "qwen3",
  },
  male_2: {
    id: "male_2",
    displayName: "Male 2",
    engine: "chatterbox",
  },
  female_1: {
    id: "female_1",
    displayName: "Female 1",
    engine: "chatterbox",
  },
}

// ═══════════════════════════════════════════════════════════════
// ENGINE REGISTRY - Add new TTS engines here
// ═══════════════════════════════════════════════════════════════
export const ENGINE_REGISTRY: Record<TTSEngine, EngineConfig> = {
  chatterbox: {
    getLocalUrl: () => env.CHATTERBOX_TTS_WORKER_URL,
    getRunpodEndpointId: () => env.RUNPOD_CHATTERBOX_TTS_ENDPOINT_ID,
  },
  qwen3: {
    getLocalUrl: () => env.QWEN3_TTS_WORKER_URL,
    getRunpodEndpointId: () => env.RUNPOD_QWEN3_TTS_ENDPOINT_ID,
  },
}

export function getVoice(voiceId: string): VoiceDefinition {
  const voice = VOICE_REGISTRY[voiceId]
  if (!voice) {
    throw new Error(
      `Unknown voice: ${voiceId}. Available: ${Object.keys(VOICE_REGISTRY).join(", ")}`,
    )
  }
  return voice
}

export function getEngineForVoice(voiceId: string): TTSEngine {
  return getVoice(voiceId).engine
}

export function getEngineConfig(voiceId: string): EngineConfig {
  return ENGINE_REGISTRY[getEngineForVoice(voiceId)]
}

export function listVoices(): VoiceDefinition[] {
  return Object.values(VOICE_REGISTRY)
}

export function listAvailableVoices(): VoiceDefinition[] {
  return listVoices().filter((voice) => {
    if (env.BACKEND_MODE === "local") {
      return true
    }

    const engineConfig = ENGINE_REGISTRY[voice.engine]
    return Boolean(engineConfig.getRunpodEndpointId())
  })
}

export function listAvailableVoiceSummaries(): Array<{
  id: string
  displayName: string
}> {
  return listAvailableVoices().map((voice) => ({
    id: voice.id,
    displayName: voice.displayName,
  }))
}
