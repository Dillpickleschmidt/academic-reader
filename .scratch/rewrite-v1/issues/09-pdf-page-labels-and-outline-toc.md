Status: done

# Add PDF page labels and source-provided outline TOC

## What to build

Use PDF-provided Page Labels and PDF outline/bookmarks when available. Physical Page remains canonical. The API app extracts PDF metadata from the Source Document and persists the full source-provided outline as Table of Contents Entries, including entries whose PDF destination cannot be resolved or whose target is outside the processed Page range. Do not infer page offsets, do not use LLM TOC extraction, and do not create guessed TOC targets.

## Acceptance criteria

- [x] Physical Page numbers are one-based and canonical in schema/UI links.
- [x] PDF-provided Page Labels are displayed when available.
- [x] Page Labels are stored on persisted Pages only.
- [x] Page UI shows both Page Label and Physical Page when they differ, and only the Physical Page when they match.
- [x] PDF outline/bookmarks are stored as flat Table of Contents Entries with Convex row identity, stable order, and depth.
- [x] A Table of Contents Entry may have no target when the PDF outline entry has no resolvable destination.
- [x] When a TOC target exists, it is resolved from the PDF destination, not inferred from text or headings.
- [x] PDF outline point coordinates persist as TOC target Source Points.
- [x] PDF outline point coordinates resolve to a Block target by choosing the nearest Block top edge on the target Physical Page, using both horizontal and vertical distance.
- [x] Point destinations with no nearby Block top edge or tied nearest candidates fall back to page-only targets.
- [x] Y-only destinations resolve to a Block target only when exactly one Block Source Geometry box contains that vertical coordinate.
- [x] Source View debug mode shows crosshairs for persisted TOC target Source Points.
- [x] TOC entries are shown in a left-side overlay drawer without Source View or Reader View layout shift.
- [x] TOC navigation scrolls the Reader View only.
- [x] TOC entries with Block targets scroll to the matching Reader Block.
- [x] TOC entries with page-only targets scroll to the first Reader Block on that Physical Page.
- [x] TOC entries outside the processed Page range or without any target remain visible but disabled.
- [x] No inferred offsets, LLM TOC extraction, nearest-heading matching, or guessed TOC links are created.

## Blocked by

- `.scratch/rewrite-v1/issues/07-document-page-route.md`

## Comments

Implemented PDF metadata extraction in the API app with `pdfjs-dist/legacy/build/pdf.mjs`, independent of Marker. The Document projection now atomically persists Pages with optional Page Labels, Blocks, and source-provided Table of Contents Entries. TOC targets are resolved from PDF destinations only: page refs become Physical Page targets, and point coordinate destinations persist as Source Points. Point coordinates become Block targets by choosing the nearest Block top edge on the same Physical Page when the match is close and unambiguous. Y-only destinations remain conservative and resolve to a Block only when exactly one Block Source Geometry box contains the vertical coordinate.

The Document page now has a left-side Table of Contents drawer. TOC navigation scrolls the Reader View only: Block targets scroll to the matching Reader Block, and page-only targets scroll to the first Reader Block on that Physical Page. Unresolved and unavailable entries remain visible but disabled. Source View debug mode also shows crosshairs at persisted TOC target Source Points.

Validation run:

```bash
bun test apps/api/src/pdf-metadata.test.ts apps/api/src/marker-result.test.ts
bun run check
cd apps/web && bun run build
git diff --check
```
