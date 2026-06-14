Status: draft

# Add FIFO Narration audio generation

## What to build

After Narration Text exists, enqueue eligible Blocks for Narration audio generation in Block order. Process one Block at a time for the selected Narration voice and persist generated audio metadata for later playback.

## Acceptance criteria

- [ ] FIFO audio generation starts only after Narration Text exists for eligible Blocks.
- [ ] Audio queue processes one Block at a time in Block order.
- [ ] Audio generation respects the Document's Processing Configuration Narration voice.
- [ ] Generated audio objects are written to private storage.
- [ ] Narration audio metadata is persisted per Block and voice.
- [ ] Word timestamps/alignment status are persisted when the selected Narration backend provides them.
- [ ] Processing Events show per-Block Narration audio queue progress through phase-specific `narration.audio.*` event types in the Document event sidebar.
- [ ] Document page keeps live Processing Event delivery active for background Narration after the Document is `ready` or `readyWithWarnings`.
- [ ] Narration failures after Reader View readiness do not change the Document's existing `processingStatus`.
- [ ] Failures for individual Blocks are surfaced as warning/error Processing Events without hiding the Reader View.
- [ ] A failed Block does not prevent later queued Blocks from being attempted unless the backend is unavailable.

## Blocked by

- `.scratch/rewrite-v1/issues/10c-narration-preparation-and-rewrites.md`
