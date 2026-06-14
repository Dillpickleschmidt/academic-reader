Status: done

# Add Narration Candidates and Eligibility

## What to build

Before generating Narration Text or audio, derive Narration Candidates from citation-marked Blocks and persist Narration Eligibility decisions. Programmatic hard exclusions should remove content that is clearly non-narratable before any LLM review. Remaining candidates are reviewed for whether they should contribute to Narration.

## Acceptance criteria

- [x] Narration remains enabled by default on first run and remembered afterward.
- [x] Narration Candidate extraction starts after Blocks exist and does not block Reader View readiness or delay `ready` / `readyWithWarnings` status.
- [x] Programmatic hard exclusions are persisted on Blocks with strict ineligible reasons:
  - `empty`
  - `image-only`
  - `table-only`
  - `page-header`
  - `page-footer`
  - `code`
  - `form`
  - `doi`
  - `copyright`
- [x] Figure Blocks with images and text produce a Narration Candidate with image content removed.
- [x] Table Blocks with prose outside table tags produce a Narration Candidate with table content removed.
- [x] Narration Candidate extraction preserves `inline-citation` spans from Block HTML.
- [x] Table-only Blocks are ineligible; table summaries/descriptions are eligible only when represented as prose in a Candidate.
- [x] Page headers and footers are hard-excluded only when the Conversion Model provided canonical `pageHeader` or `pageFooter` Block Types; repeated-header/footer inference is not implemented.
- [x] Minimal AI configuration is introduced with `AI_PROVIDER=groq`, `GROQ_API_KEY`, and task-specific `NARRATION_ELIGIBILITY_MODEL`, `NARRATION_GUIDE_MODEL`, and `NARRATION_REWRITE_MODEL` settings.
- [x] Non-Groq `AI_PROVIDER` values fail the Narration task that needs AI without adding non-Groq provider logic.
- [x] Missing Groq configuration does not fail app startup; it emits a phase-specific Narration failure event when Narration Eligibility Review runs.
- [x] Whole-phase configuration failure does not patch Blocks as `review-failed`.
- [x] Narration Eligibility Review uses `NARRATION_ELIGIBILITY_MODEL`.
- [x] Ambiguous text-bearing candidates are sent to one LLM Narration Eligibility Review pass rather than skipped programmatically.
- [x] The same LLM review pass assigns strict Narration Preparation tags for eligible Blocks: `plain`, `inline-citation-cleanup`, `inline-math`, and `equation-explanation`.
- [x] LLM review input includes only `blockId` and `candidateText`; Block Type and raw Block Type are not sent to the LLM.
- [x] LLM review output uses a flat shape with `blockId`, `decision`, `preparation`, and optional `reason`, then maps into persisted `block.narration`.
- [x] LLM eligibility review batches default to 20 candidates.
- [x] LLM batch output validation requires exactly one valid output for every input `blockId`, with no missing, duplicate, or unknown IDs.
- [x] Missing or invalid batch outputs are retried per Block.
- [x] If an individual eligibility retry fails, the Block is persisted as ineligible with API-assigned reason `review-failed`.
- [x] `plain` is not combined with other Narration Preparation tags.
- [x] Eligible candidates containing `inline-citation` spans receive `inline-citation-cleanup` rather than `plain`.
- [x] The LLM may assign `inline-citation-cleanup` for unmarked citation-like text it notices.
- [x] Standalone equation Blocks are eligible with `equation-explanation` rather than `plain`.
- [x] LLM Narration Eligibility review is general and does not depend on Document-specific Narration Guide context.
- [x] Reference entries are not programmatically excluded in this issue; the LLM review may mark them ineligible.
- [x] Persisted `block.narration` is a single object: eligible Blocks store `decision`, `preparation`, and optional `text`; ineligible Blocks store `decision` and `reason`.
- [x] Ineligible Blocks never store Narration Text.
- [x] Persisted eligibility is queryable by Document/Block and visible in Debug Overlay Block Evidence.
- [x] Generic `narration.started/progress/completed/warning/failed` event types are replaced with phase-specific Narration event types.
- [x] Processing Events show candidate extraction through phase-specific `narration.candidates.*` event types in the Document event sidebar.
- [x] Processing Events show LLM Narration Eligibility review through phase-specific `narration.eligibility.*` event types in the Document event sidebar.
- [x] Narration failures after Reader View readiness do not change the Document's existing `processingStatus`.
- [x] Failures are surfaced as warning/error Processing Events without hiding the Reader View.

## Blocked by

- `.scratch/rewrite-v1/issues/10a-inline-citation-markup.md`


## Comments

Implemented Narration Candidate extraction and Narration Eligibility Review as an API-owned background stage after Reader View projection. Blocks now persist optional `block.narration`; hard exclusions are patched immediately, and remaining candidates are reviewed in batches of 20 through Groq-backed `NARRATION_ELIGIBILITY_MODEL` when configured. Missing/non-Groq AI configuration emits `narration.eligibility.failed` without mass-marking candidates as `review-failed`; per-Block retry failure still persists `review-failed`.

Client-facing Processing Event delivery was simplified: workers and API still ingest events through the API, but clients now observe persisted Convex Processing Events directly through Convex subscriptions. The API-to-client SSE stream and in-memory event broker were removed.

Validation run:

```bash
cd packages/convex && bun run codegen
bunx biome check .env.local.example apps/api/package.json apps/api/src/ai.ts apps/api/src/ai.test.ts apps/api/src/html-fragment.ts apps/api/src/block-content.ts apps/api/src/documents.ts apps/api/src/narration-candidates.ts apps/api/src/narration-candidates.test.ts apps/api/src/narration-eligibility.ts apps/api/src/narration-eligibility.test.ts apps/api/src/routes/processing-events.ts apps/web/src/features/documents/DocumentDebug.tsx apps/web/src/features/documents/DocumentLibrary.tsx apps/web/src/features/documents/DocumentPage.tsx apps/web/src/features/documents/ProcessingEventsPanel.tsx packages/shared/package.json packages/shared/src/narration.ts packages/shared/src/processing-events.ts packages/convex/convex/api/blocks.ts packages/convex/convex/api/documentProjections.ts packages/convex/convex/api/documents.ts packages/convex/convex/api/processingEvents.ts packages/convex/convex/blockValidators.ts packages/convex/convex/schema.ts packages/convex/convex/model/blocks.ts packages/convex/convex/model/documentProjections.ts packages/convex/convex/model/documents.ts packages/convex/convex/model/processingEvents.ts packages/convex/convex/processingEventValidators.ts scripts/setup-dev.ts docs/adr/0002-processing-history-as-events.md docs/adr/0007-use-convex-for-persistence-and-reactivity.md docs/adr/0019-workers-post-processing-events-to-app.md
bun test apps/api/src/ai.test.ts apps/api/src/block-content.test.ts apps/api/src/narration-candidates.test.ts apps/api/src/narration-eligibility.test.ts apps/api/src/marker-result.test.ts apps/api/src/pdf-metadata.test.ts
bun run check
cd apps/web && bun run build
git diff --check
```
