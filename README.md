# Academic Reader

PDF → readable HTML converter using [Marker](https://github.com/datalab-to/marker).

Supports PDF, DOCX, XLSX, PPTX, HTML, EPUB, and images.

## Quick Start

```bash
cp .env.example .env.local   # Set BACKEND_MODE + API keys
bun run config:status        # Check your api keys
bun run dev                  # Start
```

## Deployment Modes

| Mode      | GPU           | File Storage     | Setup                      |
| --------- | ------------- | ---------------- | -------------------------- |
| `local`   | Your machine  | Local filesystem | NVIDIA GPU + Docker        |
| `runpod`  | Runpod cloud  | S3/R2/MinIO      | Runpod API key + S3 config |
| `datalab` | Datalab cloud | Memory (temp)    | Datalab API key            |

Set `BACKEND_MODE` in `.env.local` to `local`, `runpod`, or `datalab`.

## Production Deployment

```bash
# Configure PROD_* variables in .env.local (see .env.example)
bun run deploy
```

This will:

1. SSH to your VPS, pull latest code, restart Docker Compose (API + Convex)
2. Build frontend with production URLs
3. Deploy frontend to Cloudflare Pages

**Initial VPS setup:** Clone the repo and install Docker on your VPS first. The deploy command handles subsequent updates.

## Configuration

| Variable             | Required | Description                           |
| -------------------- | -------- | ------------------------------------- |
| `BACKEND_MODE`       | Yes      | `local`, `runpod`, or `datalab`       |
| `DATALAB_API_KEY`    | datalab  | From [datalab.to](https://datalab.to) |
| `RUNPOD_API_KEY`     | runpod   | From Runpod dashboard                 |
| `RUNPOD_ENDPOINT_ID` | runpod   | Your endpoint ID                      |
| `S3_ENDPOINT`        | runpod   | S3/R2 endpoint                        |
| `S3_ACCESS_KEY`      | runpod   | S3/R2 access key                      |
| `S3_SECRET_KEY`      | runpod   | S3/R2 secret key                      |
| `S3_BUCKET`          | runpod   | Bucket name                           |

See `.env.example` for all options.

## Authentication

| Environment | Convex Backend                     | Setup Required                |
| ----------- | ---------------------------------- | ----------------------------- |
| Development | Self-hosted (Docker)               | None - starts automatically   |
| Production  | [Convex Cloud](https://convex.dev) | Convex account + Google OAuth |

**Development (`bun run dev`):** All modes (local, runpod, datalab) use self-hosted Convex via Docker - no account needed. A Convex dashboard is available at <http://localhost:6791> for browsing data when run with the `--dashboard` flag.

**Production:** Requires Convex Cloud. Run `bunx convex deploy` in `frontend/` to create a production deployment, then add `CONVEX_DEPLOYMENT` and `CONVEX_URL` to `.env.local`. Also add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for OAuth.

## Development

```bash
bun run dev              # Start with mode from .env.local
bun run dev --mode local # Override to local mode
bun run dev --dashboard  # Enable Convex dashboard
```
