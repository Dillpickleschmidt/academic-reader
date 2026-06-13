# Workers post processing events to the app

Academic Reader workers send structured Processing Events to an authenticated app event endpoint instead of writing directly to Convex or object storage. The app validates a per-run ingest token, persists events to Convex, and fans them out to connected clients over SSE; this keeps worker secrets narrow and gives local Docker and Modal workers the same event path.
