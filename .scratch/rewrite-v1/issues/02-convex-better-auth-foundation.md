Status: done

# Add Convex and Better Auth foundation

## What to build

Add Convex persistence and Better Auth so a Reader can sign in and view an authenticated empty Document library. Keep the Convex folder split between thin `api/` functions and business logic under `model/`.

## Acceptance criteria

- [x] Convex package/app is configured and type generation works.
- [x] Better Auth sign-in/sign-out works in the Solid web app.
- [x] The home route shows an authenticated empty Document library.
- [x] Unauthenticated Readers can still reach the upload/configuration entry point.
- [x] Auth-required Convex operations reject unauthenticated calls.

## Blocked by

- `.scratch/rewrite-v1/issues/01-bootstrap-bun-monorepo-solid-web-shell.md`
