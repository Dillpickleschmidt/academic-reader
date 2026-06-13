Status: done

# Implement Marker conversion vertical slice

## What to build

Enable Marker as the first Conversion Model. Marker should run locally or on Modal according to deployment config, emit fine-grained Processing Events through a tested tqdm hook, adapt output into Pages and Blocks, and make the Readable View ready from ordered Block HTML.

## Acceptance criteria

- [x] Marker is enabled in Processing Configuration and selected by default.
- [x] Marker supports Use LLM and Force OCR options.
- [x] Marker worker emits fine-grained structured progress events from real runs.
- [x] Adapter persists Pages with physical page numbers and dimensions.
- [x] Adapter persists Blocks with required `contentHtml`, canonical Block Type, raw type, order, optional `contentMarkdown`, optional one-based page, and optional normalized top-left bbox.
- [x] Final status becomes `ready`, `readyWithWarnings`, or `failed`.

## Blocked by

- `.scratch/rewrite-v1/issues/05-processing-event-backbone.md`

## Comments

Implemented the Marker vertical slice using the current domain language and ADR constraints:

- API now owns Source Document creation + Marker start via `POST /api/source-documents`.
- Convex now persists Pages and Blocks and supports `readyWithWarnings`.
- API Marker result callback validates the per-run ingest token, saves image assets, rewrites Block HTML image sources, replaces Pages/Blocks idempotently while processing, and marks final status.
- Local `CONVERSION_BACKEND=local` starts the GPU Marker worker in Docker Compose; there is no CPU fallback.
- Local `CONVERSION_BACKEND=modal` starts Cloudflare quick tunnels for the app API and MinIO, then passes those URLs to the API process so the reader does not configure local callback/storage tunnel URLs manually.
- `bun run deploy:workers` deploys Modal workers only when their hashed source contents changed, discovers `MODAL_MARKER_URL`, and writes it into `.env.local`.
- Worker has a tested tqdm hook and posts Processing Events through the app API.
- Modal Marker model loading now happens inside the per-run method instead of `@modal.enter()`, so cold-start/model-download tqdm output can become Processing Events for the active Source Document.

Validation run:

```bash
cd packages/convex && bun run codegen
bun run check
python -m py_compile workers/marker/app/*.py workers/marker/modal_app.py workers/marker/tests/test_progress.py
PYTHONPATH=workers/marker python -m unittest workers.marker.tests.test_progress -v
docker compose --env-file .env.local config
bun build scripts/dev.ts --target=bun --outfile=/tmp/academic-reader-dev-check.js
bun build scripts/setup-dev.ts --target=bun --outfile=/tmp/academic-reader-setup-dev-check.js
bun build scripts/deploy-workers.ts --target=bun --outfile=/tmp/academic-reader-deploy-workers-check.js
```

Local Marker smoke test completed: GPU Marker processed a Source Document, emitted live Processing Events, persisted Pages/Blocks, and reached `readyWithWarnings` with `conversion.completed`. Modal Marker smoke test also completed after redeploy: model download/load and conversion progress appeared in the web Processing Events panel, and the run completed successfully.
