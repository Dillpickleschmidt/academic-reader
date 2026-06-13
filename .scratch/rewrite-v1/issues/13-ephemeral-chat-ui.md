Status: ready-for-agent

# Add ephemeral Chat UI

## What to build

Add simple ephemeral Chat using `@kodehort/ai-sdk-solid` directly in chat components. Chat should allow general model interaction from inside the workbench without persistence, document search, RAG, web search, or app-specific tools.

## Acceptance criteria

- [ ] Chat UI is available in the app/workbench.
- [ ] `@kodehort/ai-sdk-solid` works with Solid 2 beta or the issue documents the compatibility blocker.
- [ ] Messages are not persisted in Convex in v1.
- [ ] Chat has no document/RAG/web-search tools.
- [ ] Backend route speaks an AI SDK-compatible stream protocol.

## Blocked by

- `.scratch/rewrite-v1/issues/01-bootstrap-bun-monorepo-solid-web-shell.md`
