Status: ready-for-agent

# Mark Inline Citations in Block HTML

## What to build

Add a model-agnostic post-processing step that detects Inline Citations in Block HTML and wraps them with stable markup before Blocks are persisted. This enriches Reader View content and gives later Narration Candidate extraction citation evidence without making citation handling Marker-specific.

## Acceptance criteria

- [ ] Inline Citation detection runs after Conversion Model adapter output and image URL rewriting, and before PDF metadata/TOC target matching and Blocks persistence.
- [ ] The implementation is model-agnostic and not embedded in the Marker adapter.
- [ ] The implementation is an in-process API post-processing function call with no route, worker, Convex round-trip, or separate network boundary.
- [ ] Old app citation pattern coverage is preserved for bracketed author-year citations and bracketed numeric citations.
- [ ] Citations split across adjacent inline elements, especially Marker-produced adjacent `<a>` tags, are wrapped as one Inline Citation when they form one contiguous bracketed citation.
- [ ] Inline Citations are wrapped in persisted `contentHtml` with `<span class="inline-citation">...</span>`.
- [ ] Existing Block HTML structure is preserved inside and outside citation spans.
- [ ] Already-marked inline citations are not double-wrapped.
- [ ] Bibliography/reference entries are not treated as Inline Citations wholesale.
- [ ] Reader View styles Inline Citations with the old app's citation-pill visual treatment, using the `inline-citation` class.
- [ ] Debug Overlay Block Evidence shows Inline Citation count derived from `contentHtml`.
- [ ] Narration Candidate extraction preserves Inline Citation markup for later LLM cleanup.
- [ ] Unit tests cover bracketed numeric citations, bracketed author-year citations, grouped citations, split adjacent inline-element citations, and double-wrap avoidance.

## Blocked by

- `.scratch/rewrite-v1/issues/09-pdf-page-labels-and-outline-toc.md`
