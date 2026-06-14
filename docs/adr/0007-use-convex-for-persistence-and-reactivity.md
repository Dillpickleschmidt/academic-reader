# Use Convex for persistence and reactivity

Academic Reader uses Convex for typed persistence, mutations, and reactive Document state. This keeps schema, API, and UI data access type-safe and avoids rebuilding realtime synchronization around SQLite and custom APIs. Processing Events are persisted in Convex and delivered to clients through Convex subscriptions, while workers still post events to the app API for ingest-token validation.
