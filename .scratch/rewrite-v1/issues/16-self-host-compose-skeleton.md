Status: ready-for-agent

# Add self-host Compose skeleton

## What to build

Add a Docker Compose skeleton for the self-hostable deployment shape: app/API, web build serving, Convex, MinIO, Caddy placeholder, and worker placeholders. This is a skeleton, not polished production automation.

## Acceptance criteria

- [ ] Compose files document the intended app, Convex, MinIO, and worker services.
- [ ] Environment examples reflect current decisions: no Datalab, MinIO/R2 storage, local/Modal model execution config.
- [ ] Local self-host path is clear enough for future hardening.
- [ ] Production automation is not overbuilt before the core pipeline is stable.

## Blocked by

- `.scratch/rewrite-v1/issues/01-bootstrap-bun-monorepo-solid-web-shell.md`
