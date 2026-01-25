/**
 * PDF Link Extraction Test & Validation
 *
 * Usage: DATALAB_API_KEY=xxx bun scripts/test-link-extraction.ts ~/Downloads/example.pdf
 */

import * as fs from "fs"
import { extractPdfLinks, injectLinksIntoHtml } from "../server/services/link-extraction"

const DATALAB_API_KEY = process.env.DATALAB_API_KEY
const DATALAB_URL = "https://www.datalab.to/api/v1/marker"

interface ChunkBlock {
  id: string
  block_type?: string
  page: number
  bbox?: number[]
  html?: string
}

interface LinkMapping {
  sourceBlock: string | null
  sourceText: string
  targetBlock: string | null
  targetUrl: string | null
  sourcePage: number
  destPage: number
}

interface ValidationResult {
  mapping: LinkMapping
  targetExists: boolean
  sourceExists: boolean
  textInSource: boolean
  linkInjected: boolean
  semanticScore: number // 0-1 confidence that target is correct
  semanticReason: string
  sourceBlockContent?: string // For debugging injection failures
}

async function main() {
  const pdfPath = process.argv[2]
  if (!pdfPath) {
    console.error("Usage: DATALAB_API_KEY=xxx bun scripts/test-link-extraction.ts <pdf-path>")
    process.exit(1)
  }

  if (!DATALAB_API_KEY) {
    console.error("Error: DATALAB_API_KEY environment variable required")
    process.exit(1)
  }

  // 1. Read PDF and convert
  const pdfBuffer = fs.readFileSync(pdfPath)
  console.log(`\n📄 PDF: ${pdfPath} (${(pdfBuffer.length / 1024).toFixed(0)} KB)`)

  console.log("\n🔄 Converting via Datalab...")
  const { html, chunks } = await convertWithDatalab(pdfBuffer)

  // 2. Extract links
  const linkMappings = extractPdfLinks(pdfBuffer, chunks)
  console.log(`\n🔗 Extracted ${linkMappings.length} link mappings`)

  // 3. Inject links
  const resultHtml = injectLinksIntoHtml(html, linkMappings)

  // 4. Validate each mapping
  const validations = validateMappings(linkMappings, html, resultHtml, chunks)

  // 5. Print validation report
  printValidationReport(validations)

  // 6. Save result
  const outPath = pdfPath.replace(".pdf", "-with-links.html")
  fs.writeFileSync(outPath, resultHtml)
  console.log(`\n💾 Saved: ${outPath}`)
}

function validateMappings(
  mappings: LinkMapping[],
  originalHtml: string,
  resultHtml: string,
  chunks: ChunkBlock[]
): ValidationResult[] {
  // Build lookup for chunks by ID
  const chunkById = new Map<string, ChunkBlock>()
  for (const chunk of chunks) {
    chunkById.set(chunk.id, chunk)
  }

  // Find which targets got IDs assigned (in order of first appearance)
  const targetToLinkId = new Map<string, string>()
  let linkCounter = 0
  for (const m of mappings) {
    if (m.targetBlock && !targetToLinkId.has(m.targetBlock)) {
      targetToLinkId.set(m.targetBlock, `pdf-link-${linkCounter++}`)
    }
  }

  return mappings.map((mapping) => {
    // For external links, targetExists is true (the URL exists)
    // For internal links, check if the target block exists in HTML
    const targetExists = mapping.targetUrl
      ? true
      : mapping.targetBlock
        ? originalHtml.includes(`data-block-id="${mapping.targetBlock}"`)
        : false

    const sourceExists = mapping.sourceBlock
      ? originalHtml.includes(`data-block-id="${mapping.sourceBlock}"`)
      : false

    // Check if source text appears in the source block's HTML content
    let textInSource = false
    let sourceBlockContent: string | undefined
    if (mapping.sourceBlock) {
      const chunk = chunkById.get(mapping.sourceBlock)
      if (chunk?.html) {
        sourceBlockContent = chunk.html
        textInSource = chunk.html.includes(mapping.sourceText)
      }
      // Fallback: check the rendered HTML for that block
      if (!textInSource) {
        const blockMatch = originalHtml.match(
          new RegExp(`data-block-id="${mapping.sourceBlock}"[^>]*>([\\s\\S]*?)(?=<[^/]|$)`)
        )
        if (blockMatch) {
          sourceBlockContent = sourceBlockContent || blockMatch[1]
          textInSource = blockMatch[1].includes(mapping.sourceText)
        }
      }
    }

    // Check if link was actually injected
    let linkInjected = false
    if (mapping.targetUrl) {
      // External link: check for target="_blank" with the URL
      linkInjected = resultHtml.includes(`href="${mapping.targetUrl}" target="_blank"`)
    } else if (mapping.targetBlock) {
      const linkId = targetToLinkId.get(mapping.targetBlock)
      linkInjected = linkId
        ? resultHtml.includes(`href="#${linkId}" class="pdf-link">${mapping.sourceText}<`)
        : false
    }

    // Semantic validation - does target make sense for this source text?
    const { score, reason } = computeSemanticScore(mapping, chunkById)

    return {
      mapping,
      targetExists,
      sourceExists,
      textInSource,
      linkInjected,
      semanticScore: score,
      semanticReason: reason,
      sourceBlockContent,
    }
  })
}

function computeSemanticScore(
  mapping: LinkMapping,
  chunkById: Map<string, ChunkBlock>
): { score: number; reason: string } {
  const { sourceText, targetBlock, targetUrl, destPage } = mapping

  // External links - high confidence if URL looks valid
  if (targetUrl) {
    if (targetUrl.startsWith("https://doi.org/")) {
      return { score: 1.0, reason: `External → DOI` }
    }
    if (targetUrl.startsWith("mailto:")) {
      return { score: 1.0, reason: `External → Email` }
    }
    return { score: 0.9, reason: `External → ${new URL(targetUrl).hostname}` }
  }

  if (!targetBlock) {
    return { score: 0.0, reason: "No target" }
  }

  const targetChunk = chunkById.get(targetBlock)
  const targetType = targetChunk?.block_type || targetBlock.split("/")[2] || "Unknown"

  // Citation numbers (1-999) should point to References section or ListGroup
  if (/^\d{1,3}$/.test(sourceText)) {
    // Citations typically point to later pages (references at end)
    if (destPage >= mapping.sourcePage) {
      if (targetType === "ListGroup" || targetType === "SectionHeader" || targetType === "Text") {
        return { score: 1.0, reason: `Citation → ${targetType} on page ${destPage}` }
      }
    }
    return { score: 0.5, reason: `Citation → ${targetType} (unusual target type)` }
  }

  // "Table X" should point to Table or Caption
  if (/^Table\s+\d+/i.test(sourceText)) {
    if (targetType === "Table" || targetType === "Caption" || targetType === "TableGroup") {
      return { score: 1.0, reason: `Table ref → ${targetType}` }
    }
    return { score: 0.3, reason: `Table ref → ${targetType} (expected Table/Caption)` }
  }

  // "Figure X" should point to Figure, Picture, or Caption
  if (/^(Figure|Fig\.?)\s+\d+/i.test(sourceText)) {
    if (["Figure", "Picture", "Caption", "FigureGroup", "PictureGroup"].includes(targetType)) {
      return { score: 1.0, reason: `Figure ref → ${targetType}` }
    }
    return { score: 0.3, reason: `Figure ref → ${targetType} (expected Figure/Caption)` }
  }

  // Other text - hard to validate semantically
  return { score: 0.7, reason: `"${sourceText.slice(0, 15)}" → ${targetType}` }
}

function printValidationReport(validations: ValidationResult[]) {
  const total = validations.length
  const targetExists = validations.filter((v) => v.targetExists).length
  const sourceExists = validations.filter((v) => v.sourceExists).length
  const textInSource = validations.filter((v) => v.textInSource).length
  const injected = validations.filter((v) => v.linkInjected).length
  const avgSemantic = validations.reduce((sum, v) => sum + v.semanticScore, 0) / total

  console.log("\n" + "═".repeat(60))
  console.log("VALIDATION REPORT")
  console.log("═".repeat(60))

  console.log("\n📊 Metrics:")
  console.log(`   Total mappings:      ${total}`)
  console.log(`   Target exists:       ${targetExists}/${total} (${pct(targetExists, total)})`)
  console.log(`   Source exists:       ${sourceExists}/${total} (${pct(sourceExists, total)})`)
  console.log(`   Text in source:      ${textInSource}/${total} (${pct(textInSource, total)})`)
  console.log(`   Links injected:      ${injected}/${total} (${pct(injected, total)})`)
  console.log(`   Semantic confidence: ${(avgSemantic * 100).toFixed(1)}%`)

  // Show issues
  const issues = validations.filter((v) => !v.targetExists || !v.sourceExists || v.semanticScore < 0.5)
  if (issues.length > 0) {
    console.log(`\n⚠️  Issues (${issues.length}):`)
    issues.slice(0, 10).forEach((v) => {
      const flags: string[] = []
      if (!v.targetExists) flags.push("target missing")
      if (!v.sourceExists) flags.push("source missing")
      if (v.semanticScore < 0.5) flags.push(`low confidence: ${v.semanticReason}`)
      const target = v.mapping.targetUrl
        ? v.mapping.targetUrl.slice(0, 30)
        : v.mapping.targetBlock?.slice(0, 25) ?? "null"
      console.log(`   "${v.mapping.sourceText}" → ${target}...`)
      console.log(`      ${flags.join(", ")}`)
    })
    if (issues.length > 10) {
      console.log(`   ... and ${issues.length - 10} more`)
    }
  }

  // Show injection failures with debug info
  const injectionFailures = validations.filter((v) => !v.linkInjected && v.sourceExists)
  if (injectionFailures.length > 0) {
    console.log(`\n🔍 Injection Failures (${injectionFailures.length}):`)
    injectionFailures.slice(0, 8).forEach((v) => {
      console.log(`\n   "${v.mapping.sourceText}" (page ${v.mapping.sourcePage})`)
      console.log(`      Source block: ${v.mapping.sourceBlock}`)
      console.log(`      Text in source: ${v.textInSource}`)
      if (v.sourceBlockContent) {
        // Strip HTML tags and show snippet
        const textContent = v.sourceBlockContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        const snippet = textContent.length > 100 ? textContent.slice(0, 100) + "..." : textContent
        console.log(`      Block content: "${snippet}"`)
      }
    })
    if (injectionFailures.length > 8) {
      console.log(`\n   ... and ${injectionFailures.length - 8} more`)
    }
  }

  // Show all Table/Figure mappings for debugging
  const tableFigureMappings = validations.filter((v) =>
    /^(Table|Figure|Fig\.?)\s+\d+/i.test(v.mapping.sourceText)
  )
  if (tableFigureMappings.length > 0) {
    console.log(`\n📋 Table/Figure Mappings (${tableFigureMappings.length}):`)
    tableFigureMappings.forEach((v) => {
      const status = v.linkInjected ? "✓" : "✗"
      console.log(`   ${status} "${v.mapping.sourceText}" (p${v.mapping.sourcePage}) → ${v.mapping.sourceBlock?.slice(0, 30) || "null"}`)
      if (!v.linkInjected) {
        console.log(`      textInSource: ${v.textInSource}, sourceExists: ${v.sourceExists}`)
      }
    })
  }

  // Show sample successful mappings
  const successes = validations.filter((v) => v.linkInjected && v.semanticScore >= 0.7)
  if (successes.length > 0) {
    console.log(`\n✅ Sample successful mappings:`)
    successes.slice(0, 5).forEach((v) => {
      console.log(`   "${v.mapping.sourceText}" → ${v.semanticReason}`)
    })
  }

  // Overall confidence score
  const overallScore =
    (targetExists / total) * 0.3 +
    (sourceExists / total) * 0.2 +
    (injected / total) * 0.3 +
    avgSemantic * 0.2

  console.log("\n" + "─".repeat(60))
  console.log(`🎯 Overall Confidence: ${(overallScore * 100).toFixed(1)}%`)
  if (overallScore >= 0.8) {
    console.log("   Status: GOOD - Link extraction working well")
  } else if (overallScore >= 0.5) {
    console.log("   Status: FAIR - Some issues detected")
  } else {
    console.log("   Status: POOR - Significant problems")
  }
  console.log("─".repeat(60))
}

function pct(n: number, total: number): string {
  return `${((n / total) * 100).toFixed(1)}%`
}

async function convertWithDatalab(pdfBuffer: Buffer): Promise<{ html: string; chunks: ChunkBlock[] }> {
  const formData = new FormData()
  formData.append("file", new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }), "document.pdf")
  formData.append("output_format", "html,chunks")
  formData.append("add_block_ids", "true")

  const response = await fetch(DATALAB_URL, {
    method: "POST",
    headers: { "X-Api-Key": DATALAB_API_KEY! },
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Datalab API error: ${response.status}`)
  }

  const result = (await response.json()) as { request_check_url?: string }

  if (result.request_check_url) {
    process.stdout.write("   Polling")
    return await pollForResult(result.request_check_url)
  }

  const r = result as { html?: string; chunks?: { blocks: ChunkBlock[] } }
  return { html: r.html || "", chunks: r.chunks?.blocks || [] }
}

async function pollForResult(checkUrl: string): Promise<{ html: string; chunks: ChunkBlock[] }> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    process.stdout.write(".")

    const response = await fetch(checkUrl, {
      headers: { "X-Api-Key": DATALAB_API_KEY! },
    })

    const result = (await response.json()) as {
      status?: string
      html?: string
      chunks?: { blocks: ChunkBlock[] }
    }

    if (result.status === "complete") {
      console.log(" done!")
      return { html: result.html || "", chunks: result.chunks?.blocks || [] }
    }
  }

  throw new Error("Polling timeout")
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message)
  process.exit(1)
})
