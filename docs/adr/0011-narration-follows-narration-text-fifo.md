# Narration audio follows available Block order

Academic Reader generates Narration audio only after a Block has Narration Text. As soon as each Block's Narration Text is ready, it enters a single-worker audio queue. The queue processes the earliest Block order among currently available items, without waiting for earlier Blocks whose Narration Text is not ready yet. This keeps audio generation streaming while still preferring Block order whenever the next earlier Block becomes available before the worker picks another item.
