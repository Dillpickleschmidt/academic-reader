Status: done

# Add Narration playback with presigned audio URLs

## What to build

Persist generated Narration audio metadata and play it from short-lived presigned direct storage URLs requested just-in-time. Keep audio files private while avoiding app-server proxying for large/seekable audio.

## Acceptance criteria

- [x] Narration audio metadata is stored per Block and voice.
- [x] Word timestamps/alignment status are stored when available.
- [x] Playback requests fresh presigned URLs after an auth/ownership check.
- [x] Expired playback URLs can be refreshed by requesting a new URL.
- [x] Debug Overlay shows whether a Block has audio, duration, and alignment evidence.

## Blocked by

- `.scratch/rewrite-v1/issues/10d-fifo-narration-audio-generation.md`

## Decisions

- Playback uses short-lived browser-direct storage URLs rather than app-server proxying.
- The app API signs playback URLs only after authenticating the Reader and checking ownership through Convex.
- The web client requests audio access just in time when playback starts, and retry requests a fresh URL.
- Word timestamps are returned with playback access for word-level highlighting; summary audio metadata remains available through Convex for Debug Overlay evidence.
- Audio files remain private storage objects.

## Validation

- `bun run check`
- `cd apps/web && bun run build`

Web build still emits the existing large chunk warning.
