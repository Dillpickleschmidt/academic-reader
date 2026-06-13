Status: ready-for-agent

# Add PDF page labels and resolved outline TOC

## What to build

Use PDF-provided Page Labels and resolved PDF outline/bookmarks when available. Physical Page remains canonical. Do not infer page offsets, do not use LLM TOC extraction, and do not create guessed Table of Contents Entries.

## Acceptance criteria

- [ ] Physical Page numbers are one-based and canonical in schema/UI links.
- [ ] PDF-provided Page Labels are displayed when available.
- [ ] PDF outline/bookmarks are stored/displayed only when destinations resolve to Physical Pages or Blocks.
- [ ] No inferred offsets or guessed TOC links are created.

## Blocked by

- `.scratch/rewrite-v1/issues/07-document-workbench-route.md`
