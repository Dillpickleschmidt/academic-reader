import { useState, useEffect } from "react"

export interface Voice {
  id: string
  displayName: string
}

export function useVoices() {
  const [voices, setVoices] = useState<Voice[]>(cachedVoices ?? [])
  const [loading, setLoading] = useState(!cachedVoices)

  useEffect(() => {
    if (cachedVoices) {
      setVoices(cachedVoices)
      setLoading(false)
      return
    }

    loadVoices()
      .then((data) => {
        cachedVoices = data
        setVoices(data)
        setLoading(false)
      })
      .catch(() => {
        fetchPromise = null
        setLoading(false)
      })
  }, [])

  return { voices, loading }
}

export function useVoiceSelection(
  currentVoice: string,
  onChange: (voiceId: string) => void,
) {
  const { voices, loading } = useVoices()

  useEffect(() => {
    if (!voices.length) return

    const isValid = voices.some((voice) => voice.id === currentVoice)
    if (!isValid) {
      onChange(voices[0].id)
    }
  }, [voices, currentVoice, onChange])

  return { voices, loading }
}

let cachedVoices: Voice[] | null = null
let fetchPromise: Promise<Voice[]> | null = null

async function fetchVoices(): Promise<Voice[]> {
  const res = await fetch("/api/tts/voices")
  if (!res.ok) {
    throw new Error("Failed to fetch voices")
  }
  const data = await res.json()
  return data.voices
}

function loadVoices(): Promise<Voice[]> {
  if (!fetchPromise) {
    fetchPromise = fetchVoices()
  }

  return fetchPromise
}
