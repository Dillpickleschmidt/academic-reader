Status: draft

# Add Narration Preparation and rewrites

## What to build

After Narration Eligibility exists, generate a Narration Guide from eligible Blocks only, then generate Narration Text for eligible Blocks. Narration Preparation should support multiple preparation needs per eligible Block and use targeted directives for content that needs special handling, especially inline citations and math.

## Acceptance criteria

- [ ] Narration Text generation starts only after Narration Eligibility exists for the Document.
- [ ] A compact unstructured Narration Guide is generated from eligible Blocks only using `NARRATION_GUIDE_MODEL`.
- [ ] Per-Block or batched rewrites use `NARRATION_REWRITE_MODEL` and receive the Narration Guide, local Block context, and Narration Preparation directives.
- [ ] Eligible Blocks may carry multiple Narration Preparation tags: `plain`, `inline-citation-cleanup`, `inline-math`, and `equation-explanation`.
- [ ] `plain` is not combined with other Narration Preparation tags.
- [ ] Inline citation cleanup is performed by the LLM rewrite using persisted `inline-citation` spans rather than by deterministic removal.
- [ ] Inline math is rendered as natural spoken prose.
- [ ] Standalone/display equations are explained with their components and relationship, not merely read as symbols.
- [ ] `plain` candidates become Narration Text without an LLM rewrite after basic HTML-to-text cleanup.
- [ ] LLM rewrites preserve meaning and avoid summarizing or omitting technical content.
- [ ] The unstructured Narration Guide is persisted on the Document.
- [ ] Narration Text is persisted on eligible Blocks as `block.narration.text` and visible in Debug Overlay Block Evidence.
- [ ] Rewrite calls process small batches of 4 Blocks by default.
- [ ] Missing or invalid batch outputs are retried per Block.
- [ ] Processing Events show Narration Guide generation through phase-specific `narration.guide.*` event types in the Document event sidebar.
- [ ] Processing Events show per-Block/batched rewrite progress through phase-specific `narration.rewrite.*` event types in the Document event sidebar.
- [ ] Narration failures after Reader View readiness do not change the Document's existing `processingStatus`.
- [ ] Failures are surfaced as warning/error Processing Events without hiding the Reader View.

## Blocked by

- `.scratch/rewrite-v1/issues/10b-narration-candidates-and-eligibility.md`
