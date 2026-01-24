/**
 * PDF Link Extraction Service
 *
 * Extracts hyperlinks from PDFs and maps them to Marker chunk blocks.
 * Handles both internal links (within-document navigation) and external links (URLs).
 * Uses text-primary matching: finds blocks by text content first, then uses
 * coordinates only for disambiguation when multiple blocks contain the same text.
 */

import * as mupdf from "mupdf"
import { load } from "cheerio"
import type { Rect, Quad } from "mupdf"

// Types

interface ChunkBlock {
  id: string
  page: number
  bbox?: number[] // [x0, y0, x1, y1]
  html?: string // HTML content for text-based matching
}

interface LinkMapping {
  sourceBlock: string | null
  sourceText: string
  targetBlock: string | null // null for external links
  targetUrl: string | null // null for internal links
  sourcePage: number
  destPage: number // -1 for external links
}

interface IndexedBlock {
  id: string
  bbox: Rect
  textContent: string // stripped HTML for text-based searching
}

type BlockIndex = Map<number, IndexedBlock[]>

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Extract PDF links and map them to Marker chunk blocks.
 */
export function extractPdfLinks(
  pdfBuffer: Buffer | Uint8Array,
  chunks: ChunkBlock[],
): LinkMapping[] {
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf")

  try {
    // Build block index by page
    const blockIndex = buildBlockIndex(chunks)
    const pageCount = doc.countPages()

    // Marker renders at higher DPI than PDF's 72 DPI standard
    const scaleFactors = calculateScaleFactors(doc, chunks, pageCount)
    const mappings: LinkMapping[] = []

    for (let pageNum = 0; pageNum < pageCount; pageNum++) {
      const page = doc.loadPage(pageNum)
      const links = page.getLinks()
      const stext = page.toStructuredText()
      const scale = scaleFactors.get(pageNum) ?? { x: 1, y: 1 }

      for (const link of links) {
        // Get source rectangle and extract text
        const sourceBounds = link.getBounds()
        const sourceText = extractTextFromRect(stext, sourceBounds)

        if (!sourceText.trim()) continue

        let targetBlock: string | null = null
        let targetUrl: string | null = null
        let destPage = -1

        if (link.isExternal()) {
          // External link: get the URL
          targetUrl = link.getURI()
          if (!targetUrl) continue
        } else {
          // Internal link: resolve destination
          const dest = doc.resolveLinkDestination(link)
          if (dest.page < 0) continue
          destPage = dest.page

          // Find target block (closest to destination Y, scaled)
          const destScale = scaleFactors.get(dest.page) ?? { x: 1, y: 1 }
          targetBlock = findTargetBlock(
            dest.page,
            dest.y * destScale.y,
            blockIndex,
          )

          if (!targetBlock) continue
        }

        // Scale PDF coordinates to Marker coordinate system
        const scaledSourceBounds: Rect = [
          sourceBounds[0] * scale.x,
          sourceBounds[1] * scale.y,
          sourceBounds[2] * scale.x,
          sourceBounds[3] * scale.y,
        ]

        // Find source block (text-primary matching with coordinate disambiguation)
        const normalizedSourceText = normalizeWhitespace(sourceText)
        const sourceBlock = findSourceBlock(
          pageNum,
          normalizedSourceText,
          scaledSourceBounds,
          blockIndex,
        )

        mappings.push({
          sourceBlock,
          sourceText: normalizedSourceText,
          targetBlock,
          targetUrl,
          sourcePage: pageNum,
          destPage,
        })
      }
    }

    return mappings
  } finally {
    doc.destroy()
  }
}

/**
 * Inject link anchors into HTML based on link mappings.
 */
export function injectLinksIntoHtml(
  html: string,
  linkMappings: LinkMapping[],
): string {
  if (!linkMappings.length) return html

  const $ = load(html)
  const hasHtmlWrapper = /<html[\s>]/i.test(html) || /<body[\s>]/i.test(html)

  // Assign unique IDs to internal link targets
  const targetToLinkId = new Map<string, string>()
  let linkCounter = 0
  for (const mapping of linkMappings) {
    if (mapping.targetBlock && !targetToLinkId.has(mapping.targetBlock)) {
      targetToLinkId.set(mapping.targetBlock, `pdf-link-${linkCounter++}`)
    }
  }

  // Add id attributes to target block elements
  // For tables inside scroll wrappers, put the id on the wrapper for proper scroll-margin
  for (const [targetBlock, linkId] of targetToLinkId) {
    const $target = $(`[data-block-id="${targetBlock}"]`)
    const $wrapper = $target.closest(".table-container")
    if ($wrapper.length) {
      $wrapper.attr("id", linkId)
    } else {
      $target.attr("id", linkId)
    }
  }

  // Track which text has been linked per block to avoid double-wrapping
  const linkedInBlock = new Map<string | null, Set<string>>()

  // Wrap source text with anchor tags
  for (const mapping of linkMappings) {
    const { sourceBlock, sourceText, targetBlock, targetUrl } = mapping
    if (!sourceText) continue

    // Skip links without a sourceBlock - matching against entire body is too error-prone
    if (!sourceBlock) continue

    // Build href: external URL or internal anchor
    let href: string
    if (targetUrl) {
      href = targetUrl
    } else if (targetBlock) {
      const linkId = targetToLinkId.get(targetBlock)
      if (!linkId) continue
      href = `#${linkId}`
    } else {
      continue
    }

    // Track linked text per block
    if (!linkedInBlock.has(sourceBlock)) {
      linkedInBlock.set(sourceBlock, new Set())
    }
    if (linkedInBlock.get(sourceBlock)!.has(sourceText)) continue

    // Find the source element
    const $source = $(`[data-block-id="${sourceBlock}"]`)

    if (!$source.length) continue

    // For purely numeric texts, require citation context (parens/commas)
    const isNumeric = /^\d+$/.test(sourceText)

    // Find and wrap the first occurrence of the text
    const wrapped = wrapTextWithLink($, $source, sourceText, href, isNumeric)
    if (wrapped) {
      linkedInBlock.get(sourceBlock)!.add(sourceText)
    }
  }

  return hasHtmlWrapper ? ($.html() ?? "") : ($("body").html() ?? "")
}

// ─────────────────────────────────────────────────────────────
// Private Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Calculate scale factors from PDF coordinates to Marker bbox coordinates.
 * Marker renders PDFs at a different DPI than the 72 DPI PDF standard.
 */
function calculateScaleFactors(
  doc: mupdf.Document,
  chunks: ChunkBlock[],
  pageCount: number,
): Map<number, { x: number; y: number }> {
  const scales = new Map<number, { x: number; y: number }>()

  // Find max bbox dimensions per page from chunks
  const pageMaxes = new Map<number, { maxX: number; maxY: number }>()
  for (const chunk of chunks) {
    if (chunk.page == null || !chunk.bbox) continue
    const current = pageMaxes.get(chunk.page) ?? { maxX: 0, maxY: 0 }
    pageMaxes.set(chunk.page, {
      maxX: Math.max(current.maxX, chunk.bbox[2]),
      maxY: Math.max(current.maxY, chunk.bbox[3]),
    })
  }

  // Calculate scale for each page
  for (let pageNum = 0; pageNum < pageCount; pageNum++) {
    const page = doc.loadPage(pageNum)
    const pdfBounds = page.getBounds()
    const pdfWidth = pdfBounds[2] - pdfBounds[0]
    const pdfHeight = pdfBounds[3] - pdfBounds[1]

    const markerMax = pageMaxes.get(pageNum)
    if (markerMax && pdfWidth > 0 && pdfHeight > 0) {
      // Use the max bbox coordinates as approximation of Marker's page dimensions
      // Add small margin (chunks may not extend to edge)
      scales.set(pageNum, {
        x: markerMax.maxX / pdfWidth,
        y: markerMax.maxY / pdfHeight,
      })
    } else {
      // Default: assume 1.7x scale (typical for Marker's ~120 DPI rendering)
      scales.set(pageNum, { x: 1.7, y: 1.7 })
    }
  }

  return scales
}

function buildBlockIndex(chunks: ChunkBlock[]): BlockIndex {
  const index: BlockIndex = new Map()

  for (const chunk of chunks) {
    const { id, page, bbox, html } = chunk
    if (page == null || !bbox || !id) continue

    // Skip structural elements that don't render in HTML
    if (id.includes("/PageHeader/") || id.includes("/PageFooter/")) continue

    // Strip HTML tags to get searchable text content
    const textContent =
      html
        ?.replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim() ?? ""

    if (!index.has(page)) {
      index.set(page, [])
    }
    index.get(page)!.push({ id, bbox: bbox as Rect, textContent })
  }

  return index
}

function findTargetBlock(
  destPage: number,
  destY: number,
  blockIndex: BlockIndex,
): string | null {
  const candidates = blockIndex.get(destPage)
  if (!candidates?.length) return null

  // Prefer blocks that contain destY (topmost if multiple), else closest top edge
  const containing = candidates.filter(
    (c) => c.bbox[1] <= destY && destY <= c.bbox[3],
  )

  if (containing.length > 0) {
    return containing.reduce((a, b) => (a.bbox[1] < b.bbox[1] ? a : b)).id
  }

  return candidates.reduce((a, b) =>
    Math.abs(a.bbox[1] - destY) < Math.abs(b.bbox[1] - destY) ? a : b,
  ).id
}

/** Find source block by text content, using coordinates only for disambiguation. */
function findSourceBlock(
  sourcePage: number,
  sourceText: string,
  scaledSourceRect: Rect,
  blockIndex: BlockIndex,
): string | null {
  const candidates = blockIndex.get(sourcePage)
  if (!candidates) return null

  // PRIMARY: Find all blocks on this page containing the source text
  const textMatches = candidates.filter((b) =>
    b.textContent.includes(sourceText),
  )

  if (textMatches.length === 0) return null
  if (textMatches.length === 1) return textMatches[0].id

  // SECONDARY: Multiple matches - use coordinates to pick the closest one
  const sourceCenter = {
    x: (scaledSourceRect[0] + scaledSourceRect[2]) / 2,
    y: (scaledSourceRect[1] + scaledSourceRect[3]) / 2,
  }

  let bestMatch = textMatches[0]
  let bestDistance = Infinity

  for (const match of textMatches) {
    const blockCenter = {
      x: (match.bbox[0] + match.bbox[2]) / 2,
      y: (match.bbox[1] + match.bbox[3]) / 2,
    }
    const distance = Math.hypot(
      sourceCenter.x - blockCenter.x,
      sourceCenter.y - blockCenter.y,
    )
    if (distance < bestDistance) {
      bestDistance = distance
      bestMatch = match
    }
  }

  return bestMatch.id
}

/** Extract text from a rectangle using character-level quad positions. */
function extractTextFromRect(
  stext: mupdf.StructuredText,
  linkBounds: Rect,
): string {
  const [linkX0, linkY0, linkX1, linkY1] = linkBounds
  const chars: { c: string; y: number }[] = []

  stext.walk({
    onChar(c: string, _origin, _font, _size, quad: Quad) {
      // Quad corners: [x0,y0, x1,y1, x2,y2, x3,y3]
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

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function wrapTextWithLink(
  $: ReturnType<typeof load>,
  $element: ReturnType<ReturnType<typeof load>>,
  text: string,
  href: string,
  requireCitationContext: boolean = false,
): boolean {
  // Walk text nodes only - never replace inside HTML attributes
  let found = false

  // Use word boundaries to avoid matching "15" inside "155"
  const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  // For numeric texts, require citation context: (N), (N, ,N), N–M ranges, etc.
  // This avoids matching numbers in dates, statistics, page numbers
  // Delimiters: ( , ) and en-dash/hyphen for ranges like "11–13"
  const pattern = requireCitationContext
    ? new RegExp(`(^|[,(–-]\\s*)(${escapedText})(?=\\s*[,)–-])`)
    : new RegExp(`\\b${escapedText}\\b`)

  // External links open in new tab
  const isExternal = !href.startsWith("#")
  const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : ""

  function walkNodes(nodes: ReturnType<ReturnType<typeof load>>): boolean {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]

      // Skip if already found
      if (found) return true

      // Only process text nodes
      if (node.type === "text") {
        const textContent = node.data || ""
        const match = pattern.exec(textContent)

        if (match) {
          // Found the text - split and wrap
          const prefixLength = requireCitationContext
            ? (match[1]?.length ?? 0)
            : 0
          const idx = (match.index ?? 0) + prefixLength
          const before = textContent.slice(0, idx)
          const after = textContent.slice(idx + text.length)

          // Create the link element
          const linkHtml = `<a href="${href}"${attrs} class="pdf-link">${text}</a>`

          // Replace the text node with: before + link + after
          const $node = $(node)
          $node.replaceWith(before + linkHtml + after)

          found = true
          return true
        }
      } else if (node.type === "tag" && node.name !== "a") {
        // Recurse into child nodes (but skip <a> tags to avoid nesting links)
        const children = $(node).contents()
        if (walkNodes(children)) return true
      }
    }
    return false
  }

  walkNodes($element.contents())
  return found
}
