Status: done

# Build document workbench route

## What to build

Build `/documents/$sourceDocumentId` as the main document workbench. It presents Source View and Readable View as peer views: side-by-side on larger screens and switchable on small screens. Source PDFs render with `pdfjs-dist`; image Source Documents render as a single Page. Readable View is derived live from ordered Blocks.

## Acceptance criteria

- [x] Route loads Source Document, Pages, Blocks, and Processing Events.
- [x] Source View uses short-lived presigned URLs for original PDF/image access.
- [x] PDF Source View renders with `pdfjs-dist` and app-owned overlay layers.
- [x] Readable View renders ordered Blocks with one minimal wrapper per Block.
- [x] Independent scrolling works; no automatic scroll sync is implemented.

## Blocked by

- `.scratch/rewrite-v1/issues/06-marker-conversion-vertical-slice.md`

## Comments

Implemented `/documents/$sourceDocumentId` as the document workbench route:

- Source Document, Pages, Blocks, and Processing Events load through existing Convex queries/components.
- Source View obtains an authenticated short-lived presigned source URL from the app API, then the browser fetches the original Source Document directly from storage.
- PDF Source View uses `pdfjs-dist` with a Vite-managed local worker asset and per-page app-owned overlay layers.
- Image Source Documents render as one Page; TIFF Source Documents render through `utif` onto canvas.
- Readable View renders ordered Blocks with one `article` wrapper per Block and rewrites persisted Block image references to short-lived direct storage URLs before injecting Block HTML.
- The old app-byte image route was replaced by authenticated presigned image URL access, keeping Source Document/image bandwidth off the API server.
- Desktop presents Source View and Readable View side-by-side with independent scroll containers; mobile uses a Source/Readable switcher without scroll sync.

Validation run:

```bash
cd apps/web && bun run generate-routes
bun run check
cd apps/web && bun run build
git diff --check
```
