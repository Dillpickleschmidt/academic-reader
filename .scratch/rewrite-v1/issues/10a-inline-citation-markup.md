Status: done

# Mark Inline Citations in Block HTML

## What to build

Add a model-agnostic post-processing step that detects Inline Citations in Block HTML and wraps them with stable markup before Blocks are persisted. This enriches Reader View content and gives later Narration Candidate extraction citation evidence without making citation handling Marker-specific.

## Acceptance criteria

- [x] Inline Citation detection runs after Conversion Model adapter output and image URL rewriting, and before PDF metadata/TOC target matching and Blocks persistence.
- [x] The implementation is model-agnostic and not embedded in the Marker adapter.
- [x] The implementation is an in-process API post-processing function call with no route, worker, Convex round-trip, or separate network boundary.
- [x] Old app citation pattern coverage is preserved for bracketed author-year citations and bracketed numeric citations.
- [x] Citations split across adjacent inline elements, especially Marker-produced adjacent `<a>` tags, are wrapped as one Inline Citation when they form one contiguous bracketed citation.
- [x] Inline Citations are wrapped in persisted `contentHtml` with `<span class="inline-citation">...</span>`.
- [x] Existing Block HTML structure is preserved inside and outside citation spans.
- [x] Already-marked inline citations are not double-wrapped.
- [x] Bibliography/reference entries are not treated as Inline Citations wholesale.
- [x] Reader View styles Inline Citations with the old app's citation-pill visual treatment, using the `inline-citation` class.
- [x] Debug Overlay Block Evidence shows Inline Citation count derived from `contentHtml`.
- [x] Narration Candidate extraction preserves Inline Citation markup for later LLM cleanup.
- [x] Unit tests cover bracketed numeric citations, bracketed author-year citations, grouped citations, split adjacent inline-element citations, and double-wrap avoidance.

## Blocked by

- `.scratch/rewrite-v1/issues/09-pdf-page-labels-and-outline-toc.md`

## Comments

Implemented model-agnostic Inline Citation markup in the API app as an in-process Block HTML post-processing function. Marker adaptation still owns image URL rewriting, then `acceptMarkerResult` marks Inline Citations before PDF metadata/TOC target matching and projection persistence.

The detector preserves old bracketed numeric and author-year coverage, wraps contiguous citations split across adjacent inline elements such as Marker-generated `<a>` tags, wraps around citation links, and skips already marked `.inline-citation` spans. Reader View now styles `.inline-citation` as a citation pill, and Debug Overlay Block Evidence reports Inline Citation count derived from persisted `contentHtml`.

Validation run:

```bash
bun test apps/api/src/block-content.test.ts apps/api/src/marker-result.test.ts apps/api/src/pdf-metadata.test.ts
bun run check
cd apps/web && bun run build
git diff --check
```
