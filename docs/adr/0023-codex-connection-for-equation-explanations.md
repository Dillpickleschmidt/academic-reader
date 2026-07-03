# Use Codex Connection for Equation Explanations

Academic Reader generates Equation Explanations with a Reader-scoped Codex Connection rather than OpenAI Platform API keys or the existing Groq Narration models. Each Reader connects their own Codex subscription. The connection uses Codex subscription-backed authentication modeled on Pi's working Codex flow, stores refresh credentials encrypted server-side, and uses `@earendil-works/pi-ai` where possible so the app does not reimplement Codex device-code auth, token refresh, request shape, or session caching behavior.

A `codexConnections` row exists for each connected Reader, and disconnect deletes that Reader's row. Device-code login uses at most one short-lived `codexConnectionAttempts` row per Reader at a time. Completed attempts are deleted after the Reader's connection is written; failed or expired attempts may remain until replaced so the UI can show the result.

Disconnecting a Codex Connection clears Academic Reader's stored encrypted refresh token and connection metadata needed to make requests for that Reader. v1 does not call Codex token revocation endpoints directly unless `@earendil-works/pi-ai` exposes a supported helper for that behavior.
