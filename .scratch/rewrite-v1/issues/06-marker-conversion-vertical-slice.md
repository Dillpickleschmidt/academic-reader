Status: ready-for-agent

# Implement Marker conversion vertical slice

## What to build

Enable Marker as the first Conversion Model. Marker should run locally or on Modal according to deployment config, emit fine-grained Processing Events through a tested tqdm hook, adapt output into Pages and Blocks, and make the Readable View ready from ordered Block HTML.

## Acceptance criteria

- [ ] Marker is enabled in Processing Configuration and selected by default.
- [ ] Marker supports Use LLM and Force OCR options.
- [ ] Marker worker emits fine-grained structured progress events from real runs.
- [ ] Adapter persists Pages with physical page numbers and dimensions.
- [ ] Adapter persists Blocks with required `contentHtml`, canonical Block Type, raw type, order, optional `contentMarkdown`, optional one-based page, and optional normalized top-left bbox.
- [ ] Final status becomes `ready`, `readyWithWarnings`, or `failed`.

## Blocked by

- `.scratch/rewrite-v1/issues/05-processing-event-backbone.md`
