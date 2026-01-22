import { useEffect, useRef } from "react"
import { useAudioSelector, useAudioRef } from "@/context/AudioContext"
import type { TTSSegment } from "@/audio/types"

/**
 * Hook for word-level highlighting during TTS playback.
 * Uses requestAnimationFrame for ~16ms precision and direct DOM manipulation
 * to avoid React re-renders.
 */
export function useWordHighlighting() {
  const currentBlockId = useAudioSelector((s) => s.playback.currentBlockId)
  const currentSegmentIndex = useAudioSelector(
    (s) => s.playback.currentSegmentIndex,
  )
  const segments = useAudioSelector((s) => s.playback.segments)
  const isPlaying = useAudioSelector((s) => s.playback.isPlaying)
  const audioRef = useAudioRef()

  const blockElementRef = useRef<HTMLElement | null>(null)
  const originalHtmlRef = useRef<string>("")
  // Combined mapping (combined reworded index → original index) + segment offsets + gaps
  const combinedMappingRef = useRef<Map<number, number>>(new Map())
  const segmentOffsetsRef = useRef<number[]>([])
  const gapRangesRef = useRef<GapRange[]>([])
  // Cached spans for O(1) access during animation
  const spansRef = useRef<Element[]>([])
  const currentRangeRef = useRef<HighlightRange | null>(null)
  const rafIdRef = useRef<number>(0)

  useEffect(() => {
    const cleanup = () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = 0
      }
      if (blockElementRef.current && originalHtmlRef.current) {
        blockElementRef.current.innerHTML = originalHtmlRef.current
      }
      blockElementRef.current = null
      originalHtmlRef.current = ""
      combinedMappingRef.current = new Map()
      segmentOffsetsRef.current = []
      gapRangesRef.current = []
      spansRef.current = []
      currentRangeRef.current = null
    }

    if (!currentBlockId || !isPlaying) {
      cleanup()
      return
    }

    const segment = segments[currentSegmentIndex]
    if (!segment?.wordTimestamps?.length || !segment.text) return

    const blockEl = document.querySelector(
      `[data-block-id="${currentBlockId}"]`,
    )
    if (!blockEl) return

    const isSameBlock = blockEl === blockElementRef.current

    if (!isSameBlock) {
      blockElementRef.current = blockEl as HTMLElement
      originalHtmlRef.current = blockEl.innerHTML
      wrapWordsInSpans(blockEl)

      spansRef.current = Array.from(
        blockElementRef.current.querySelectorAll("[data-word-index]"),
      )
      currentRangeRef.current = null

      // Build combined mapping: spoken words → original words, greedy first-unused match
      const originalWords = spansRef.current.map((s) => s.textContent || "")
      const { mapping, offsets, gapRanges } = buildCombinedMapping(
        originalWords,
        segments,
      )
      combinedMappingRef.current = mapping
      segmentOffsetsRef.current = offsets
      gapRangesRef.current = gapRanges
    }

    const audio = audioRef.current
    if (!audio) return

    const timestamps = segment.wordTimestamps

    const animate = () => {
      const currentMs = audio.currentTime * 1000

      // Start 50ms early for better perceived sync
      const rewordedIndex = timestamps.findIndex(
        (w) => currentMs >= Math.max(0, w.startMs - 50) && currentMs < w.endMs,
      )

      let range: HighlightRange | null = null
      if (rewordedIndex >= 0) {
        const offset = segmentOffsetsRef.current[currentSegmentIndex] ?? 0
        const combinedIdx = offset + rewordedIndex

        // Check direct mapping first
        const directMatch = combinedMappingRef.current.get(combinedIdx)
        if (directMatch !== undefined) {
          range = { start: directMatch, end: directMatch }
        } else {
          // Check gap ranges for block highlighting
          const gap = gapRangesRef.current.find(
            (g) => combinedIdx >= g.spokenStart && combinedIdx <= g.spokenEnd,
          )
          if (gap) {
            range = { start: gap.origStart, end: gap.origEnd }
          }
        }
      }

      // Update DOM only if range changed (and we're on a word, not between words)
      if (rewordedIndex >= 0 && !rangesEqual(range, currentRangeRef.current)) {
        // Remove old highlights
        if (currentRangeRef.current) {
          for (
            let i = currentRangeRef.current.start;
            i <= currentRangeRef.current.end;
            i++
          ) {
            spansRef.current[i]?.classList.remove("tts-word-active")
          }
        }
        // Add new highlights
        if (range) {
          for (let i = range.start; i <= range.end; i++) {
            spansRef.current[i]?.classList.add("tts-word-active")
          }
        }
        currentRangeRef.current = range
      }

      rafIdRef.current = requestAnimationFrame(animate)
    }

    rafIdRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = 0
      }
    }
  }, [currentBlockId, currentSegmentIndex, segments, isPlaying, audioRef])
}

// --- Helper functions ---

const NEARBY_THRESHOLD = 3 // Single word OK if within this distance
const SEQ_LENGTH = 3 // Required sequence for distant matches

type GapRange = {
  spokenStart: number
  spokenEnd: number
  origStart: number
  origEnd: number
}

type HighlightRange = { start: number; end: number }

/**
 * Normalize a word for comparison: lowercase, letters and apostrophes only.
 */
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z']/g, "")
}

/**
 * Check if N consecutive words match starting at given positions.
 */
function matchesSequence(
  spoken: string[],
  si: number,
  orig: string[],
  oi: number,
  used: Set<number>,
  len: number,
): boolean {
  for (let k = 0; k < len; k++) {
    if (si + k >= spoken.length || oi + k >= orig.length) return false
    if (used.has(oi + k) || spoken[si + k] !== orig[oi + k]) return false
  }
  return true
}

/**
 * Build combined mapping with cursor tracking and sequence confirmation.
 * - Distance < NEARBY_THRESHOLD: single word OK
 * - Distance >= NEARBY_THRESHOLD: require 3-word sequence
 * Also detects gaps for block highlighting.
 */
function buildCombinedMapping(
  originalWords: string[],
  segments: TTSSegment[],
): { mapping: Map<number, number>; offsets: number[]; gapRanges: GapRange[] } {
  const mapping = new Map<number, number>()
  const offsets: number[] = []
  const normOrig = originalWords.map(normalizeWord)
  const used = new Set<number>()

  let combinedIdx = 0
  let cursor = 0 // Expected position in original

  for (const segment of segments) {
    offsets.push(combinedIdx)
    if (!segment.wordTimestamps?.length) continue

    const normSpoken = segment.wordTimestamps.map((t) => normalizeWord(t.word))

    for (let i = 0; i < normSpoken.length; i++, combinedIdx++) {
      const word = normSpoken[i]
      if (!word) continue

      let match = -1
      for (let j = cursor; j < normOrig.length; j++) {
        if (used.has(j) || word !== normOrig[j]) continue

        const distance = j - cursor
        if (distance < NEARBY_THRESHOLD) {
          match = j
          break
        }

        // Distance 5+: require 3-word sequence
        if (matchesSequence(normSpoken, i, normOrig, j, used, SEQ_LENGTH)) {
          match = j
          break
        }
      }

      if (match >= 0) {
        mapping.set(combinedIdx, match)
        used.add(match)
        cursor = match + 1
      }
    }
  }

  const gapRanges = detectGapRanges(mapping)
  return { mapping, offsets, gapRanges }
}

/**
 * Detect gaps: unmapped spoken words between two anchors with corresponding original gaps.
 */
function detectGapRanges(mapping: Map<number, number>): GapRange[] {
  const ranges: GapRange[] = []
  const entries = Array.from(mapping.entries()).sort((a, b) => a[0] - b[0])

  for (let i = 0; i < entries.length - 1; i++) {
    const [spokenIdx, origIdx] = entries[i]
    const [nextSpokenIdx, nextOrigIdx] = entries[i + 1]

    const spokenGapStart = spokenIdx + 1
    const spokenGapEnd = nextSpokenIdx - 1
    const origGapStart = origIdx + 1
    const origGapEnd = nextOrigIdx - 1

    // Gap exists if there are unmapped words on BOTH sides
    if (spokenGapEnd >= spokenGapStart && origGapEnd >= origGapStart) {
      ranges.push({
        spokenStart: spokenGapStart,
        spokenEnd: spokenGapEnd,
        origStart: origGapStart,
        origEnd: origGapEnd,
      })
    }
  }
  return ranges
}

function rangesEqual(
  a: HighlightRange | null,
  b: HighlightRange | null,
): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return a.start === b.start && a.end === b.end
}

/**
 * Wrap text nodes in spans, treating .katex elements as single blocks.
 */
function wrapWordsInSpans(element: Element): void {
  let wordIndex = 0

  function processNode(node: Node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      // KaTeX element: treat as single word, don't recurse
      if (el.classList?.contains("katex")) {
        el.setAttribute("data-word-index", String(wordIndex++))
        el.classList.add("tts-word")
        return
      }
      // Regular element: recurse into children
      for (const child of Array.from(node.childNodes)) {
        processNode(child)
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ""
      if (!text.trim()) return

      const parts = text.split(/(\s+)/)
      const fragment = document.createDocumentFragment()
      for (const part of parts) {
        if (/^\s+$/.test(part)) {
          fragment.appendChild(document.createTextNode(part))
        } else if (part) {
          const span = document.createElement("span")
          span.setAttribute("data-word-index", String(wordIndex++))
          span.className = "tts-word"
          span.textContent = part
          fragment.appendChild(span)
        }
      }
      node.parentNode?.replaceChild(fragment, node)
    }
  }

  processNode(element)
}
