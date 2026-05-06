---
phase: 03-app-shell
plan: 01
subsystem: app-shell
tags: [router, routes, react-router-v7]
requires:
  - "Phase 2 complete (Reel, ReducedMotionReel, usePrefersReducedMotion)"
provides:
  - "React Router v7 route tree (browser router)"
  - "src/routes/* — six route components covering public + /app trees"
  - "AppLayout forward-compat seam for Phase 4 Auth0"
affects:
  - "src/App.tsx (now a RouterProvider shell)"
tech-stack:
  added:
    - "react-router@^7.15.0 (runtime dependency)"
  patterns:
    - "createBrowserRouter object-based config defined at module scope"
    - "Layout route via <Outlet /> for forward-compat auth wrap"
    - "Per-route document.title via useEffect + cleanup"
key-files:
  created:
    - src/routes/PublicReelRoute.tsx
    - src/routes/HandleReelRoute.tsx
    - src/routes/AppLayout.tsx
    - src/routes/AppReelRoute.tsx
    - src/routes/TripsRoute.tsx
    - src/routes/MeRoute.tsx
    - src/routes/NotFoundRoute.tsx
  modified:
    - src/App.tsx
    - package.json
    - bun.lock
decisions:
  - "Use object-based createBrowserRouter (data-router API), not <Routes> JSX — Phase 4 will need loaders"
  - "Surface :handle via document.title only; no visual banner until DESIGN.md spec lands"
  - "Duplicate the 3-line reduced-motion branch in PublicReelRoute and AppReelRoute; defer extraction to Phase 9 when each side has different data inputs"
  - "AppLayout is a real component, not inlined — Phase 4 drops <Auth0Provider> + redirect-to-login here without touching public routes"
  - "Router instance defined at module scope so it isn't recreated on every App() render"
metrics:
  duration: "~6 minutes"
  completed: "2026-04-27"
  tasks: "4/4"
  commits: 4
---

# Phase 3 Plan 01: Router Shell Summary

React Router v7 installed and the app restructured from a 1-line root component into a router-driven route tree covering `/`, `/u/:handle`, and `/app/*` (with `index`, `trips`, `me` children) plus a `*` not-found fallback. Reduced-motion behavior preserved in both public and app reel routes.

## Commits

| Task | Commit  | Type     | Summary                                              |
| ---- | ------- | -------- | ---------------------------------------------------- |
| 1    | f6d59f0 | chore    | Install react-router@^7.15.0 (runtime)               |
| 2    | fd409e4 | feat     | PublicReelRoute, HandleReelRoute, NotFoundRoute      |
| 3    | 7c278f2 | feat     | AppLayout, AppReelRoute, TripsRoute, MeRoute         |
| 4    | 6d5b96a | refactor | App.tsx → RouterProvider with full route tree        |

## Verification at final commit (6d5b96a)

- `bun run typecheck` — passes
- `bun run test` — 85 / 85 vitest tests passing (Phase 2 baseline intact)
- `bun run build` — succeeds; chunks: index 414 kB, maplibre 1.05 MB (pre-existing, not introduced here)

## Files

**Created (8):** seven `src/routes/*.tsx` files plus this summary.
**Modified (3):** `src/App.tsx` (router shell), `package.json` (+react-router dep), `bun.lock`.

## Deviations from Plan

None — plan executed exactly as written. No deviation rules triggered.

Notes for the record:
- The plan listed `bun add react-router@7` which Bun saved as `"react-router": "7"` in package.json. Normalized to `"^7.15.0"` (the resolved version) to match conventional caret ranges and the plan's stated artifact "react-router at version ^7.x". Lockfile re-verified clean.
- The plan's Task 4 verify line says `bun test`; the project script is `bun run test` (vitest). Used `bun run test` because raw `bun test` invokes Bun's own test runner which can't resolve the `@/` Vite alias and reports the test as failing. This is a wording difference, not a code change.
- No Phase 2 test mounted `<App />` (only `src/gestures/stateMachine.test.ts` exists), so no test-fixup work was needed in Task 4 — the atomic commit cleanly contained just the App.tsx restructure.

## Authentication Gates

None.

## Forward-compat seams preserved

- **AppLayout** is a real wrapper component with an in-file comment block referencing Phase 4 / Auth0. Phase 4 can drop `<Auth0Provider>` + a redirect-to-login guard around the `<Outlet />` without touching public routes.
- **`prefers-reduced-motion` branching** preserved verbatim from old `App.tsx:7` in both `PublicReelRoute` and `AppReelRoute` (call `usePrefersReducedMotion()`, return `<ReducedMotionReel />` if true else `<Reel />`). `HandleReelRoute` uses the same branch.
- **`document.title` cleanup** in `HandleReelRoute` restores the previous title on unmount and on handle change, so navigation away from `/u/:handle` doesn't leak the handle into other routes' titles.

## Known Stubs

- `HandleReelRoute` renders the same seeded reel for any handle — flagged in-file with `// Phase 3 stub: same seeded reel for any handle. Phase 9 wires user lookup.`
- `AppReelRoute` renders the same seeded reel as the public tree — flagged in-file with the equivalent Phase 9 note.
- `TripsRoute`, `MeRoute` are h1-only stubs — Phase 7 builds the real Trips view; Me follows later.

These stubs are intentional per the plan; downstream phases own the wiring.

## Self-Check: PASSED

- src/routes/PublicReelRoute.tsx — FOUND
- src/routes/HandleReelRoute.tsx — FOUND
- src/routes/AppLayout.tsx — FOUND
- src/routes/AppReelRoute.tsx — FOUND
- src/routes/TripsRoute.tsx — FOUND
- src/routes/MeRoute.tsx — FOUND
- src/routes/NotFoundRoute.tsx — FOUND
- Commit f6d59f0 — FOUND
- Commit fd409e4 — FOUND
- Commit 7c278f2 — FOUND
- Commit 6d5b96a — FOUND
