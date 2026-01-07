# Academic Reader

PDF → readable HTML converter using [Marker](https://github.com/datalab-to/marker).

Supports PDF, DOCX, XLSX, PPTX, HTML, EPUB, and images.

## Quick Start

```bash
cp .env.dev.example .env.dev   # Configure dev environment
bun run dev                    # Start development servers
```

## Backend Modes

| Mode      | GPU           | File Storage     | Setup                      |
| --------- | ------------- | ---------------- | -------------------------- |
| `local`   | Your machine  | Local filesystem | NVIDIA GPU + Docker        |
| `runpod`  | Runpod cloud  | S3/R2/MinIO      | Runpod API key + S3 config |
| `datalab` | Datalab cloud | Memory (temp)    | Datalab API key            |

Set `BACKEND_MODE` in `.env.dev` for development.

## Architecture

```
                     ┌─────────────────────┐     ┌─────────────────┐
     Browser ───────▶│         VPS         │────▶│ Runpod/Datalab  │
                     │  (Hono + Frontend)  │     │   (GPU/API)     │
                     └─────────────────────┘     └─────────────────┘
                              │
                              ▼
                     ┌─────────────────────┐
                     │  Cloudflare R2 or   │
                     │  MinIO (S3 Storage) │
                     └─────────────────────┘
```

Frontend and API served from VPS. Cloudflare proxy (orange cloud DNS) provides CDN caching for static assets.

### API Endpoints

| Endpoint                      | Purpose                     |
| ----------------------------- | --------------------------- |
| `POST /api/upload`            | Upload file (to S3 or temp) |
| `POST /api/convert/:fileId`   | Start conversion job        |
| `GET /api/jobs/:jobId/stream` | SSE progress stream         |
| `GET /api/download/:jobId`    | Download converted HTML     |
| `GET /api/auth/*`             | Auth (proxied to Convex)    |

### Storage

- **local mode** - /tmp/academic-reader-uploads/{uuid}.{ext} (dev mode only)
- **datalab mode** - In-Memory: API accepts files directly for processing
- **runpod mode** - S3/R2 cloud for prod, and stored locally with MinIO and exposed to runpod instance via anonymous temp cloudflared tunnel for dev mode

## Development

```bash
bun run dev            # Start with mode from .env.dev
bun run dev:local      # Override to local mode
bun run dev:datalab    # Override to datalab mode
bun run dev:runpod     # Override to runpod mode
```

Add `--dashboard` to enable Convex dashboard at localhost:6791.

All modes use self-hosted Convex via Docker - no account needed.

## Production Deployment

### Prerequisites

1. VPS with Docker installed (e.g., Hetzner)
2. Domain with DNS on Cloudflare (proxy enabled for CDN caching)
3. Cloudflare Tunnel for Convex backend access

### Initial VPS Setup

```bash
# SSH to VPS
ssh root@<your-vps-ip>

# Clone repo
git clone <your-repo> /root/academic-reader
cd /root/academic-reader

# Create production env file
cp .env.production.example .env.production
# Edit .env.production with your production secrets
```

Copy `CONVEX_SELF_HOSTED_ADMIN_KEY` and `BETTER_AUTH_SECRET` from your local `.env.dev` to the VPS `.env.production`.

### Configure Local Deploy Settings

In your local `.env.dev`, set the deploy metadata:

```bash
PROD_VPS_HOST_IP=<your-vps-ip>
PROD_VPS_USER=root
PROD_VPS_PATH=/root/academic-reader
PROD_DOMAIN=yourdomain.com
```

### Deploy

```bash
bun run deploy
```

This will:

1. Pull latest code and rebuild Docker containers on VPS (includes frontend build)
2. Deploy Convex functions
3. Sync Convex environment variables

### Cloudflare Setup

**DNS (for main app):**

1. Add A record: `@` → `<VPS_IP>` with **Proxy enabled** (orange cloud)

**Tunnel (for Convex backend):**

1. Create a tunnel in Cloudflare Zero Trust → Networks → Tunnels
2. Copy the tunnel token to `CLOUDFLARE_TUNNEL_TOKEN` in VPS `.env.production`
3. Configure public hostname:

| Subdomain | Domain         | Service | URL                   |
| --------- | -------------- | ------- | --------------------- |
| convex    | yourdomain.com | HTTP    | `convex-backend:3210` |

Dashboard is localhost-only for security. Access via SSH tunnel: `ssh -L 6791:localhost:6791 yourserver`

## Configuration

### Development (.env.dev)

| Variable             | Required     | Description                            |
| -------------------- | ------------ | -------------------------------------- |
| `BACKEND_MODE`       | Yes          | `local`, `runpod`, or `datalab`        |
| `SITE_URL`           | Yes          | Frontend URL (default: localhost:5173) |
| `DATALAB_API_KEY`    | datalab      | From [datalab.to](https://datalab.to)  |
| `RUNPOD_API_KEY`     | runpod       | From Runpod dashboard                  |
| `RUNPOD_ENDPOINT_ID` | runpod       | Your endpoint ID                       |
| `GOOGLE_API_KEY`     | local/runpod | For Gemini API                         |

### Production (.env.production on VPS)

| Variable                       | Required | Description                          |
| ------------------------------ | -------- | ------------------------------------ |
| `BACKEND_MODE`                 | Yes      | `datalab` or `runpod`                |
| `SITE_URL`                     | Yes      | <https://yourdomain.com>             |
| `PROD_CONVEX_URL`              | Yes      | <https://convex.yourdomain.com>      |
| `CLOUDFLARE_TUNNEL_TOKEN`      | Yes      | From Cloudflare Zero Trust           |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | Yes      | Copy from local .env.dev             |
| `BETTER_AUTH_SECRET`           | Yes      | Copy from local .env.dev             |
| `DATALAB_API_KEY`              | datalab  | Production API key                   |
| `PROD_S3_*`                    | runpod   | S3/R2 credentials                    |

### Deploy Metadata (in .env.dev)

| Variable           | Required | Description                     |
| ------------------ | -------- | ------------------------------- |
| `PROD_VPS_HOST_IP` | Yes      | VPS IP address                  |
| `PROD_VPS_USER`    | Yes      | SSH user (default: root)        |
| `PROD_VPS_PATH`    | Yes      | Repo path on VPS                |
| `PROD_DOMAIN`      | Yes      | Your domain (e.g., example.com) |

See `.env.dev.example` and `.env.production.example` for all options.
