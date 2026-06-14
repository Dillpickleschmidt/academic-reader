# Workers post Processing Events to the app

Workers post Processing Events to the app API, not directly to Convex. The app API validates a per-run ingest token, persists the event through Convex, and fans it out to live SSE subscribers. This keeps Convex service credentials out of workers and gives the app one place to validate event ingestion.

Before running multiple API replicas, replace or augment the in-memory broker with shared fanout such as Redis pub/sub, NATS, Postgres listen/notify, sticky routing by Document, or a Convex-driven subscription strategy.
