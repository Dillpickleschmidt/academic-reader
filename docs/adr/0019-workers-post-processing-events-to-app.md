# Workers post processing events to the app

Academic Reader workers send structured Processing Events to an authenticated app event endpoint instead of writing directly to Convex or object storage. The app validates a per-run ingest token, persists events to Convex, and fans them out to connected clients over SSE; this keeps worker secrets narrow and gives local Docker and Modal workers the same event path.

## Deferred scaling note

The v1 app event endpoint may fan out Processing Events to SSE clients with an in-memory broker. This is acceptable for the one-command local stack and single-process self-hosted deployments, including concurrent readers on one API process.

If the API is horizontally scaled across multiple processes, containers, or hosts, in-memory SSE fanout is no longer sufficient: a worker may post an event to one API process while the reader's SSE connection is held by another. Events remain safe because Convex is the source of truth, but instant live delivery may be missed.

Before running multiple API replicas, replace or augment the in-memory broker with shared fanout such as Redis pub/sub, NATS, Postgres listen/notify, sticky routing by Source Document, or a Convex-driven subscription strategy.
