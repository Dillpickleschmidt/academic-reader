"use client"

import { useVirtualizer } from "@tanstack/react-virtual"
import { useRef, useEffect, useCallback, useState, type ReactNode } from "react"
import { cn } from "../../lib/utils"
import { Button } from "../primitives/button"
import { ArrowDownIcon } from "lucide-react"

interface VirtualizedConversationProps<T extends { id: string }> {
  messages: T[]
  renderMessage: (message: T, index: number) => ReactNode
  className?: string
  estimateSize?: number
  overscan?: number
  /** Content to render after all messages (e.g., loader) */
  footer?: ReactNode
}

export function VirtualizedConversation<T extends { id: string }>({
  messages,
  renderMessage,
  className,
  estimateSize = 100,
  overscan = 5,
  footer,
}: VirtualizedConversationProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const isAtBottomRef = useRef(true)
  const scrollRafRef = useRef<number | null>(null)
  const isAutoScrollingRef = useRef(false)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: (index) => messages[index].id,
  })

  // Auto-scroll to bottom when content grows (new messages or streaming) - batched with rAF
  const totalSize = virtualizer.getTotalSize()
  useEffect(() => {
    if (!isAtBottomRef.current || !parentRef.current) return

    // Cancel any pending scroll to avoid stacking
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current)
    }

    // Schedule scroll for next frame (batches multiple size changes)
    scrollRafRef.current = requestAnimationFrame(() => {
      const el = parentRef.current
      if (!el) return

      // Only scroll if we're not already at max scroll (avoid unnecessary reflow)
      const maxScroll = el.scrollHeight - el.clientHeight
      if (el.scrollTop < maxScroll - 1) {
        isAutoScrollingRef.current = true
        el.scrollTop = maxScroll
      }
    })

    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current)
      }
    }
  }, [totalSize])

  // Track if user is at bottom - only update state when value changes
  const handleScroll = useCallback(() => {
    // Skip scroll events triggered by our auto-scroll
    if (isAutoScrollingRef.current) {
      isAutoScrollingRef.current = false
      return
    }

    const el = parentRef.current
    if (!el) return
    const threshold = 50
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    isAtBottomRef.current = atBottom
    setShowScrollButton(!atBottom)
  }, [])

  const scrollToBottom = useCallback(() => {
    if (parentRef.current) {
      parentRef.current.scrollTo({
        top: parentRef.current.scrollHeight,
        behavior: "smooth",
      })
      isAtBottomRef.current = true
      setShowScrollButton(false)
    }
  }, [])

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div className={cn("relative flex-1 overflow-hidden", className)}>
      <div
        ref={parentRef}
        className="h-full overflow-y-auto overscroll-contain"
        onScroll={handleScroll}
      >
        <div
          className="relative w-full"
          style={{
            height: `${totalSize}px`,
          }}
        >
          {virtualItems.map((virtualItem) => (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
                contain: "layout style paint",
              }}
            >
              <div className="p-4">
                {renderMessage(messages[virtualItem.index], virtualItem.index)}
              </div>
            </div>
          ))}
        </div>
        {/* Footer (loader, etc.) rendered outside virtualized area */}
        {footer && <div className="p-4">{footer}</div>}
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <Button
          className="absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full"
          onClick={scrollToBottom}
          size="icon"
          variant="outline"
        >
          <ArrowDownIcon className="size-4" />
        </Button>
      )}
    </div>
  )
}
