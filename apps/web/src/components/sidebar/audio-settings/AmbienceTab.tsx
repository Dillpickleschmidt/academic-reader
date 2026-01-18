import { Checkbox } from "@repo/core/ui/primitives/checkbox"
import { Slider } from "@repo/core/ui/primitives/slider"
import { Label } from "@repo/core/ui/primitives/label"
import { useAudioSelector, useAudioActions } from "@/context/AudioContext"
import type { AmbientSoundId } from "@/audio/types"

export function AmbienceTab() {
  const sounds = useAudioSelector((s) => s.ambience.sounds)
  const { toggleAmbientSound, setAmbientVolume } = useAudioActions()

  const handleVolumeChange = (soundId: AmbientSoundId, value: number | readonly number[]) => {
    const v = Array.isArray(value) ? value[0] : value
    setAmbientVolume(soundId, v)
  }

  return (
    <div className="flex flex-col gap-3">
      <Label className="text-xs text-muted-foreground">Ambient Sounds</Label>

      <div className="flex flex-col gap-2">
        {sounds.map((sound) => (
          <div
            key={sound.id}
            className="flex items-center gap-3 rounded-md py-1"
          >
            <Checkbox
              id={`ambience-${sound.id}`}
              checked={sound.enabled}
              onCheckedChange={(checked) =>
                toggleAmbientSound(sound.id, checked === true)
              }
            />
            <label
              htmlFor={`ambience-${sound.id}`}
              className="min-w-[100px] text-sm cursor-pointer"
            >
              {sound.name}
            </label>
            <Slider
              value={[sound.volume]}
              onValueChange={(value) => handleVolumeChange(sound.id, value)}
              min={0}
              max={1}
              step={0.01}
              size="sm"
              className={`flex-1 transition-opacity ${!sound.enabled ? "pointer-events-none opacity-30" : ""}`}
              disabled={!sound.enabled}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
