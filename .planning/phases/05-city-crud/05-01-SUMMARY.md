---
phase: 05-city-crud
plan: 01
status: shipped
commits:
  - ac43cb2  # feat(server): GET /api/cities + GET /:id with user-scoped auth (task 1)
  - 14f141c  # fix(server): only collapse malformed-uuid to 404 (review feedback)
  - 057abb1  # feat(client): CityDTO + cityToChapter mapper + useCitiesQuery hook (task 2)
  - 086e977  # fix(client): guard useCitiesQuery against stale responses and unmount (review feedback)
  - 7dc9e64  # feat(client): MapPicker + reverse-geocode + Trips view layout (task 3)
  - 60b253a  # fix(client): gate MapPicker mount on data + fix permanent geocode-pending state (review feedback)
tests_added: 19
tests_total: 107
requirements_advanced:
  - DATA-04 (partial — pin → geocode → form pre-fill landed; save lands in 05-02)
---

## What Shipped

### Server
- `GET /api/cities` — lists current user's cities ordered by `order_index ASC`. Returns `[]` for new users.
- `GET /api/cities/:id` — returns the row scoped to the requester. Cross-user IDs return 404 (no existence leak). Malformed UUIDs (Postgres `22P02`) collapse to 404; other DB errors re-throw to the global handler.
- Both endpoints mounted behind `requireJwt + lazyProvisionUser` mirroring the `/api/me` dual exact+prefix pattern.
- Architectural CI guard: `server/auth/__no-bigdatacloud.test.ts` walks `server/**/*.ts` and fails if any file references `bigdatacloud`. Enforces BigDataCloud Fair Use Policy as a build-time invariant, not a manual review item.

### Client
- `CityDTO` wire-format type (string ISO timestamps, not Drizzle `Date` inferences).
- `cityToChapter` / `citiesToChapters` pure mapper — DTO → CityChapter with `[lng, lat]` GeoJSON ordering. 12 Vitest cases (load-bearing center order, null defaults, immutability, order preservation).
- `useCitiesQuery` data hook — auto-fetches on mount, exposes `{ data, error, refetch }`. Stale-request and unmount guards via `reqIdRef` (so 05-02 write-path refetches won't stomp).
- `fetchCities(api)` plain-function escape hatch for non-hook contexts (form submit refresh in 05-02).
- `src/geocode/bigdatacloud.ts` — client-only reverse-geocode wrapper. Returns `null` on errors. Top-of-file Fair Use note.
- `src/components/MapPicker.tsx` — separate MapLibre instance from `MapCanvas`. Lazy `import('maplibre-gl')`, world-view default for empty cities, `fitBounds` for non-empty. Click → `onPick(lat, lng)`. Draft pin in amber `#FFD470`. Flat — no `flyTo`/pitch/bearing.
- `src/routes/TripsRoute.tsx` — replaces 7-line placeholder with map (top half) + list (bottom half), gated on `cities !== undefined` so users with cities don't see a blank world view on initial load. Inline `DraftPinPanel` placeholder ("Save (Saving lands in 05-02)") and inline `CityCard`. Empty / loading (3 skeleton cards) / error (banner with retry) states.

## Deviations / Open Items

1. **MapPicker static cities snapshot.** Init effect runs once on mount; subsequent `props.cities` changes don't re-render markers. Documented inline. **05-02 must wire reactive marker sync** when the create form lands (otherwise newly-saved cities won't appear without a page refresh). Mitigated for v1 by gating MapPicker mount on `cities !== undefined`, so the initial paint always has the full set.
2. **`me.ts` latent bug surfaced during Task 1 fix.** `server/routes/me.ts:66-72` checks `err.code === '23505'` directly, but Drizzle wraps pg errors in `DrizzleQueryError` and the original code lives at `err.cause.code`. Means the duplicate-handle 409 path likely never fires today (5xx instead). Recommended follow-up: extract `pgErrorCode(err)` helper, apply to both routes, add a regression test that posts a duplicate handle from a second user. NOT being fixed here — out of scope for 05-01.
3. **Inline DraftPinPanel and CityCard in TripsRoute.** ~50 + ~12 lines respectively. Will extract to own files in 05-02 when DraftPinPanel becomes the real form.
4. **Amber `#FFD470` hardcoded in MapPicker** because MapLibre custom markers can't take Tailwind classes. Future palette changes won't propagate. Defer to 05-02 (read from CSS custom property `--amber-500` at marker creation time).

## Verification

- `bun run typecheck` — clean
- `bun run test` — **107 passed (5 files)**, including 6 new cities route tests + 12 cityToChapter mapper tests + 1 BigDataCloud architectural guard
- `bun run build` — succeeds; `maplibre-wqmL2Hxp.js` (1.05 MB / 283 KB gzip) remains a separate chunk per `vite.config.ts` `manualChunks`
- CI guard self-check: inserted `// bigdatacloud` into `server/index.ts` → `__no-bigdatacloud.test.ts` failed with offender. Reverted → green.

## What 05-02 Picks Up

- POST/PATCH/DELETE `/api/cities` + Zod schemas
- Replace inline `DraftPinPanel` with a real form that persists via POST and calls `refetch()` on success
- Wire reactive marker sync in MapPicker (so newly saved cities appear without reload)
- Apply the `pgErrorCode(err)` Drizzle-wrapping fix from open item 2 above

## Workflow Used

`superpowers:subagent-driven-development` — fresh implementer subagent per task, two-stage review (spec compliance → code quality) per task, fix subagent dispatched for each Important issue. 6 commits = 3 feature + 3 review fixes. All on branch `feature/05-01-cities-get` in worktree `.worktrees/05-01-cities-get`.
