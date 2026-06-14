# One processing run per Document

Academic Reader keeps exactly one Processing Run for each Document. If the reader wants a different conversion attempt, they create a new Document from the Source Document; this preserves a small code footprint and avoids version-management UI while still keeping the one run's Processing Events inspectable.
