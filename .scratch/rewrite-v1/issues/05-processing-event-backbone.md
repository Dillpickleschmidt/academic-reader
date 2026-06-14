Status: done

# Implement Processing Event backbone

## What to build

Implement persisted Processing Events, worker event ingest, and live delivery via SSE. Events should use the shared broad/common strict event type union, required emitter, severity, message, emittedAt, optional progress/block/page fields, and debug-only data.

## Acceptance criteria

- [x] Convex stores Processing Events for each Document.
- [x] Events are ordered and displayed by Convex `_creationTime`.
- [x] Worker/app emitted events include required `emittedAt`.
- [x] API exposes authenticated worker event ingest using a per-run ingest token.
- [x] Web app loads persisted events from Convex and receives live events over SSE without polling.

## Blocked by

- `.scratch/rewrite-v1/issues/04-create-source-document-from-processing-configuration.md`

## Comments

Validated through the Issue 06 Marker vertical slice smoke test: Marker posted `conversion.started`, `conversion.progress`, `conversion.warning`, and `conversion.completed` through the app API; events persisted in Convex and appeared live in the web Processing Events panel without polling.
