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

// TTS Segment types
export type SegmentStatus = "pending" | "loading" | "ready" | "error"

export type WordTimestamp = {
  word: string
  startMs: number
  endMs: number
}

export type TTSSegment = {
  index: number
  text: string
  audioUrl: string | null
  durationMs: number | null
  wordTimestamps: WordTimestamp[] | null
  status: SegmentStatus
}

// Unified Audio State
export type AudioState = {
  // Narrator settings
  narrator: {
    isEnabled: boolean
    voice: VoiceId
    speed: number // 0.5 - 2.0
    volume: number // 0 - 1
  }

  // TTS playback state
  playback: {
    isLoading: boolean
    currentBlockId: string | null
    error: string | null
    segments: TTSSegment[]
    currentSegmentIndex: number
    isPlaying: boolean
    isWaitingForSegment: boolean // True when playback paused waiting for next segment to be ready
    isSynthesizing: boolean
    totalDuration: number
    currentTime: number
    segmentCurrentTime: number
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
