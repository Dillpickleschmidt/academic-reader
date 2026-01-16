import { useState } from "react"
import { Pause, RotateCcw, RotateCw } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/core/ui/primitives/select"
import { useTTSSelector } from "@/context/TTSContext"

const SPEAKERS = [
  { value: "male-1", label: "Male 1" },
  { value: "female-1", label: "Female 1" },
] as const

export function TTSPlaybackBar() {
  const isEnabled = useTTSSelector((s) => s.isEnabled)
  const [speaker, setSpeaker] = useState<string>("male-1")

  if (!isEnabled) return null

  return (
    <div className="shrink-0 bg-(--reader-code-bg) border-t border-(--reader-border)">
      <div className="relative flex items-center justify-center py-2 md:pr-12">
        {/* Centered playback controls */}
        <div className="flex items-center gap-1">
          {/* Rewind 15s */}
          <button
            type="button"
            className="relative flex items-center justify-center w-9 h-9 rounded-lg text-(--reader-text-muted) hover:text-(--reader-text) hover:bg-(--reader-border) transition-colors"
            title="Rewind 15 seconds"
          >
            <RotateCcw size={18} />
            <span className="absolute text-[9px] font-medium">15</span>
          </button>

          {/* Pause */}
          <button
            type="button"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-(--reader-text-muted) hover:text-(--reader-text) hover:bg-(--reader-border) transition-colors"
            title="Pause"
          >
            <Pause size={18} />
          </button>

          {/* Skip 15s */}
          <button
            type="button"
            className="relative flex items-center justify-center w-9 h-9 rounded-lg text-(--reader-text-muted) hover:text-(--reader-text) hover:bg-(--reader-border) transition-colors"
            title="Skip 15 seconds"
          >
            <RotateCw size={18} />
            <span className="absolute text-[9px] font-medium">15</span>
          </button>
        </div>

        {/* Speaker selector - absolute right */}
        <div className="absolute right-4">
          <Select value={speaker} onValueChange={(v) => v && setSpeaker(v)}>
            <SelectTrigger className="h-8 w-27.5 border-none bg-transparent shadow-none text-(--reader-text) hover:bg-(--reader-border)">
              <SelectValue>
                {SPEAKERS.find((s) => s.value === speaker)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SPEAKERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
