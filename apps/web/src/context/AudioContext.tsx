import {
  createContext,
  useContext,
  useRef,
  useCallback,
  useSyncExternalStore,
  useEffect,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import type {
  AudioState,
  TTSSegment,
  SegmentStatus,
  VoiceId,
  MusicTrack,
  AmbientSoundId,
} from "@/audio/types"
import { AMBIENT_SOUNDS } from "@/audio/constants"

type AudioStore = {
  getState: () => AudioState
  setState: (partial: Partial<AudioState> | ((state: AudioState) => Partial<AudioState>)) => void
  subscribe: (listener: () => void) => () => void
}

function createStore(initial: AudioState): AudioStore {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    setState: (partial) => {
      const updates = typeof partial === "function" ? partial(state) : partial
      state = { ...state, ...updates }
      listeners.forEach((l) => l())
    },
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}

type AudioActions = {
  // Narrator actions
  enableNarrator: () => void
  disableNarrator: () => void
  setVoice: (voiceId: VoiceId) => void
  setNarratorSpeed: (speed: number) => void
  setNarratorVolume: (volume: number) => void

  // TTS playback actions
  loadBlockTTS: (blockId: string, chunkContent: string) => Promise<void>
  play: () => void
  pause: () => void
  togglePlayPause: () => void
  skip: (seconds: number) => void
  goToSegment: (index: number) => void

  // Music actions
  addTrack: (track: MusicTrack) => void
  removeTrack: (trackId: string) => void
  reorderTracks: (fromIndex: number, toIndex: number) => void
  setMusicVolume: (volume: number) => void
  setMusicShuffle: (shuffle: boolean) => void
  setMusicLoop: (loop: boolean) => void

  // Ambience actions
  toggleAmbientSound: (soundId: AmbientSoundId, enabled: boolean) => void
  setAmbientVolume: (soundId: AmbientSoundId, volume: number) => void

  // Master actions
  setMasterVolume: (volume: number) => void
  setActivePreset: (presetId: string | null) => void
}

const AudioContext = createContext<{
  store: AudioStore
  actions: AudioActions
  audioRef: React.RefObject<HTMLAudioElement | null>
} | null>(null)

function createInitialState(): AudioState {
  return {
    narrator: {
      isEnabled: false,
      voice: "male_1",
      speed: 1.0,
      volume: 1.0,
    },
    playback: {
      isLoading: false,
      currentBlockId: null,
      error: null,
      segments: [],
      currentSegmentIndex: 0,
      isPlaying: false,
      isSynthesizing: false,
      totalDuration: 0,
      currentTime: 0,
      segmentCurrentTime: 0,
    },
    music: {
      playlist: [],
      volume: 0.5,
      shuffle: false,
      loop: true,
    },
    ambience: {
      sounds: AMBIENT_SOUNDS.map((sound) => ({
        id: sound.id,
        name: sound.name,
        enabled: false,
        volume: 0.5,
      })),
    },
    master: {
      volume: 1.0,
      activePreset: null,
    },
  }
}

export function AudioProvider({
  documentId,
  children,
}: {
  documentId: string | null
  children: ReactNode
}) {
  const storeRef = useRef<AudioStore>(null!)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Track if we're waiting for next segment to be ready
  const waitingForNextRef = useRef(false)
  // Track ongoing fetches to avoid duplicates
  const fetchingSegmentsRef = useRef(new Set<number>())

  if (!storeRef.current) {
    storeRef.current = createStore(createInitialState())
  }
  const store = storeRef.current

  // Fetch audio for a specific segment
  const fetchSegmentAudio = useCallback(
    async (segmentIndex: number): Promise<boolean> => {
      const state = store.getState()
      if (!documentId || !state.playback.currentBlockId) return false

      const segment = state.playback.segments[segmentIndex]
      if (
        !segment ||
        segment.status === "ready" ||
        segment.status === "loading"
      )
        return segment?.status === "ready"

      // Check if already fetching
      if (fetchingSegmentsRef.current.has(segmentIndex)) return false
      fetchingSegmentsRef.current.add(segmentIndex)

      // Update segment status to loading
      const updatedSegments = [...state.playback.segments]
      updatedSegments[segmentIndex] = { ...segment, status: "loading" }
      store.setState({
        playback: { ...state.playback, segments: updatedSegments, isSynthesizing: true },
      })

      try {
        const response = await fetch("/api/tts/segment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            documentId,
            blockId: state.playback.currentBlockId,
            segmentIndex,
            voiceId: state.narrator.voice,
          }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || "Failed to synthesize segment")
        }

        const data = await response.json()

        // Update segment with audio URL
        const freshState = store.getState()
        const newSegments = [...freshState.playback.segments]
        newSegments[segmentIndex] = {
          ...newSegments[segmentIndex],
          audioUrl: data.audioUrl,
          durationMs: data.durationMs,
          status: "ready",
        }

        // Recalculate total duration
        const totalDuration =
          newSegments.reduce((sum, s) => sum + (s.durationMs || 0), 0) / 1000

        // Check if any segment is still loading
        const stillSynthesizing = newSegments.some(
          (s) => s.status === "loading",
        )

        store.setState({
          playback: {
            ...freshState.playback,
            segments: newSegments,
            totalDuration,
            isSynthesizing: stillSynthesizing,
          },
        })

        fetchingSegmentsRef.current.delete(segmentIndex)
        return true
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Segment synthesis failed"

        const freshState = store.getState()
        const newSegments = [...freshState.playback.segments]
        newSegments[segmentIndex] = {
          ...newSegments[segmentIndex],
          status: "error",
        }

        const stillSynthesizing = newSegments.some(
          (s) => s.status === "loading",
        )
        store.setState({
          playback: {
            ...freshState.playback,
            segments: newSegments,
            error: errorMsg,
            isSynthesizing: stillSynthesizing,
          },
        })

        fetchingSegmentsRef.current.delete(segmentIndex)
        return false
      }
    },
    [store, documentId],
  )

  // Play a specific segment
  const playSegment = useCallback(
    async (segmentIndex: number) => {
      const state = store.getState()
      const segment = state.playback.segments[segmentIndex]
      if (!segment) return

      if (segment.status === "ready" && segment.audioUrl && audioRef.current) {
        store.setState({
          playback: { ...state.playback, currentSegmentIndex: segmentIndex },
        })
        audioRef.current.src = segment.audioUrl
        audioRef.current.play()
        store.setState({
          playback: { ...store.getState().playback, isPlaying: true },
        })

        // Pre-fetch next segment
        if (segmentIndex + 1 < state.playback.segments.length) {
          fetchSegmentAudio(segmentIndex + 1)
        }
      } else if (segment.status === "pending") {
        // Need to load this segment first
        waitingForNextRef.current = true
        store.setState({
          playback: { ...state.playback, currentSegmentIndex: segmentIndex },
        })
        await fetchSegmentAudio(segmentIndex)
      }
    },
    [store, fetchSegmentAudio],
  )

  // === Narrator Actions ===
  const enableNarrator = useCallback(() => {
    const state = store.getState()
    store.setState({
      narrator: { ...state.narrator, isEnabled: true },
      playback: { ...state.playback, error: null },
    })
  }, [store])

  const disableNarrator = useCallback(() => {
    // Stop audio and cleanup
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ""
    }
    waitingForNextRef.current = false
    fetchingSegmentsRef.current.clear()

    const state = store.getState()
    store.setState({
      narrator: { ...state.narrator, isEnabled: false },
      playback: {
        ...state.playback,
        segments: [],
        currentBlockId: null,
        error: null,
        isPlaying: false,
        isSynthesizing: false,
        currentSegmentIndex: 0,
        totalDuration: 0,
        currentTime: 0,
        segmentCurrentTime: 0,
      },
    })

    // Fire-and-forget: free GPU memory
    fetch("/api/tts/unload", { method: "POST" }).catch(() => {})
  }, [store])

  const setVoice = useCallback(
    (voiceId: VoiceId) => {
      const state = store.getState()
      if (state.narrator.voice === voiceId) return

      const wasPlaying = state.playback.isPlaying

      // Stop current playback
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ""
      }

      // Clear all audio and reset to pending
      const resetSegments = state.playback.segments.map((s) => ({
        ...s,
        audioUrl: null,
        durationMs: null,
        status: "pending" as SegmentStatus,
      }))

      fetchingSegmentsRef.current.clear()

      store.setState({
        narrator: { ...state.narrator, voice: voiceId },
        playback: {
          ...state.playback,
          segments: resetSegments,
          isPlaying: false,
          totalDuration: 0,
          currentTime: 0,
          segmentCurrentTime: 0,
        },
      })

      // Re-synthesize current segment with new voice
      if (resetSegments.length > 0) {
        fetchSegmentAudio(state.playback.currentSegmentIndex).then((success) => {
          if (success) {
            const freshState = store.getState()
            const segment = freshState.playback.segments[state.playback.currentSegmentIndex]
            if (segment?.audioUrl && audioRef.current) {
              audioRef.current.src = segment.audioUrl
              // Only resume if it was playing before voice change
              if (wasPlaying) {
                audioRef.current.play()
                store.setState({
                  playback: { ...store.getState().playback, isPlaying: true },
                })
              }
            }
          }
        })
      }
    },
    [store, fetchSegmentAudio],
  )

  const setNarratorSpeed = useCallback(
    (speed: number) => {
      const state = store.getState()
      store.setState({
        narrator: { ...state.narrator, speed },
      })
    },
    [store],
  )

  const setNarratorVolume = useCallback(
    (volume: number) => {
      const state = store.getState()
      store.setState({
        narrator: { ...state.narrator, volume },
      })
      // Apply volume to audio element
      if (audioRef.current) {
        audioRef.current.volume = volume * state.master.volume
      }
    },
    [store],
  )

  // === TTS Playback Actions ===
  const loadBlockTTS = useCallback(
    async (blockId: string, chunkContent: string) => {
      if (!documentId) {
        const state = store.getState()
        store.setState({
          playback: {
            ...state.playback,
            error: "Document not saved - TTS requires a saved document",
          },
        })
        toast.error("Document not saved - TTS requires a saved document")
        return
      }

      // Stop current playback if switching blocks
      const currentState = store.getState()
      if (currentState.playback.currentBlockId !== blockId) {
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.src = ""
        }
        waitingForNextRef.current = false
        fetchingSegmentsRef.current.clear()
        store.setState({
          playback: {
            ...currentState.playback,
            segments: [],
            isPlaying: false,
            currentSegmentIndex: 0,
            currentTime: 0,
            totalDuration: 0,
            segmentCurrentTime: 0,
          },
        })
      }

      store.setState({
        playback: {
          ...store.getState().playback,
          isLoading: true,
          error: null,
          currentBlockId: blockId,
        },
      })
      const toastId = toast.loading("Preparing text for speech...")

      try {
        // Step 1: Get segments (may be cached)
        const response = await fetch("/api/tts/rewrite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ documentId, blockId, chunkContent }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || "Failed to prepare text")
        }

        const data = await response.json()

        // Initialize segments with pending status
        const segments: TTSSegment[] = data.segments.map(
          (s: Pick<TTSSegment, "index" | "text">) => ({
            index: s.index,
            text: s.text,
            audioUrl: null,
            durationMs: null,
            status: "pending" as SegmentStatus,
          }),
        )

        store.setState({
          playback: { ...store.getState().playback, segments, isLoading: false },
        })
        toast.dismiss(toastId)

        if (segments.length === 0) {
          toast.error("No text to synthesize")
          return
        }

        // Step 2: Immediately request first segment audio
        toast.loading("Generating speech...", { id: "tts-synth" })
        const success = await fetchSegmentAudio(0)

        if (success) {
          const freshState = store.getState()
          const firstSegment = freshState.playback.segments[0]

          if (firstSegment?.audioUrl && audioRef.current) {
            audioRef.current.src = firstSegment.audioUrl
            audioRef.current.play()
            store.setState({
              playback: {
                ...store.getState().playback,
                isPlaying: true,
                currentSegmentIndex: 0,
              },
            })
            toast.success("Speech ready", { id: "tts-synth" })

            // Pre-fetch second segment
            if (segments.length > 1) {
              fetchSegmentAudio(1)
            }
          }
        } else {
          toast.error("Failed to generate speech", { id: "tts-synth" })
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "TTS processing failed"
        store.setState({
          playback: {
            ...store.getState().playback,
            error: errorMsg,
            segments: [],
            isLoading: false,
          },
        })
        toast.error(errorMsg, { id: toastId })
      }
    },
    [store, documentId, fetchSegmentAudio],
  )

  const play = useCallback(() => {
    const state = store.getState()
    const segment = state.playback.segments[state.playback.currentSegmentIndex]
    if (audioRef.current && segment?.audioUrl) {
      audioRef.current.play()
      store.setState({
        playback: { ...state.playback, isPlaying: true },
      })
    }
  }, [store])

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      store.setState({
        playback: { ...store.getState().playback, isPlaying: false },
      })
    }
  }, [store])

  const togglePlayPause = useCallback(() => {
    if (store.getState().playback.isPlaying) {
      pause()
    } else {
      play()
    }
  }, [store, play, pause])

  const skip = useCallback(
    (seconds: number) => {
      const state = store.getState()
      if (!audioRef.current || state.playback.segments.length === 0) return

      // Calculate target time across all segments
      let targetTime = state.playback.currentTime + seconds
      targetTime = Math.max(0, Math.min(state.playback.totalDuration, targetTime))

      // Find which segment this time falls into
      let accumulatedTime = 0
      for (let i = 0; i < state.playback.segments.length; i++) {
        const segmentDuration = (state.playback.segments[i].durationMs || 0) / 1000
        if (targetTime <= accumulatedTime + segmentDuration) {
          // Target is in this segment
          const segmentTime = targetTime - accumulatedTime
          if (i === state.playback.currentSegmentIndex) {
            // Same segment - just seek
            audioRef.current.currentTime = segmentTime
          } else {
            // Different segment - need to switch
            const segment = state.playback.segments[i]
            if (segment.status === "ready" && segment.audioUrl) {
              store.setState({
                playback: { ...state.playback, currentSegmentIndex: i },
              })
              audioRef.current.src = segment.audioUrl
              audioRef.current.currentTime = segmentTime
              if (state.playback.isPlaying) {
                audioRef.current.play()
              }
            }
          }
          return
        }
        accumulatedTime += segmentDuration
      }
    },
    [store],
  )

  const goToSegment = useCallback(
    (index: number) => {
      const state = store.getState()
      if (index < 0 || index >= state.playback.segments.length) return
      playSegment(index)
    },
    [store, playSegment],
  )

  // === Music Actions ===
  const addTrack = useCallback(
    (track: MusicTrack) => {
      const state = store.getState()
      if (state.music.playlist.some((t) => t.id === track.id)) return
      store.setState({
        music: {
          ...state.music,
          playlist: [...state.music.playlist, track],
        },
      })
    },
    [store],
  )

  const removeTrack = useCallback(
    (trackId: string) => {
      const state = store.getState()
      store.setState({
        music: {
          ...state.music,
          playlist: state.music.playlist.filter((t) => t.id !== trackId),
        },
      })
    },
    [store],
  )

  const reorderTracks = useCallback(
    (fromIndex: number, toIndex: number) => {
      const state = store.getState()
      if (
        fromIndex < 0 ||
        fromIndex >= state.music.playlist.length ||
        toIndex < 0 ||
        toIndex >= state.music.playlist.length
      )
        return

      const newPlaylist = [...state.music.playlist]
      const [track] = newPlaylist.splice(fromIndex, 1)
      newPlaylist.splice(toIndex, 0, track)

      store.setState({
        music: { ...state.music, playlist: newPlaylist },
      })
    },
    [store],
  )

  const setMusicVolume = useCallback(
    (volume: number) => {
      const state = store.getState()
      store.setState({
        music: { ...state.music, volume },
      })
    },
    [store],
  )

  const setMusicShuffle = useCallback(
    (shuffle: boolean) => {
      const state = store.getState()
      store.setState({
        music: { ...state.music, shuffle },
      })
    },
    [store],
  )

  const setMusicLoop = useCallback(
    (loop: boolean) => {
      const state = store.getState()
      store.setState({
        music: { ...state.music, loop },
      })
    },
    [store],
  )

  // === Ambience Actions ===
  const toggleAmbientSound = useCallback(
    (soundId: AmbientSoundId, enabled: boolean) => {
      const state = store.getState()
      store.setState({
        ambience: {
          sounds: state.ambience.sounds.map((s) =>
            s.id === soundId ? { ...s, enabled } : s,
          ),
        },
      })
    },
    [store],
  )

  const setAmbientVolume = useCallback(
    (soundId: AmbientSoundId, volume: number) => {
      const state = store.getState()
      store.setState({
        ambience: {
          sounds: state.ambience.sounds.map((s) =>
            s.id === soundId ? { ...s, volume } : s,
          ),
        },
      })
    },
    [store],
  )

  // === Master Actions ===
  const setMasterVolume = useCallback(
    (volume: number) => {
      const state = store.getState()
      store.setState({
        master: { ...state.master, volume },
      })
      // Apply master volume to audio element
      if (audioRef.current) {
        audioRef.current.volume = state.narrator.volume * volume
      }
    },
    [store],
  )

  const setActivePreset = useCallback(
    (presetId: string | null) => {
      const state = store.getState()
      store.setState({
        master: { ...state.master, activePreset: presetId },
      })
    },
    [store],
  )

  // Set up audio event listeners
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleEnded = () => {
      const state = store.getState()
      const nextIndex = state.playback.currentSegmentIndex + 1

      if (nextIndex < state.playback.segments.length) {
        // Play next segment
        const nextSegment = state.playback.segments[nextIndex]
        if (nextSegment.status === "ready" && nextSegment.audioUrl) {
          store.setState({
            playback: { ...state.playback, currentSegmentIndex: nextIndex },
          })
          audio.src = nextSegment.audioUrl
          audio.play()

          // Pre-fetch the segment after next
          if (nextIndex + 1 < state.playback.segments.length) {
            fetchSegmentAudio(nextIndex + 1)
          }
        } else {
          // Next segment not ready - wait for it
          waitingForNextRef.current = true
          store.setState({
            playback: {
              ...state.playback,
              currentSegmentIndex: nextIndex,
              isPlaying: false,
            },
          })
          fetchSegmentAudio(nextIndex)
        }
      } else {
        // All segments finished
        store.setState({
          playback: { ...state.playback, isPlaying: false, segmentCurrentTime: 0 },
        })
      }
    }

    const handleTimeUpdate = () => {
      const state = store.getState()
      const segmentCurrentTime = audio.currentTime

      // Calculate total time = sum of previous segments + current position
      let previousDuration = 0
      for (let i = 0; i < state.playback.currentSegmentIndex; i++) {
        previousDuration += (state.playback.segments[i]?.durationMs || 0) / 1000
      }
      const currentTime = previousDuration + segmentCurrentTime

      store.setState({
        playback: { ...state.playback, currentTime, segmentCurrentTime },
      })
    }

    const handlePlay = () => {
      store.setState({
        playback: { ...store.getState().playback, isPlaying: true },
      })
    }

    const handlePause = () => {
      store.setState({
        playback: { ...store.getState().playback, isPlaying: false },
      })
    }

    audio.addEventListener("ended", handleEnded)
    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("play", handlePlay)
    audio.addEventListener("pause", handlePause)

    return () => {
      audio.removeEventListener("ended", handleEnded)
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("play", handlePlay)
      audio.removeEventListener("pause", handlePause)
    }
  }, [store, fetchSegmentAudio])

  // Watch for segment becoming ready when we're waiting
  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      if (!waitingForNextRef.current) return

      const state = store.getState()
      const segment = state.playback.segments[state.playback.currentSegmentIndex]

      if (segment?.status === "ready" && segment.audioUrl && audioRef.current) {
        waitingForNextRef.current = false
        audioRef.current.src = segment.audioUrl
        audioRef.current.play()
        store.setState({
          playback: { ...state.playback, isPlaying: true },
        })

        // Pre-fetch next segment
        if (state.playback.currentSegmentIndex + 1 < state.playback.segments.length) {
          fetchSegmentAudio(state.playback.currentSegmentIndex + 1)
        }
      }
    })

    return unsubscribe
  }, [store, fetchSegmentAudio])

  const valueRef = useRef<{
    store: AudioStore
    actions: AudioActions
    audioRef: React.RefObject<HTMLAudioElement | null>
  }>(null!)

  if (!valueRef.current) {
    valueRef.current = {
      store,
      actions: {
        enableNarrator,
        disableNarrator,
        setVoice,
        setNarratorSpeed,
        setNarratorVolume,
        loadBlockTTS,
        play,
        pause,
        togglePlayPause,
        skip,
        goToSegment,
        addTrack,
        removeTrack,
        reorderTracks,
        setMusicVolume,
        setMusicShuffle,
        setMusicLoop,
        toggleAmbientSound,
        setAmbientVolume,
        setMasterVolume,
        setActivePreset,
      },
      audioRef,
    }
  }

  // Update actions on each render to capture latest callbacks
  valueRef.current.actions = {
    enableNarrator,
    disableNarrator,
    setVoice,
    setNarratorSpeed,
    setNarratorVolume,
    loadBlockTTS,
    play,
    pause,
    togglePlayPause,
    skip,
    goToSegment,
    addTrack,
    removeTrack,
    reorderTracks,
    setMusicVolume,
    setMusicShuffle,
    setMusicLoop,
    toggleAmbientSound,
    setAmbientVolume,
    setMasterVolume,
    setActivePreset,
  }

  return (
    <AudioContext.Provider value={valueRef.current}>
      {/* Hidden audio element */}
      <audio ref={audioRef} />
      {children}
    </AudioContext.Provider>
  )
}

function useAudioContext() {
  const ctx = useContext(AudioContext)
  if (!ctx) throw new Error("Audio hooks must be used within AudioProvider")
  return ctx
}

export function useAudioSelector<T>(selector: (state: AudioState) => T): T {
  const { store } = useAudioContext()
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()))
}

export function useAudioActions(): AudioActions {
  return useAudioContext().actions
}

export function useAudioRef(): React.RefObject<HTMLAudioElement | null> {
  return useAudioContext().audioRef
}
