Status: done

# Bootstrap Bun monorepo and Solid web shell

## What to build

Create the initial Bun workspace with `apps/web`, `apps/api`, and shared package locations. The web app should be scaffolded with TanStack Solid Router file-based routing, stable SolidJS 1.x, TypeScript, and Tailwind.

The human maintainer should run the TanStack CLI from:

```bash
cd /home/dylank/Programming-Projects/academic-reader-2/apps/web
bunx @tanstack/cli create --router-only --framework solid
```

After scaffolding, keep the generated stable SolidJS/TanStack versions unless a concrete compatibility issue appears.

## Acceptance criteria

- [x] Root Bun workspace exists with app/package workspace entries.
- [x] `apps/web` is scaffolded with file-based TanStack Solid Router.
- [x] `apps/web` uses stable SolidJS 1.x and TanStack Solid Router dependencies compatible with solid-ui/Kobalte.
- [x] `apps/api` exists with a minimal Bun/Hono health endpoint placeholder.
- [x] `bun install` and basic workspace scripts run successfully.

## Blocked by

None - can start immediately
