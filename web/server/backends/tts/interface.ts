/**
 * Interface for TTS backends.
 */

export interface WordTimestamp {
  word: string
  startMs: number
  endMs: number
}

export interface SynthesisResult {
  audio?: string // Base64 encoded WAV
  sampleRate?: number
  durationMs?: number
  wordTimestamps?: WordTimestamp[] // Word-level timing for text highlighting
  error?: string // Set if synthesis failed
}

export interface VoiceInfo {
  id: string
  displayName: string
}

export interface TTSBackend {
  /**
   * Backend identifier for logging/debugging
   */
  readonly name: string

  /**
   * Synthesize text to audio.
   */
  synthesize(text: string, voiceId: string): Promise<SynthesisResult>

  /**
   * List available voices.
   */
  listVoices(): Promise<VoiceInfo[]>

  /**
   * Check if the backend is healthy/reachable.
   */
  healthCheck(): Promise<boolean>
}
