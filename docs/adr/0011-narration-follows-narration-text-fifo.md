# Narration follows narration text in FIFO order

Academic Reader generates Narration only after a Block has Narration Text. As soon as each Block's Narration Text is ready, it enters a FIFO audio queue processed one item at a time; this favors predictable resource use, easy-to-follow Processing Events, and simple failure handling over maximum parallel throughput.
