Status: ready-for-agent

# Add Narration Text and FIFO audio queue

## What to build

When Narration is enabled in Processing Configuration, generate Narration Text for eligible Blocks after Blocks exist. As each Block's Narration Text is ready, enqueue it for audio generation in FIFO order with one Block processed at a time.

## Acceptance criteria

- [ ] Narration is enabled by default on first run and remembered afterward.
- [ ] Narration Text generation starts after Blocks exist and does not block Readable View readiness.
- [ ] Audio queue processes one Block at a time in Block order.
- [ ] Processing Events show Narration Text and audio queue progress.
- [ ] Failures are surfaced as warning/error events without hiding the Readable View.

## Blocked by

- `.scratch/rewrite-v1/issues/06-marker-conversion-vertical-slice.md`
