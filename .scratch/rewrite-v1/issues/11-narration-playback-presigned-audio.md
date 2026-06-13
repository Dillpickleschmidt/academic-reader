Status: ready-for-agent

# Add Narration playback with presigned audio URLs

## What to build

Persist generated Narration audio metadata and play it from short-lived presigned direct storage URLs requested just-in-time. Keep audio files private while avoiding app-server proxying for large/seekable audio.

## Acceptance criteria

- [ ] Narration audio metadata is stored per Block and voice.
- [ ] Word timestamps/alignment status are stored when available.
- [ ] Playback requests fresh presigned URLs after an auth/ownership check.
- [ ] Expired playback URLs can be refreshed by requesting a new URL.
- [ ] Debug Overlay shows whether a Block has audio, duration, and alignment evidence.

## Blocked by

- `.scratch/rewrite-v1/issues/10-narration-text-and-fifo-audio-queue.md`
