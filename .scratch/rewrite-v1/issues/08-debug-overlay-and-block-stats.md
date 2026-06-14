Status: done

# Add Debug Overlay and block stats

## What to build

Add the Debug Overlay to both Source View and Reader View. When debug mode is enabled, the overlay should make Block structure visible in place for every eligible Block with inspector-style colored overlays, hover/focus metadata cards, block type stats, and direct Cross-view Links where the same Block has both Source Geometry and Reader View content.

## Acceptance criteria

- [x] Debug Overlay toggles on/off without navigating away.
- [x] Source View shows colored bbox overlays only for Blocks with Source Geometry.
- [x] Source View overlay regions are visible by default while debug mode is on.
- [x] Debug Overlay causes zero Source View or Reader View layout shift.
- [x] Reader View shows inspector-style colored overlays over each Block without changing Block layout or rewriting `contentHtml`.
- [x] Hover/focus debug metadata shows Block Type, raw type, page, normalized bbox, content evidence, Narration status, and audio/alignment status when present.
- [x] Stats are computed live from Blocks.
- [x] Cross-view links appear only when a direct Block relationship exists.
- [x] Hover/focus reveals metadata cards; click navigates when a direct cross-view target exists.

## Blocked by

- `.scratch/rewrite-v1/issues/07-document-page-route.md`

## Comments

Implemented in the Document page with zero-layout-shift Debug Overlay chrome while debug mode is enabled:

- Source View draws inspector-style colored normalized bbox overlays only for Blocks with Source Geometry.
- Reader View draws measured inspector-style overlays over each rendered Block without adding Block padding, borders, margins, or in-flow ribbons.
- Source and Reader overlays reveal solid top-right metadata cards on hover/focus with Block identity, canonical Block Type, raw type, page, normalized Source Geometry, content evidence, narration status, and audio/alignment evidence when event data exists.
- Clicking a Source overlay jumps to the matching Reader Block; clicking a Reader overlay with Source Geometry jumps to the bbox top in Source View with a small top margin.
- Reader Blocks without Source Geometry still show overlays and hover metadata, but do not navigate.
- Block stats are computed live from loaded Blocks in a fixed floating panel.
- Cross-view links use the direct Block relationship only and are only available when Source Geometry exists.

Validation run:

```bash
cd apps/web && bun run check
cd apps/web && bun run build
git diff --check
```
