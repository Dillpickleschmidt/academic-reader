import { Play } from "lucide-react"
import { Popover, PopoverContent } from "@repo/core/ui/primitives/popover"
import { useAudioActions } from "@/context/AudioContext"

interface TTSContextMenuProps {
  anchorElement: HTMLElement | null
  blockId: string | null
  wordIndex: number | null
  chunkContent: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export function TTSContextMenu({
  anchorElement,
  blockId,
  wordIndex,
  chunkContent,
  isOpen,
  onOpenChange,
}: TTSContextMenuProps) {
  const { loadBlockTTS } = useAudioActions()

  const handlePlay = () => {
    if (!blockId || !chunkContent) return

    loadBlockTTS(
      blockId,
      chunkContent,
      wordIndex !== null ? { wordIndex } : undefined,
    )
    onOpenChange(false)
  }

  if (!anchorElement) return null

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverContent
        anchor={anchorElement}
        side="top"
        sideOffset={8}
        className="w-auto p-1 flex items-center gap-1"
      >
        <button
          type="button"
          onClick={handlePlay}
          className="flex items-center justify-center size-8 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
          title="Play from here"
        >
          <Play className="size-4" />
        </button>
      </PopoverContent>
    </Popover>
  )
}
