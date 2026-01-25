/**
 * PDF Link Extraction Service
 *
 * Extracts hyperlinks from PDFs and injects them into HTML output.
 * Uses PDF structured text as source of truth, with page scoping via block IDs.
 */

import * as mupdf from "mupdf"
import { load, type CheerioAPI, type Cheerio } from "cheerio"
import type { Rect, Quad } from "mupdf"

// Use Cheerio's internal element type
type CheerioElement = Cheerio<any>[0]
type MatchCandidate = { element: CheerioElement; matchedText: string }
type SourceMatch = { element: CheerioElement; index: number }

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface LinkMapping {
  sourceText: string
  targetText: string | null // null for external links
  targetUrl: string | null // null for internal links
  sourcePage: number
  destPage: number // -1 for external links
}

/** Minimal chunk interface - only need id and page for page scoping */
export interface ChunkPageInfo {
  id: string
  page: number
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Extract link mappings from PDF buffer.
 * Returns mappings that can be used with injectLinks().
 */
export function extractLinkMappings(
  pdfBuffer: Buffer | Uint8Array,
): LinkMapping[] {
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf")
  try {
    return extractLinkMappingsFromDoc(doc)
  } finally {
    doc.destroy()
  }
}

/**
 * Extract links from PDF and inject them into HTML.
 * Convenience function that combines extractLinkMappings + injectLinks.
 */
export function extractAndInjectLinks(
  pdfBuffer: Buffer | Uint8Array,
  html: string,
  chunks: ChunkPageInfo[],
): { html: string; linkCount: number } {
  const mappings = extractLinkMappings(pdfBuffer)
  if (!mappings.length) return { html, linkCount: 0 }
  return injectLinks(html, mappings, chunks)
}

/**
 * Inject link anchors and hrefs into HTML based on link mappings.
 */
export function injectLinks(
  html: string,
  mappings: LinkMapping[],
  chunks: ChunkPageInfo[],
): { html: string; linkCount: number } {
  const $ = load(html)
  const hasHtmlWrapper = /<html[\s>]/i.test(html) || /<body[\s>]/i.test(html)

  const blockPageMap = new Map<string, number>()
  for (const chunk of chunks) {
    blockPageMap.set(chunk.id, chunk.page)
  }

  let anchorCounter = 0
  const targetAnchors = new Map<string, string>()

  let linkCount = 0
  const sourceBlockCursor = new Map<number, Map<string, number>>()

  for (const mapping of mappings) {
    const { sourceText, targetText, targetUrl, sourcePage, destPage } = mapping

    let href: string
    if (targetUrl) {
      href = targetUrl
    } else if (targetText) {
      const anchorKey = `${destPage}:${targetText}`

      if (!targetAnchors.has(anchorKey)) {
        const anchorId = `pdf-link-${anchorCounter++}`
        const targetMatch = findTargetMatchOnPage($, targetText, destPage, blockPageMap)

        if (targetMatch) {
          const wrapped = wrapWithAnchorId($, targetMatch.element, targetMatch.matchedText, anchorId)
          if (!wrapped) continue
          targetAnchors.set(anchorKey, anchorId)
        } else {
          continue
        }
      }

      href = `#${targetAnchors.get(anchorKey)}`
    } else {
      continue
    }

    if (!sourceBlockCursor.has(sourcePage)) {
      sourceBlockCursor.set(sourcePage, new Map())
    }
    const pageCursor = sourceBlockCursor.get(sourcePage)!
    const baseKey = sourceText.trim()
    const cursorKey = `${baseKey}:${destPage}:${targetText ?? targetUrl ?? ""}`
    const sourceIndex = pageCursor.get(cursorKey) ?? 0
    const sourceMatch = findTextOnPage($, sourceText, sourcePage, blockPageMap, sourceIndex)
    if (sourceMatch) {
      const isExternal = !!targetUrl
      const wrapped = wrapWithLink($, sourceMatch.element, sourceText, href, isExternal)
      if (wrapped) {
        linkCount++
      }
      pageCursor.set(cursorKey, sourceMatch.index + 1)
    }
  }

  const resultHtml = hasHtmlWrapper
    ? ($.html() ?? "")
    : ($("body").html() ?? "")
  return { html: resultHtml, linkCount }
}

// ─────────────────────────────────────────────────────────────
// PDF Link Extraction
// ─────────────────────────────────────────────────────────────

/**
 * Extract all link mappings from PDF document.
 * For each link, extracts source text (from link bounds) and target text (at destination Y).
 */
function extractLinkMappingsFromDoc(doc: mupdf.Document): LinkMapping[] {
  const mappings: LinkMapping[] = []
  const pageCount = doc.countPages()

  for (let pageNum = 0; pageNum < pageCount; pageNum++) {
    const page = doc.loadPage(pageNum)
    const stext = page.toStructuredText()

    for (const link of page.getLinks()) {
      const sourceText = extractTextFromRect(stext, link.getBounds())
      if (!sourceText.trim()) continue

      if (link.isExternal()) {
        const url = link.getURI()
        if (!url) continue

        mappings.push({
          sourceText: sourceText.replace(/\s+/g, " ").trim(),
          targetText: null,
          targetUrl: url,
          sourcePage: pageNum,
          destPage: -1,
        })
      } else {
        // Internal link - resolve destination and extract target text
        const dest = doc.resolveLinkDestination(link)
        if (dest.page < 0) continue

        const destPage = doc.loadPage(dest.page)
        const destStext = destPage.toStructuredText()
        const targetText = extractTextAtPointLine(destStext, dest.x, dest.y)

        if (!targetText.trim()) continue

        mappings.push({
          sourceText: sourceText.replace(/\s+/g, " ").trim(),
          targetText: targetText.replace(/\s+/g, " ").trim(),
          targetUrl: null,
          sourcePage: pageNum,
          destPage: dest.page,
        })
      }
    }
  }

  return mappings
}

/**
 * Extract text from a rectangle using character-level quad positions.
 */
function extractTextFromRect(
  stext: mupdf.StructuredText,
  linkBounds: Rect,
): string {
  const [linkX0, linkY0, linkX1, linkY1] = linkBounds
  const chars: { c: string; y: number }[] = []

  stext.walk({
    onChar(c: string, _origin, _font, _size, quad: Quad) {
      const charX0 = Math.min(quad[0], quad[2], quad[4], quad[6])
      const charY0 = Math.min(quad[1], quad[3], quad[5], quad[7])
      const charX1 = Math.max(quad[0], quad[2], quad[4], quad[6])
      const charY1 = Math.max(quad[1], quad[3], quad[5], quad[7])

      const centerX = (charX0 + charX1) / 2
      const centerY = (charY0 + charY1) / 2

      if (
        centerX >= linkX0 &&
        centerX <= linkX1 &&
        centerY >= linkY0 &&
        centerY <= linkY1
      ) {
        chars.push({ c, y: centerY })
      }
    },
  })

  // Insert spaces at line breaks (significant Y jump)
  let result = ""
  let lastY: number | null = null
  for (const { c, y } of chars) {
    if (lastY !== null && Math.abs(y - lastY) > 5) {
      result += " "
    }
    result += c
    lastY = y
  }
  return result
}

/**
 * Extract text from the line that contains the target point.
 */
function extractTextAtPointLine(
  stext: mupdf.StructuredText,
  targetX: number,
  targetY: number,
): string {
  interface Line {
    minX: number
    maxX: number
    minY: number
    maxY: number
    text: string
  }
  const lines: Line[] = []
  let cur = { chars: [] as string[], minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }

  stext.walk({
    onChar(c: string, _origin, _font, _size, quad: Quad) {
      cur.chars.push(c)
      cur.minX = Math.min(cur.minX, quad[0], quad[2], quad[4], quad[6])
      cur.maxX = Math.max(cur.maxX, quad[0], quad[2], quad[4], quad[6])
      cur.minY = Math.min(cur.minY, quad[1], quad[3], quad[5], quad[7])
      cur.maxY = Math.max(cur.maxY, quad[1], quad[3], quad[5], quad[7])
    },
    endLine() {
      if (cur.chars.length > 0) {
        lines.push({ ...cur, text: cur.chars.join("") })
      }
      cur = { chars: [], minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    },
  })
  if (cur.chars.length > 0) {
    lines.push({ ...cur, text: cur.chars.join("") })
  }

  if (lines.length === 0) return ""

  let nearestLine: Line | null = null
  let nearestDist = Number.POSITIVE_INFINITY

  for (const line of lines) {
    if (
      targetX >= line.minX &&
      targetX <= line.maxX &&
      targetY >= line.minY &&
      targetY <= line.maxY
    ) {
      return line.text.trim()
    }

    const dx = targetX < line.minX ? line.minX - targetX : targetX > line.maxX ? targetX - line.maxX : 0
    const dy = targetY < line.minY ? line.minY - targetY : targetY > line.maxY ? targetY - line.maxY : 0
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < nearestDist) {
      nearestDist = dist
      nearestLine = line
    }
  }

  if (nearestLine && nearestDist <= 20) {
    return nearestLine.text.trim()
  }

  return ""
}

function findTextOnPage(
  $: CheerioAPI,
  searchText: string,
  page: number,
  blockPageMap: Map<string, number>,
  startIndex = 0,
): SourceMatch | null {
  const blockElements = getPageBlocks($, page, blockPageMap)

  const normalizedSearch = normalizeText(searchText)
  if (!normalizedSearch.length) return null
  const isShortNumeric = isShortNumber(searchText)

  const elements = blockElements.toArray()
  const clampedStart = Math.max(0, Math.min(startIndex, elements.length))

  for (let i = clampedStart; i < elements.length; i++) {
    const el = elements[i]
    const text = normalizeText($(el).text())
    if (text.includes(normalizedSearch)) return { element: el, index: i }
    if (isShortNumeric) {
      const variants = getBracketedShortNumberVariants(searchText).map(variant => normalizeText(variant))
      if (variants.some(variant => variant && text.includes(variant))) return { element: el, index: i }
    }
  }

  return null
}

function findTargetMatchOnPage(
  $: CheerioAPI,
  targetText: string,
  page: number,
  blockPageMap: Map<string, number>,
): MatchCandidate | null {
  const normalizedTarget = normalizeText(targetText)
  if (!normalizedTarget.length) return null

  let best: { match: MatchCandidate; score: number; length: number } | null = null

  const tryUpdate = (el: CheerioElement, candidate: { text: string; score: number } | null) => {
    if (!candidate) return
    const dominated = best && (candidate.score < best.score ||
      (candidate.score === best.score && candidate.text.length >= best.length))
    if (dominated) return
    best = { match: { element: el, matchedText: candidate.text }, score: candidate.score, length: candidate.text.length }
  }

  for (const el of getPageBlocks($, page, blockPageMap).toArray()) {
    const lines = extractLineCandidates($(el).text())
    tryUpdate(el, findBestCandidateMatch(lines, normalizedTarget))
  }

  return best?.match ?? null
}

function getPageBlocks($: CheerioAPI, page: number, blockPageMap: Map<string, number>) {
  return $("[data-block-id]").filter((_, el) => {
    const blockId = $(el).attr("data-block-id")
    if (blockId === undefined) return false
    if (blockId.includes("/PageHeader/") || blockId.includes("/PageFooter/") || blockId.includes("/Picture/")) return false
    return blockPageMap.get(blockId) === page
  })
}

// ─────────────────────────────────────────────────────────────
// DOM Manipulation Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Wrap specific text within an element with a span containing an anchor ID.
 */
function wrapWithAnchorId(
  $: CheerioAPI,
  element: CheerioElement,
  text: string,
  anchorId: string,
): boolean {
  const $el = $(element)
  return wrapTextInElement($, $el, text, (matchedText) => {
    return `<span id="${anchorId}" class="pdf-link-target">${matchedText}</span>`
  })
}

/**
 * Wrap specific text within an element with an anchor tag.
 */
function wrapWithLink(
  $: CheerioAPI,
  element: CheerioElement,
  text: string,
  href: string,
  isExternal: boolean,
): boolean {
  const $el = $(element)
  const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : ""
  return wrapTextInElement($, $el, text, (matchedText) => {
    return `<a href="${href}"${attrs} class="pdf-link">${matchedText}</a>`
  })
}

/**
 * Walk text nodes within an element and wrap the first occurrence of text.
 * Uses core alphanumeric text for matching to handle inline tags (<b>, <i>, etc.)
 * that split text across multiple DOM nodes.
 */
function wrapTextInElement(
  $: CheerioAPI,
  $element: ReturnType<CheerioAPI>,
  searchText: string,
  wrapFn: (matchedText: string) => string,
): boolean {
  const normalizedSearch = normalizeText(searchText)
  if (!normalizedSearch.length) return false
  const isShortNumeric = isShortNumber(searchText)
  if (normalizedSearch.length < 2 && !isShortNumeric && !isBracketedShortNumber(searchText)) return false

  const candidates = [normalizedSearch]
  if (isShortNumeric && !isBracketedShortNumber(searchText)) {
    candidates.unshift(
      ...getBracketedShortNumberVariants(searchText).map(variant => normalizeText(variant))
    )
  }
  const textNodes: Array<{ node: CheerioElement; text: string; inPdfLink: boolean }> = []
  function collectTextNodes(nodes: ReturnType<CheerioAPI>, inPdfLink: boolean): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      if (node.type === "text") {
        const text = node.data || ""
        if (text.length) textNodes.push({ node, text, inPdfLink })
      } else if (node.type === "tag") {
        const nextInPdfLink = inPdfLink || (node.name === "a" && $(node).hasClass("pdf-link"))
        collectTextNodes($(node).contents(), nextInPdfLink)
      }
    }
  }
  collectTextNodes($element.contents(), false)

  const combinedText = textNodes.map(({ text }) => text).join("")
  const combinedMap: Array<{ nodeIndex: number; offset: number }> = []
  for (let i = 0; i < textNodes.length; i++) {
    const text = textNodes[i].text
    for (let j = 0; j < text.length; j++) {
      combinedMap.push({ nodeIndex: i, offset: j })
    }
  }

  const { normalized: normalizedCombined, map: combinedNormalizeMap } = normalizeWithMap(combinedText)

  let matchIndex = -1
  let matchedLength = 0
  for (const candidate of candidates) {
    if (!candidate.length) continue
    const candidateIndex = normalizedCombined.indexOf(candidate)
    if (candidateIndex !== -1) {
      if (isShortNumeric && !isBracketedShortNumber(searchText)) {
        const matchStart = candidateIndex
        const matchEnd = candidateIndex + candidate.length
        if (!isNumericBoundaryMatch(normalizedCombined, matchStart, matchEnd, candidate)) {
          continue
        }
      }
      matchIndex = candidateIndex
      matchedLength = candidate.length
      // If we matched a bracketed variant for a plain number, wrap only the inner number
      if (isShortNumeric && !isBracketedShortNumber(searchText) &&
          (candidate.startsWith("(") || candidate.startsWith("["))) {
        matchIndex += 1
        matchedLength = normalizedSearch.length
      }
      break
    }
  }
  if (matchIndex === -1) return false

  const startCombined = combinedNormalizeMap[matchIndex]
  const endCombined = combinedNormalizeMap[matchIndex + matchedLength - 1] + 1
  if (startCombined === undefined || endCombined === undefined) return false

  const startInfo = combinedMap[startCombined]
  const endInfo = combinedMap[endCombined - 1]
  if (!startInfo || !endInfo) return false

  for (let i = startInfo.nodeIndex; i <= endInfo.nodeIndex; i++) {
    if (textNodes[i]?.inPdfLink) return true
  }

  if (startInfo.nodeIndex === endInfo.nodeIndex) {
    const { node, text } = textNodes[startInfo.nodeIndex]
    if (node.type !== "text") return false

    const before = text.slice(0, startInfo.offset)
    const matched = text.slice(startInfo.offset, endInfo.offset + 1)
    const after = text.slice(endInfo.offset + 1)
    $(node).replaceWith(before + wrapFn(matched) + after)
    return true
  }

  for (let i = endInfo.nodeIndex; i >= startInfo.nodeIndex; i--) {
    const { node, text } = textNodes[i]
    if (node.type !== "text") return false

    const start = i === startInfo.nodeIndex ? startInfo.offset : 0
    const end = i === endInfo.nodeIndex ? endInfo.offset + 1 : text.length
    if (start >= end) return false

    const before = text.slice(0, start)
    const matched = text.slice(start, end)
    const after = text.slice(end)
    $(node).replaceWith(before + wrapFn(matched) + after)
  }

  return true
}

function isBracketedShortNumber(text: string): boolean {
  return /^\s*[\[(]\s*\d{1,3}\s*[\])]\s*$/.test(text)
}

function isShortNumber(text: string): boolean {
  return /^\s*\d{1,3}\s*$/.test(text)
}

function getBracketedShortNumberVariants(text: string): string[] {
  const trimmed = text.trim()
  if (!/^\d{1,3}$/.test(trimmed)) return []
  return [`(${trimmed})`, `[${trimmed}]`]
}

function isNumericBoundaryMatch(text: string, start: number, end: number, candidate: string): boolean {
  if (!/\d/.test(candidate)) return true
  const before = text.slice(Math.max(0, start - 2), start)
  const after = text.slice(end, end + 2)
  // Reject if adjacent to digits or part of decimal (e.g., "24.40", "0.24")
  return !/\d$/.test(before) && !/^\d/.test(after) && !/\d\.$/.test(before) && !/^\.\d/.test(after)
}

function normalizeText(text: string): string {
  return normalizeWithMap(text).normalized
}

function normalizeWithMap(text: string): { normalized: string; map: number[] } {
  // First pass: collapse whitespace and normalize dashes
  let temp = ""
  let tempMap: number[] = []
  let lastWasSpace = false

  for (let i = 0; i < text.length; i++) {
    let char = text[i]
    if (/\s/.test(char)) {
      if (lastWasSpace) continue
      temp += " "
      tempMap.push(i)
      lastWasSpace = true
      continue
    }
    if (/[\u2010-\u2015\u2212]/.test(char)) char = "-"
    temp += char
    tempMap.push(i)
    lastWasSpace = false
  }

  // Second pass: remove whitespace around brackets
  let normalized = ""
  let map: number[] = []
  for (let i = 0; i < temp.length; i++) {
    const char = temp[i]
    if (char === " ") {
      const prev = temp[i - 1]
      const next = temp[i + 1]
      // Skip space if adjacent to bracket
      if (/[(\[{]/.test(prev) || /[)\]}]/.test(next)) continue
    }
    normalized += char
    map.push(tempMap[i])
  }

  // Trim leading/trailing spaces
  let start = 0
  while (start < normalized.length && normalized[start] === " ") start++
  let end = normalized.length - 1
  while (end >= start && normalized[end] === " ") end--

  normalized = normalized.slice(start, end + 1)
  map = map.slice(start, end + 1)

  return { normalized, map }
}

function extractLineCandidates(text: string): string[] {
  return text
    .split(/\r?\n|<br\s*\/?\s*>/i)
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

function findBestCandidateMatch(
  candidates: string[],
  normalizedTarget: string,
): { text: string; score: number } | null {
  const THRESHOLD = 0.85
  let best: { text: string; score: number } | null = null
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeText(candidate)
    if (!normalizedCandidate.length) continue
    const score = similarity(normalizedCandidate, normalizedTarget)
    if (score >= THRESHOLD && (!best || score > best.score)) {
      best = { text: candidate, score }
    }
  }
  return best
}

function similarity(a: string, b: string): number {
  if (!a.length || !b.length) return 0
  if (a.includes(b) || b.includes(a)) return 1.0

  // Count character frequencies
  const freqA = new Map<string, number>()
  const freqB = new Map<string, number>()
  for (const c of a) freqA.set(c, (freqA.get(c) || 0) + 1)
  for (const c of b) freqB.set(c, (freqB.get(c) || 0) + 1)

  // Count matching characters (min frequency in both)
  let matches = 0
  for (const [c, countA] of freqA) {
    matches += Math.min(countA, freqB.get(c) || 0)
  }

  return matches / Math.min(a.length, b.length)
}
