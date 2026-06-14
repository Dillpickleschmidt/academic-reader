Status: draft

# Add Narration Candidates and Eligibility

## What to build

Before generating Narration Text or audio, derive Narration Candidates from citation-marked Blocks and persist Narration Eligibility decisions. Programmatic hard exclusions should remove content that is clearly non-narratable before any LLM review. Remaining candidates are reviewed for whether they should contribute to Narration.

## Acceptance criteria

- [ ] Narration remains enabled by default on first run and remembered afterward.
- [ ] Narration Candidate extraction starts after Blocks exist and does not block Reader View readiness or delay `ready` / `readyWithWarnings` status.
- [ ] Programmatic hard exclusions are persisted on Blocks with strict ineligible reasons:
  - `empty`
  - `image-only`
  - `table-only`
  - `page-header`
  - `page-footer`
  - `code`
  - `form`
  - `doi`
  - `copyright`
- [ ] Figure Blocks with images and text produce a Narration Candidate with image content removed.
- [ ] Table Blocks with prose outside table tags produce a Narration Candidate with table content removed.
- [ ] Narration Candidate extraction preserves `inline-citation` spans from Block HTML.
- [ ] Table-only Blocks are ineligible; table summaries/descriptions are eligible only when represented as prose in a Candidate.
- [ ] Page headers and footers are hard-excluded only when the Conversion Model provided canonical `pageHeader` or `pageFooter` Block Types; repeated-header/footer inference is not implemented.
- [ ] Minimal AI configuration is introduced with `AI_PROVIDER=groq`, `GROQ_API_KEY`, and task-specific `NARRATION_ELIGIBILITY_MODEL`, `NARRATION_GUIDE_MODEL`, and `NARRATION_REWRITE_MODEL` settings.
- [ ] Non-Groq `AI_PROVIDER` values fail the Narration task that needs AI without adding non-Groq provider logic.
- [ ] Missing Groq configuration does not fail app startup; it emits a phase-specific Narration failure event when Narration Eligibility Review runs.
- [ ] Whole-phase configuration failure does not patch Blocks as `review-failed`.
- [ ] Narration Eligibility Review uses `NARRATION_ELIGIBILITY_MODEL`.
- [ ] Ambiguous text-bearing candidates are sent to one LLM Narration Eligibility Review pass rather than skipped programmatically.
- [ ] The same LLM review pass assigns strict Narration Preparation tags for eligible Blocks: `plain`, `inline-citation-cleanup`, `inline-math`, and `equation-explanation`.
- [ ] LLM review input includes only `blockId` and `candidateText`; Block Type and raw Block Type are not sent to the LLM.
- [ ] LLM review output uses a flat shape with `blockId`, `decision`, `preparation`, and optional `reason`, then maps into persisted `block.narration`.
- [ ] LLM eligibility review batches default to 20 candidates.
- [ ] LLM batch output validation requires exactly one valid output for every input `blockId`, with no missing, duplicate, or unknown IDs.
- [ ] Missing or invalid batch outputs are retried per Block.
- [ ] If an individual eligibility retry fails, the Block is persisted as ineligible with API-assigned reason `review-failed`.
- [ ] `plain` is not combined with other Narration Preparation tags.
- [ ] Eligible candidates containing `inline-citation` spans receive `inline-citation-cleanup` rather than `plain`.
- [ ] The LLM may assign `inline-citation-cleanup` for unmarked citation-like text it notices.
- [ ] Standalone equation Blocks are eligible with `equation-explanation` rather than `plain`.
- [ ] LLM Narration Eligibility review is general and does not depend on Document-specific Narration Guide context.
- [ ] Reference entries are not programmatically excluded in this issue; the LLM review may mark them ineligible.
- [ ] Persisted `block.narration` is a single object: eligible Blocks store `decision`, `preparation`, and optional `text`; ineligible Blocks store `decision` and `reason`.
- [ ] Ineligible Blocks never store Narration Text.
- [ ] Persisted eligibility is queryable by Document/Block and visible in Debug Overlay Block Evidence.
- [ ] Generic `narration.started/progress/completed/warning/failed` event types are replaced with phase-specific Narration event types.
- [ ] Processing Events show candidate extraction through phase-specific `narration.candidates.*` event types in the Document event sidebar.
- [ ] Processing Events show LLM Narration Eligibility review through phase-specific `narration.eligibility.*` event types in the Document event sidebar.
- [ ] Narration failures after Reader View readiness do not change the Document's existing `processingStatus`.
- [ ] Failures are surfaced as warning/error Processing Events without hiding the Reader View.

## Blocked by

- `.scratch/rewrite-v1/issues/10a-inline-citation-markup.md`
