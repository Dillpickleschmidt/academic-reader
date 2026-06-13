Status: ready-for-agent

# Add configured-but-disabled LightOnOCR and Chandra registry entries

## What to build

Add Conversion Model registry entries for LightOnOCR and Chandra with deployment/config placeholders, but keep them disabled in Processing Configuration until each has an adapter, execution path, and tested fine-grained Processing Events.

## Acceptance criteria

- [ ] Processing Configuration can show Marker enabled by default.
- [ ] LightOnOCR and Chandra are represented in the shared model registry/config.
- [ ] Disabled models appear disabled with a clear reason.
- [ ] Disabled models cannot start a Processing Run.
- [ ] No downstream code assumes coarse progress events for disabled models.

## Blocked by

- `.scratch/rewrite-v1/issues/04-create-source-document-from-processing-configuration.md`
