import { ChevronUp, ChevronDown, X, Volume2, VolumeX, Plus, Play, Pause, SkipBack, SkipForward } from "lucide-react"
import { Button } from "@repo/core/ui/primitives/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/core/ui/primitives/select"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@repo/core/ui/primitives/context-menu"
import { Switch } from "@repo/core/ui/primitives/switch"
import { Slider } from "@repo/core/ui/primitives/slider"
import { Checkbox } from "@repo/core/ui/primitives/checkbox"
import { Label } from "@repo/core/ui/primitives/label"
import { useAudioSelector, useAudioActions } from "@/context/AudioContext"
import { MUSIC_TRACKS } from "@/audio/constants"

const DEFAULT_VOLUME = 0.5

export function MusicTab() {
  const playlist = useAudioSelector((s) => s.music.playlist)
  const currentTrackIndex = useAudioSelector((s) => s.music.currentTrackIndex)
  const isPlaying = useAudioSelector((s) => s.music.isPlaying)
  const volume = useAudioSelector((s) => s.music.volume)
  const shuffle = useAudioSelector((s) => s.music.shuffle)
  const loop = useAudioSelector((s) => s.music.loop)

  const {
    addTrack,
    removeTrack,
    reorderTracks,
    setMusicVolume,
    setMusicShuffle,
    setMusicLoop,
    toggleMusicPlayPause,
    nextTrack,
    previousTrack,
  } = useAudioActions()

  const handleAddTrack = (trackId: string | null) => {
    if (!trackId) return
    const track = MUSIC_TRACKS.find((t) => t.id === trackId)
    if (!track) return
    addTrack({ id: track.id, name: track.name, src: track.src })
  }

  const handleMoveTrack = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= playlist.length) return
    reorderTracks(index, newIndex)
  }

  const handleVolumeChange = (value: number | readonly number[]) => {
    const v = Array.isArray(value) ? value[0] : value
    setMusicVolume(v)
  }

  // Get tracks not already in playlist (only those with audio files)
  const availableTracks = MUSIC_TRACKS.filter(
    (track) => track.src && !playlist.some((p) => p.id === track.id),
  )

  const currentTrack = playlist[currentTrackIndex]
  const hasPlayableTracks = playlist.some((t) => t.src)

  return (
    <div className="flex flex-col gap-4">
      {/* Playback controls */}
      {playlist.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8"
              onClick={previousTrack}
              disabled={!hasPlayableTracks}
            >
              <SkipBack className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-10"
              onClick={toggleMusicPlayPause}
              disabled={!hasPlayableTracks}
            >
              {isPlaying ? (
                <Pause className="size-5" />
              ) : (
                <Play className="size-5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8"
              onClick={nextTrack}
              disabled={!hasPlayableTracks}
            >
              <SkipForward className="size-4" />
            </Button>
          </div>
          {currentTrack && (
            <p className="text-xs text-muted-foreground text-center truncate">
              {isPlaying ? "Now playing: " : ""}{currentTrack.name}
            </p>
          )}
        </div>
      )}

      {/* Playlist */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">Playlist</Label>

        {playlist.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No tracks added yet
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {playlist.map((track, index) => (
              <div
                key={track.id}
                className={`flex items-center gap-1 rounded-md px-2 py-1.5 ${
                  index === currentTrackIndex && isPlaying
                    ? "bg-accent"
                    : "bg-muted/50"
                }`}
              >
                <span className="flex-1 truncate text-sm">{track.name}</span>
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6"
                    onClick={() => handleMoveTrack(index, "up")}
                    disabled={index === 0}
                  >
                    <ChevronUp className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6"
                    onClick={() => handleMoveTrack(index, "down")}
                    disabled={index === playlist.length - 1}
                  >
                    <ChevronDown className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 text-destructive hover:text-destructive"
                    onClick={() => removeTrack(track.id)}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add track */}
        {availableTracks.length > 0 && (
          <Select onValueChange={handleAddTrack} value="">
            <SelectTrigger className="w-full">
              <SelectValue>
                <Plus className="size-3" />
                <span>Add track</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {availableTracks.map((track) => (
                <SelectItem key={track.id} value={track.id}>
                  {track.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Volume */}
      <ContextMenu>
        <ContextMenuTrigger className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Volume</Label>
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
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setMusicVolume(DEFAULT_VOLUME)}>
            Reset volume
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Playback options */}
      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={shuffle}
            onCheckedChange={(checked) => setMusicShuffle(checked === true)}
          />
          <span className="text-sm">Shuffle</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-muted-foreground">Loop</span>
          <Switch checked={loop} onCheckedChange={setMusicLoop} />
        </label>
      </div>
    </div>
  )
}
