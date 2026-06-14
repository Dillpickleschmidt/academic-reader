Status: superseded

# Add Narration Text and FIFO audio queue

This issue was split because Narration should be staged before audio generation:

- `.scratch/rewrite-v1/issues/10a-inline-citation-markup.md`
- `.scratch/rewrite-v1/issues/10b-narration-candidates-and-eligibility.md`
- `.scratch/rewrite-v1/issues/10c-narration-preparation-and-rewrites.md`
- `.scratch/rewrite-v1/issues/10d-fifo-narration-audio-generation.md`

The original scope jumped directly from Blocks to audio generation. The revised plan first marks Inline Citations in Block HTML, derives Narration Candidates, persists Narration Eligibility, prepares Narration Text, then generates Narration audio in FIFO order.
