Status: ready-for-agent

# Add storage service and temporary direct upload flow

## What to build

Implement MinIO/R2-compatible object storage and the temporary upload flow. Selecting one accepted Source Document file starts a direct browser upload to object storage under a random temporary upload ID while Processing Configuration opens and shows upload progress.

## Acceptance criteria

- [ ] Storage service supports MinIO and R2 through one interface.
- [ ] API creates presigned direct upload URLs for temporary uploads without creating Convex records.
- [ ] Web upload supports PDF, PNG, JPEG, WebP, and TIFF only.
- [ ] Max file size is 50MB.
- [ ] Processing Configuration opens immediately and shows upload progress.

## Blocked by

- `.scratch/rewrite-v1/issues/02-convex-better-auth-foundation.md`
