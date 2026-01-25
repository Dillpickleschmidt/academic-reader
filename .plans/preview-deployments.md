# PR Preview Deployments Plan

## Goal

Auto-deploy preview environments for each PR with isolated Convex databases.

```
PR opened → preview deployed → pr-123.preview.academic-reader.com
PR closed → preview destroyed
```

## Architecture

### Option A: Shared Staging DB (Simpler)

- All PR previews share one staging Convex instance
- Isolated from prod, but PRs can affect each other
- Good for: UI changes, most use cases

### Option B: Ephemeral DB per PR (Full Isolation)

- Each PR gets its own Convex container
- Fully isolated, handles schema migration conflicts
- More resources, slightly more complex

## Prerequisites

### 1. Wildcard DNS

```
*.preview.academic-reader.com → preview server IP
```

### 2. Traefik on Preview Server

Must have Traefik running with Let's Encrypt for wildcard SSL.

### 3. GitHub Secrets

```
PREVIEW_SERVER_HOST      # Tailscale hostname or IP
PREVIEW_SERVER_SSH_KEY   # SSH private key
CONVEX_PREVIEW_ADMIN_KEY # For ephemeral DBs (Option B only)
```

## Workflow: Option B (Ephemeral DB)

```yaml
# .github/workflows/preview.yml
name: PR Preview

on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

env:
  PR_NUM: ${{ github.event.pull_request.number }}

jobs:
  deploy-preview:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install

      - name: Connect to Tailscale
        uses: tailscale/github-action@v4
        with:
          oauth-client-id: ${{ secrets.TS_OAUTH_CLIENT_ID }}
          oauth-secret: ${{ secrets.TS_OAUTH_CLIENT_SECRET }}
          tags: tag:ci

      # 1. Create Convex container
      - name: Create Convex
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PREVIEW_SERVER_HOST }}
          username: root
          key: ${{ secrets.PREVIEW_SERVER_SSH_KEY }}
          script: |
            docker stop convex-pr-${{ env.PR_NUM }} 2>/dev/null || true
            docker rm convex-pr-${{ env.PR_NUM }} 2>/dev/null || true
            docker run -d \
              --name convex-pr-${{ env.PR_NUM }} \
              --network dokploy-network \
              --label "traefik.enable=true" \
              --label "traefik.http.routers.convex-pr-${{ env.PR_NUM }}.rule=Host(\`convex-pr-${{ env.PR_NUM }}.preview.academic-reader.com\`)" \
              --label "traefik.http.routers.convex-pr-${{ env.PR_NUM }}.tls.certresolver=letsencrypt" \
              --label "traefik.http.services.convex-pr-${{ env.PR_NUM }}.loadbalancer.server.port=3210" \
              ghcr.io/get-convex/convex-backend:latest

      # 2. Wait for healthy
      - name: Wait for Convex
        run: |
          for i in {1..30}; do
            curl -s https://convex-pr-${{ env.PR_NUM }}.preview.academic-reader.com/version && break
            sleep 2
          done

      # 3. Deploy Convex functions
      - name: Deploy Convex Functions
        working-directory: shared/convex
        run: bunx convex deploy --yes
        env:
          CONVEX_SELF_HOSTED_URL: https://convex-pr-${{ env.PR_NUM }}.preview.academic-reader.com
          CONVEX_SELF_HOSTED_ADMIN_KEY: ${{ secrets.CONVEX_PREVIEW_ADMIN_KEY }}

      # 4. Build and push app image
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: dillpickleschmidt/academic-reader:pr-${{ env.PR_NUM }}
          build-args: |
            VITE_CONVEX_URL=https://convex-pr-${{ env.PR_NUM }}.preview.academic-reader.com

      # 5. Create app container
      - name: Create App
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PREVIEW_SERVER_HOST }}
          username: root
          key: ${{ secrets.PREVIEW_SERVER_SSH_KEY }}
          script: |
            docker stop app-pr-${{ env.PR_NUM }} 2>/dev/null || true
            docker rm app-pr-${{ env.PR_NUM }} 2>/dev/null || true
            docker pull dillpickleschmidt/academic-reader:pr-${{ env.PR_NUM }}
            docker run -d \
              --name app-pr-${{ env.PR_NUM }} \
              --network dokploy-network \
              --label "traefik.enable=true" \
              --label "traefik.http.routers.app-pr-${{ env.PR_NUM }}.rule=Host(\`pr-${{ env.PR_NUM }}.preview.academic-reader.com\`)" \
              --label "traefik.http.routers.app-pr-${{ env.PR_NUM }}.tls.certresolver=letsencrypt" \
              dillpickleschmidt/academic-reader:pr-${{ env.PR_NUM }}

      # 6. Comment on PR
      - uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: ${{ env.PR_NUM }},
              body: '🚀 **Preview ready!**\n\n- App: https://pr-${{ env.PR_NUM }}.preview.academic-reader.com\n- Convex: https://convex-pr-${{ env.PR_NUM }}.preview.academic-reader.com'
            })

  cleanup-preview:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - name: Connect to Tailscale
        uses: tailscale/github-action@v4
        with:
          oauth-client-id: ${{ secrets.TS_OAUTH_CLIENT_ID }}
          oauth-secret: ${{ secrets.TS_OAUTH_CLIENT_SECRET }}
          tags: tag:ci

      - name: Cleanup
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PREVIEW_SERVER_HOST }}
          username: root
          key: ${{ secrets.PREVIEW_SERVER_SSH_KEY }}
          script: |
            docker stop app-pr-${{ env.PR_NUM }} convex-pr-${{ env.PR_NUM }} 2>/dev/null || true
            docker rm app-pr-${{ env.PR_NUM }} convex-pr-${{ env.PR_NUM }} 2>/dev/null || true
```

## Option A: Shared Staging DB (Simpler Variant)

Remove Convex container creation/cleanup. Use fixed staging Convex URL:

```yaml
build-args: |
  VITE_CONVEX_URL=https://convex-api-staging.academic-reader.com
```

## Known Limitations

1. **Google OAuth**: Doesn't support wildcard redirect URIs
   - Workaround: Central callback URL with `state` parameter redirect

2. **Build time**: Each PR builds its own image (~slow but maybe consider accepting it)
   - Future (consider): Server-side injection for runtime Convex URL (one image for all previews):

     ```typescript
     // Server: inject config into HTML at runtime
     app.get("*", async (c) => {
       let html = await Bun.file("dist/index.html").text()
       html = html.replace(
         "</head>",
         `<script>window.__CONFIG__={CONVEX_URL:"${process.env.CONVEX_URL}"}</script></head>`,
       )
       return c.html(html)
     })

     // Client: use injected config with fallback
     const convex = new ConvexClient(
       window.__CONFIG__?.CONVEX_URL || import.meta.env.VITE_CONVEX_URL,
     )
     ```

## Future: Serverless Previews

Could use Fly.io for pay-per-use previews:

- Scale to zero when inactive
- Full isolation
- Only pay for active preview time

```yaml
- run: |
    fly apps create preview-pr-${{ env.PR_NUM }}
    fly deploy --app preview-pr-${{ env.PR_NUM }}

- if: github.event.action == 'closed'
  run: fly apps destroy preview-pr-${{ env.PR_NUM }} --yes
```

## Summary

| What     | Needed                                                                      |
| -------- | --------------------------------------------------------------------------- |
| DNS      | Wildcard `*.preview.academic-reader.com`                                    |
| Server   | VPS with Docker + Traefik (can be separate from prod)                       |
| Secrets  | `PREVIEW_SERVER_HOST`, `PREVIEW_SERVER_SSH_KEY`, `CONVEX_PREVIEW_ADMIN_KEY` |
| Workflow | `.github/workflows/preview.yml`                                             |
