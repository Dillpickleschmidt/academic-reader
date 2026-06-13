Status: ready-for-agent

# Add client-side ambience and music UI

## What to build

Add functional client-side ambience/music controls using static tracks. This is reader UI only: no backend processing, no generated artifacts, and no effect on Processing Configuration.

## Acceptance criteria

- [ ] Reader can choose ambience and music tracks from the document workbench UI.
- [ ] Controls support play/pause and volume for local static tracks.
- [ ] Ambience/music state does not affect Source Document processing.
- [ ] UI is integrated without blocking Narration playback work.

## Blocked by

- `.scratch/rewrite-v1/issues/07-document-workbench-route.md`
