import type { AMBIENT_SOUNDS, MUSIC_TRACKS } from "./constants"

// Voice types - dynamic, fetched from backend
export type VoiceId = string

// Music types
export type MusicTrackId = (typeof MUSIC_TRACKS)[number]["id"]

export type MusicTrack = {
  id: string
  name: string
  src: string | null
}

export type MusicState = {
  playlist: MusicTrack[]
  currentTrackIndex: number
  isPlaying: boolean
  volume: number
  shuffle: boolean
  loop: boolean
}

// Ambience types
export type AmbientSoundId = (typeof AMBIENT_SOUNDS)[number]["id"]

export type AmbientSoundState = {
  id: AmbientSoundId
  name: string
  src: string | null
  enabled: boolean
  volume: number
}

// Preset types
export type AudioPreset = {
  id: string
  name: string
}

// TTS types
export type WordTimestamp = {
  word: string
  startMs: number
  endMs: number
}

// Unified Audio State
export type AudioState = {
  // Narrator settings
  narrator: {
    voice: VoiceId
    speed: number // 0.5 - 2.0
    volume: number // 0 - 1
  }

  // TTS playback state (simplified - single audio per block)
  playback: {
    isLoading: boolean
    currentBlockId: string | null
    error: string | null
    audioUrl: string | null
    text: string | null
    durationMs: number
    wordTimestamps: WordTimestamp[]
    isPlaying: boolean
    currentTime: number
  }

  // Music settings
  music: MusicState

  // Ambience settings
  ambience: {
    sounds: AmbientSoundState[]
  }

  // Master settings
  master: {
    volume: number
    activePreset: string | null
  }
}
