# Use Convex for persistence and reactivity

Academic Reader uses Convex for typed persistence, mutations, and reactive document state even though the product is a personal research workbench. This keeps schema, API, and UI data access type-safe and avoids rebuilding realtime synchronization around SQLite and custom APIs; SSE remains the transport for Processing Events because those events are append-only worker output rather than general query state.
