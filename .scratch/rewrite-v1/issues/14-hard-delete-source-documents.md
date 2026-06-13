Status: ready-for-agent

# Add hard delete for Source Documents

## What to build

Add confirmed hard delete for Source Documents. Deletion removes Convex records and object-storage artifacts for the Source Document, including original source, extracted images, generated audio, Blocks, Pages, Table of Contents Entries, and Processing Events.

## Acceptance criteria

- [ ] Source Document list exposes a delete action with confirmation.
- [ ] Delete enforces Reader ownership.
- [ ] Convex records for the Source Document are removed.
- [ ] Object storage artifacts for the Source Document are removed.
- [ ] Deleted documents no longer appear in the library or open successfully.

## Blocked by

- `.scratch/rewrite-v1/issues/06-marker-conversion-vertical-slice.md`
