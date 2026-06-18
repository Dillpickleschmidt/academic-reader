Status: done

# Add as-ready Narration audio generation

## What to build

After Narration Text exists for an eligible Block, enqueue that Block for Narration audio generation immediately. Process one Block at a time for the selected Narration voice in readiness/enqueue order so audio starts as soon as each input Block is unblocked. Persist generated audio metadata for later playback.

## Acceptance criteria

- [x] Audio generation starts only after Narration Text exists for an eligible Block.
- [x] Blocks are enqueued for audio generation as soon as their Narration Text is persisted.
- [x] Audio queue processes one Block at a time in readiness/enqueue order.
- [x] Audio generation respects the Document's Processing Configuration Narration voice.
- [x] Generated audio objects are written to private storage.
- [x] Narration audio metadata is persisted per Block and voice.
- [x] Word timestamps/alignment status are persisted when the selected Narration backend provides them.
- [x] Processing Events show per-Block Narration audio queue progress through phase-specific `narration.audio.*` event types in the Document event sidebar.
- [x] Document page keeps live Processing Event delivery available for background Narration after the Document is `ready` or `readyWithWarnings`.
- [x] Narration failures after Reader View readiness do not change the Document's existing `processingStatus`.
- [x] Failures for individual Blocks are surfaced as warning/error Processing Events without hiding the Reader View.
- [x] A failed Block does not prevent later queued Blocks from being attempted unless the backend is unavailable.

## Blocked by

- `.scratch/rewrite-v1/issues/10c-narration-preparation-and-rewrites.md`

## Decisions

- Audio generation is as-ready rather than strict Document Block order. A Block is eligible for audio as soon as its Narration Text has been persisted.
- The queue uses a single worker and drains one item at a time in enqueue order.
- Plain Narration Text and rewritten Narration Text can enqueue at different times; this is intentional to minimize time-to-first-audio.
- Block-level TTS failures emit warnings and do not stop later queued Blocks.
- Fatal audio failures, such as unavailable backend/configuration or storage persistence failure, stop the audio queue.
- Audio generation is keyed by the selected Narration voice and persisted per Block/voice pair.
- Audio generation runs after Reader View readiness without mutating the Document `processingStatus`; status changes are represented only through Processing Events.

## Validation

- `bun test apps/api/src/narration-audio.test.ts`
- `bun run check`
