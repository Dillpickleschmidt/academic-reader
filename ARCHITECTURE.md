# Architecture

## Repository Structure

```
academic-reader/
├── package.json          # Bun workspace root
├── frontend/             # React + Vite
├── api/                  # Hono API server (Bun)
└── worker/               # Python FastAPI + Marker (Docker/Runpod)
```

## Deployment Modes

| Mode | Frontend | API | GPU Worker |
|------|----------|-----|------------|
| **Local Dev** | Vite (localhost:5173) | Bun (localhost:8787) | Docker |
| **Production** | Static CDN | Bun (Hetzner VPS) | Runpod/Datalab |

## Architecture

```
┌──────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│   Frontend   │────▶│   Hetzner VPS       │────▶│ Runpod/Datalab  │
│ (Static CDN) │     │   (Bun API Server)  │     │   (GPU/API)     │
└──────────────┘     └─────────────────────┘     └─────────────────┘
                              │
                              ▼
                     ┌─────────────────────┐
                     │  Cloudflare R2 or   │
                     │  MinIO (S3 Storage) │
                     └─────────────────────┘
```

## API Server (Bun + Hono)

The `/api` package routes requests to one of three backends:

| Backend | Config | Use Case |
|---------|--------|----------|
| `local` | `BACKEND_MODE=local` | Development with local GPU |
| `runpod` | `BACKEND_MODE=runpod` | Production with Runpod GPU |
| `datalab` | `BACKEND_MODE=datalab` | Production with Datalab API |

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /upload` | Upload file (to S3 or temp storage) |
| `POST /convert/:fileId` | Start conversion job |
| `GET /jobs/:jobId/stream` | SSE progress stream |
| `GET /download/:jobId` | Download converted HTML |

### Storage

- **S3/R2** (runpod mode): PDF uploads, conversion results
- **Memory** (datalab mode): Temporary file storage before API call
- **Local** (local mode): Files handled by FastAPI worker

## Local Development

```bash
bun run dev              # Start with .env.dev settings
bun run dev --mode local # Use local Docker GPU worker
bun run dev --dashboard  # Enable Convex dashboard
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start full dev environment |
| `bun run dev:local` | Dev with local Docker worker |
| `bun run dev:runpod` | Dev with Runpod backend |
| `bun run dev:datalab` | Dev with Datalab backend |
| `bun run deploy` | Deploy to production (VPS + Cloudflare) |
| `bun run build` | Build frontend |
| `bun run typecheck` | Typecheck all packages |
