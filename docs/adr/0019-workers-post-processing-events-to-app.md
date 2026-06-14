# Workers post Processing Events to the app

Workers post Processing Events to the app API, not directly to Convex. The app API validates a per-run ingest token and persists the event through Convex. Clients observe persisted Processing Events through Convex subscriptions.

This keeps Convex service credentials out of workers, gives the app one place to validate event ingestion, and avoids a separate app-owned client fanout path for data that is already stored in Convex.
