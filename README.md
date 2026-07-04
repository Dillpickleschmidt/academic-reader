# Academic Reader

## Development

Install dependencies and generate local environment defaults:

```bash
bun install
bun run setup:dev
```

Start the full local development stack:

```bash
bun run dev
```

Start the stack with the self-hosted Convex dashboard:

```bash
bun run dev --dashboard
```

Then open:

- App: http://localhost:5173
- API: http://localhost:8787
- Convex dashboard: http://localhost:6791
- MinIO console: http://localhost:9001

To wipe local development data:

```bash
docker compose --env-file .env.local down
sudo rm -rf convex-data minio-data
bun run dev
```
