# Narration audio follows available Narration Text

Academic Reader generates Narration only after a Block has Narration Text. As soon as each Block's Narration Text is ready, it enters a single-worker audio queue. The queue processes available items in arrival order, not strict Block order; this keeps resource use predictable and lets audio generation start as soon as useful work exists.
