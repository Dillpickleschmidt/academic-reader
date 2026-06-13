Status: ready-for-agent

# Implement Processing Event backbone

## What to build

Implement persisted Processing Events, worker event ingest, and live delivery via SSE. Events should use the shared broad/common strict event type union, required emitter, severity, message, emittedAt, optional progress/block/page fields, and debug-only data.

## Acceptance criteria

- [ ] Convex stores Processing Events for each Source Document.
- [ ] Events are ordered and displayed by Convex `_creationTime`.
- [ ] Worker/app emitted events include required `emittedAt`.
- [ ] API exposes authenticated worker event ingest using a per-run ingest token.
- [ ] Web app loads persisted events from Convex and receives live events over SSE without polling.

## Blocked by

- `.scratch/rewrite-v1/issues/04-create-source-document-from-processing-configuration.md`
