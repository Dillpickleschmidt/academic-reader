Status: ready-for-agent

# Add hard delete for Documents

## What to build

Add confirmed hard delete for Documents. Deletion removes Convex records and object-storage artifacts for the Document, including its Source Document, extracted images, generated audio, Blocks, Pages, Table of Contents Entries, and Processing Events.

## Acceptance criteria

- [ ] Document list exposes a delete action with confirmation.
- [ ] Delete is authenticated and ownership-checked.
- [ ] Convex records for the Document are removed.
- [ ] Object storage artifacts for the Document are removed.
- [ ] The UI removes the deleted Document reactively.

## Blocked by

- `.scratch/rewrite-v1/issues/07-document-page-route.md`
