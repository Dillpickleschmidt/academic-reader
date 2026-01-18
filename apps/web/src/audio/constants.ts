export const VOICES = [
  { value: "male_1", label: "Male 1" },
  { value: "female_1", label: "Female 1" },
] as const

export const AMBIENT_SOUNDS = [
  { id: "brown-noise", name: "Brown Noise" },
  { id: "creek", name: "Creek" },
  { id: "rain", name: "Rain" },
  { id: "fireplace", name: "Fireplace" },
  { id: "forest", name: "Forest" },
  { id: "ocean", name: "Ocean" },
  { id: "thunder", name: "Thunder" },
  { id: "coffee-shop", name: "Coffee Shop" },
] as const

export const MUSIC_TRACKS = [
  { id: "lofi", name: "Lo-fi beats" },
  { id: "classical", name: "Classical piano" },
  { id: "jazz", name: "Jazz cafe" },
  { id: "synthwave", name: "Synthwave" },
] as const

export const DEFAULT_PRESETS: readonly { id: string; name: string }[] = []
