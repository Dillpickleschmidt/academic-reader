Status: done

# Add hard delete for Documents

## What to build

Add confirmed hard delete for Documents. Deletion removes Convex records and object-storage artifacts for the Document, including its Source Document, extracted images, generated audio, Blocks, Pages, Table of Contents Entries, and Processing Events.

## Acceptance criteria

- [x] Document list exposes a delete action with confirmation.
- [x] Delete is authenticated and ownership-checked.
- [x] Convex records for the Document are removed.
- [x] Object storage artifacts for the Document are removed.
- [x] The UI removes the deleted Document reactively.

## Blocked by

- `.scratch/rewrite-v1/issues/07-document-page-route.md`

## Decisions

- Document deletion enters through the app API so storage cleanup cannot be bypassed by the web client.
- The Convex hard-delete mutation requires both the API service secret and the authenticated Reader, preserving ownership checks.
- Object storage cleanup deletes the Source Document object explicitly and deletes generated Document artifacts by Document-owned storage prefix.
- Convex records are deleted after storage cleanup so a failed storage cleanup leaves the Document visible and retryable.

## Validation

- `bun run check`
- `cd apps/web && bun run build`
