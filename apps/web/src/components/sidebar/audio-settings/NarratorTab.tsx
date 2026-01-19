import { Volume2, VolumeX } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/core/ui/primitives/select"
import { Switch } from "@repo/core/ui/primitives/switch"
import { Slider } from "@repo/core/ui/primitives/slider"
import { Label } from "@repo/core/ui/primitives/label"
import { useAudioSelector, useAudioActions } from "@/context/AudioContext"
import { VOICES } from "@/audio/constants"
import type { VoiceId } from "@/audio/types"

export function NarratorTab() {
  const isEnabled = useAudioSelector((s) => s.narrator.isEnabled)
  const currentVoice = useAudioSelector((s) => s.narrator.voice)
  const speed = useAudioSelector((s) => s.narrator.speed)
  const volume = useAudioSelector((s) => s.narrator.volume)

  const {
    enableNarrator,
    disableNarrator,
    setVoice,
    setNarratorSpeed,
    setNarratorVolume,
  } = useAudioActions()

  const handleToggle = (checked: boolean) => {
    if (checked) {
      enableNarrator()
    } else {
      disableNarrator()
    }
  }

  const handleVoiceChange = (voiceId: string | null) => {
    if (!voiceId) return
    setVoice(voiceId as VoiceId)
  }

  const handleSpeedChange = (value: number | readonly number[]) => {
    const v = Array.isArray(value) ? value[0] : value
    setNarratorSpeed(v)
  }

  const handleVolumeChange = (value: number | readonly number[]) => {
    const v = Array.isArray(value) ? value[0] : value
    setNarratorVolume(v)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Narrator</Label>
        <Switch checked={isEnabled} onCheckedChange={handleToggle} />
      </div>

      {/* Settings - dimmed when disabled */}
      <div
        className={`flex flex-col gap-4 transition-opacity ${!isEnabled ? "pointer-events-none opacity-50" : ""}`}
      >
        {/* Voice selection */}
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Voice</Label>
          <Select value={currentVoice} onValueChange={handleVoiceChange}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {VOICES.find((v) => v.value === currentVoice)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {VOICES.map((voice) => (
                <SelectItem key={voice.value} value={voice.value}>
                  {voice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Speed slider */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground">Speed</Label>
            <span className="text-xs text-foreground/70 tabular-nums">
              {speed.toFixed(1)}x
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">0.5x</span>
            <Slider
              value={[speed]}
              onValueChange={handleSpeedChange}
              min={0.5}
              max={2}
              step={0.1}
              size="sm"
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground">2x</span>
          </div>
        </div>

        {/* Volume slider */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground">Volume</Label>
            <span className="text-xs text-foreground/70 tabular-nums">
              {Math.round(volume * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <VolumeX className="size-4 text-muted-foreground" />
            <Slider
              value={[volume]}
              onValueChange={handleVolumeChange}
              min={0}
              max={1}
              step={0.01}
              size="sm"
              className="flex-1"
            />
            <Volume2 className="size-4 text-muted-foreground" />
          </div>
        </div>
      </div>
    </div>
  )
}
