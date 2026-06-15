Status: done

# Add Narration Preparation and rewrites

## What to build

After Narration Eligibility exists, generate a Narration Guide from eligible Blocks only, then generate Narration Text for eligible Blocks. Narration Preparation should support multiple preparation needs per eligible Block and use targeted directives for content that needs special handling, especially inline citations and math.

## Acceptance criteria

- [x] Narration Text generation starts only after Narration Eligibility exists for the whole Document.
- [x] Narration Text generation starts only when at least one Block is eligible.
- [x] Per-Block `review-failed` eligibility outcomes count as completed ineligible decisions and do not block Narration Text generation for other eligible Blocks.
- [x] A compact unstructured Narration Guide is generated from eligible Blocks only using `NARRATION_GUIDE_MODEL`.
- [x] Narration Guide input is cleaned plain text from eligible Blocks in document order, capped at 350,000 characters.
- [x] Narration Guide input truncation emits `narration.guide.warning` and does not persist separate truncation metadata.
- [x] Narration Guide generation failure stops rewrites and leaves `block.narration.text` unset.
- [x] Per-Block or batched rewrites use `NARRATION_REWRITE_MODEL` and receive the Narration Guide, the Block's own candidate HTML, and Narration Preparation directives.
- [x] Rewrite input does not include neighboring Blocks in v1.
- [x] Eligible Blocks may carry multiple Narration Preparation tags: `plain`, `inline-citation-cleanup`, `inline-math`, and `equation-explanation`.
- [x] `plain` is not combined with other Narration Preparation tags.
- [x] Inline citation cleanup is performed by the LLM rewrite using persisted `inline-citation` spans rather than by deterministic removal.
- [x] Inline math is rendered as natural spoken prose.
- [x] Standalone/display equations are explained with their components and relationship, not merely read as symbols.
- [x] `plain` candidates become one clean spoken Narration Text string without an LLM rewrite after basic HTML-to-text cleanup.
- [x] Deterministic `plain` cleanup preserves inline citation text if bad state slips through.
- [x] LLM rewrites preserve meaning and avoid summarizing or omitting technical content.
- [x] LLM rewrite output is plain text only, not SSML or markup.
- [x] The unstructured Narration Guide is persisted on the Document as `narrationGuide`.
- [x] Narration Text is persisted on eligible Blocks as `block.narration.text` and visible in Debug Overlay Narration State.
- [x] Debug Overlay does not show the full Narration Guide.
- [x] Rewrite calls process small batches of 4 Blocks by default.
- [x] Missing or invalid batch outputs are retried per Block.
- [x] Individual rewrite failure leaves that Block's `block.narration.text` unset and emits warning evidence.
- [x] Processing Events show Narration Guide generation through phase-specific `narration.guide.*` event types in the Document event sidebar.
- [x] Processing Events show per-Block/batched rewrite progress through phase-specific `narration.rewrite.*` event types in the Document event sidebar.
- [x] 10b emits `narration.eligibility.warning` when no eligible Blocks are found, and 10c is not normally started in that case.
- [x] 10c is wired immediately after successful 10b eligibility completion in the same API background flow.
- [x] Narration failures after Reader View readiness do not change the Document's existing `processingStatus`.
- [x] Failures are surfaced as warning/error Processing Events without hiding the Reader View.

## Blocked by

- `.scratch/rewrite-v1/issues/10b-narration-candidates-and-eligibility.md`

## Decisions

- 10c waits for whole-Document eligibility before Guide/rewrite work starts because the Narration Guide needs whole-document eligible content.
- 10c runs only when eligibility completed and `eligibleCount > 0`; if invoked anyway with zero eligible Blocks, it no-ops safely with events.
- Guide generation failure stops rewrites.
- Guide input uses eligible Block plain text in order, capped at 350,000 characters, with truncation reported only as a Processing Event.
- `plain` Blocks use deterministic HTML-to-text cleanup; non-plain Blocks use LLM rewrite.
- Rewrite output must be one plain-text item per input Block ID; invalid batches retry per Block.
- Failed individual rewrites leave Narration Text unset rather than falling back to potentially bad text.
- Rewrites receive own Block candidate HTML, Narration Guide, and preparation tags only; no neighboring Blocks in v1.
- The Narration Guide is persisted directly on `documents.narrationGuide` and is not shown in the Debug Overlay.
- Debug Overlay shows per-Block Narration State: decision, preparation/reason, and generated text state.


## Validation

- `cd packages/convex && bun run codegen`
- `bun test apps/api/src/ai.test.ts apps/api/src/narration-candidates.test.ts apps/api/src/narration-eligibility.test.ts apps/api/src/narration-preparation.test.ts apps/api/src/block-content.test.ts apps/api/src/marker-result.test.ts apps/api/src/pdf-metadata.test.ts`
- `bun run check`
- `cd apps/web && bun run build`
- `git diff --check`

Web build still emits the existing large chunk warning.
