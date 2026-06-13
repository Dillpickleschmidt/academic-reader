Status: ready-for-agent

# Build document workbench route

## What to build

Build `/documents/$sourceDocumentId` as the main document workbench. It presents Source View and Readable View as peer views: side-by-side on larger screens and switchable on small screens. Source PDFs render with `pdfjs-dist`; image Source Documents render as a single Page. Readable View is derived live from ordered Blocks.

## Acceptance criteria

- [ ] Route loads Source Document, Pages, Blocks, and Processing Events.
- [ ] Source View uses short-lived presigned URLs for original PDF/image access.
- [ ] PDF Source View renders with `pdfjs-dist` and app-owned overlay layers.
- [ ] Readable View renders ordered Blocks with one minimal wrapper per Block.
- [ ] Independent scrolling works; no automatic scroll sync is implemented.

## Blocked by

- `.scratch/rewrite-v1/issues/06-marker-conversion-vertical-slice.md`
