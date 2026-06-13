Status: ready-for-agent

# Add Debug Overlay and block stats

## What to build

Add the Debug Overlay to both Source View and Readable View. The overlay should make Block structure visible in place with colored boxes/badges, hover details, block type stats, and direct Cross-view Links where the same Block has both Source Geometry and Readable View content.

## Acceptance criteria

- [ ] Debug Overlay toggles on/off without navigating away.
- [ ] Source View shows colored bbox overlays only for Blocks with Source Geometry.
- [ ] Readable View shows Block wrappers/metadata without rewriting `contentHtml`.
- [ ] Hover/click details show Block Type, raw type, page, bbox, content evidence, Narration status, and audio/alignment status when present.
- [ ] Stats are computed live from Blocks.
- [ ] Cross-view links appear only when a direct Block relationship exists.

## Blocked by

- `.scratch/rewrite-v1/issues/07-document-workbench-route.md`
