---
phase: 09-deploy-part-2-empty-error-states
plan: 03
subsystem: ui
tags: [react, maplibre, error-states, retry, vitest, jsdom]

# Dependency graph
requires:
  - phase: 09-02
    provides: server-side error contract `{ error: 'internal_error', request_id }` + `x-request-id` echo header
  - phase: 06
    provides: photo upload queue (`src/photos/uploadQueue.ts`), PhotoUploader tile UI
  - phase: 05
    provides: MapCanvas + MapLibre style plumbing (`src/reel/mapStyle.ts`)
provides:
  - ERR-01 photo upload retry tile (transient/terminal classifier + locked backoff [2000, 4000, 8000] ms + amber retrying UI + manual retry)
  - ERR-03 MapTiler 429 detection → OSM raster fallback + amber MapFallbackBanner
  - ERR-04 empty-state cards on `/app` and `/app/trips` (centered card + amber CTA / overlay card pointing at map)
affects: [phase-10 (MP4 ERR-02 deferred), phase-12 (launch polish)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Anchored regex classifier `/^HTTP (\\d{3})$/` for transient/terminal error detection"
    - "sessionStorage flag set BEFORE setStyle to prevent MapLibre fallback infinite-loop"
    - "vi.mock surface must match production import surface (default + named) — guard via acceptance criterion"
    - "Consumer-owned terminal state: uploadQueue retry loop never auto-flips to `done`; flips to `retrying` then `failed` only"
    - "StrictMode-safe setInterval via useEffect cleanup; verified by setIntervalSpy.mock.calls.length assertion"

key-files:
  created:
    - "src/photos/retry.ts"
    - "src/photos/retry.test.ts"
    - "src/photos/uploadQueue.test.ts"
    - "src/reel/osmRasterStyle.ts"
    - "src/reel/MapCanvas.fallback.test.ts"
    - "src/components/MapFallbackBanner.tsx"
    - "src/routes/AppReelRoute.test.tsx"
    - "src/routes/TripsRoute.test.tsx"
  modified:
    - "src/photos/uploadQueue.ts"
    - "src/components/PhotoUploader.tsx"
    - "src/components/PhotoUploader.test.tsx"
    - "src/reel/MapCanvas.tsx"
    - "src/routes/AppReelRoute.tsx"
    - "src/routes/TripsRoute.tsx"

key-decisions:
  - "Retry classifier uses fully-anchored `/^HTTP (\\d{3})$/` — no OR-fallback to unanchored variants (RESEARCH L321; W3 fix from plan revision)"
  - "Backoff array literal `[2000, 4000, 8000] as const` per CONTEXT lock; total ~14s observation window before manual-retry mode"
  - "MapTiler 429 detection via `e.error instanceof AJAXError && e.error.status === 429` (named import); sessionStorage `map-fallback-active` set BEFORE setStyle to break loops"
  - "OSM raster style is a parallel `src/reel/osmRasterStyle.ts` module (not a mutation of the live MapTiler style); attribution `© OpenStreetMap contributors` locked"
  - "ERR-04 cards use amber tokens only (`bg-amber-500 text-black focus-visible:ring-amber-500`, min 44px tap targets); no illustrations (voluntary skip on /app per DESIGN.md consistency)"
  - "TripsRoute empty-state card uses `pointer-events-none` so the map (the actual CTA) still receives taps"

patterns-established:
  - "Pattern A: vi.mock factory for maplibre-gl mirrors production import surface (`default: { Map }`, `Map`, `AJAXError`); guards against drift when MapCanvas import line changes"
  - "Pattern B: jsdom-hostile route tests pre-stub all transitive imports (CityForm, CityList, PhotoDetailSheet, reverseGeocode, MapPicker) before the test reaches the empty-state branch"
  - "Pattern C: retry tile uses immutable updateItem(...) calls — no in-place mutation of upload queue items"

requirements-completed: [ERR-01, ERR-03, ERR-04]
# ERR-02 (MP4 fail card) remains deferred to Phase 10 per CONTEXT D-X — no Redis/BullMQ/MP4 render lifecycle yet.

# Metrics
duration: ~22min (executor; stalled on watchdog before writing SUMMARY — orchestrator backfilled this file)
completed: 2026-06-01
---

# Phase 09 Plan 03: Error/empty state UX Summary

**Photo upload retry tile with locked backoff, MapTiler 429 → OSM raster fallback with amber banner, and empty-state cards on `/app` + `/app/trips` — ERR-02 stays deferred to Phase 10.**

## Performance

- **Duration:** ~22 min (executor runtime; stalled on stream watchdog after the final task commit, before SUMMARY.md write)
- **Completed:** 2026-06-01
- **Tasks:** 4 / 4
- **Files modified:** 14 (8 created, 6 edited)

## Accomplishments

- **ERR-01 retry classifier + locked backoff** — `src/photos/retry.ts` ships `RETRY_BACKOFF_MS = [2000, 4000, 8000] as const` and `classifyError(err)` returning `'transient' | 'terminal'` via the fully-anchored `/^HTTP (\d{3})$/` pattern. 11 test cases pass.
- **ERR-01 retry loop + amber retrying tile** — `uploadQueue.ts` retry loop flips status `uploading → retrying → (manual)`, never auto-`done` (consumer owns terminal state). PhotoUploader renders amber-bordered "Retrying in {N}s…" tile with 1Hz countdown via StrictMode-safe `setInterval` + `useEffect` cleanup.
- **ERR-03 MapTiler 429 → OSM raster fallback** — MapCanvas adds `map.on('error', ...)` AJAXError-429 gate; sessionStorage `map-fallback-active` flag set BEFORE `setStyle(osmRasterStyle, { diff: false })` to break infinite-loop risk. MapFallbackBanner surfaces the amber `Map service limited; some detail reduced.` banner top-of-map, dismissable, re-shows next session.
- **ERR-04 + /app/trips empty-state polish** — AppReelRoute empty-state replaced with centered card (`No trips yet.` + `Add your first city to start the camera flying.` + amber `Add a city` CTA → `/app/trips`). TripsRoute empty-state replaced with `pointer-events-none` overlay card on map's lower half (`Tap the map to add your first stop.` — no CTA button, the map IS the CTA).

## Task Commits

Atomic, RED → GREEN per task:

1. **Task 1: retry classifier + backoff** — `b621001` (test, RED) → `b837042` (feat, GREEN)
2. **Task 2: retry loop in uploadQueue + tile UI** — `4450362` (test, RED) → `4316770` (feat, GREEN)
3. **Task 3: MapTiler 429 → OSM raster fallback + banner** — `00665e0` (test, RED) → `b85cfa4` (feat, GREEN)
4. **Task 4: ERR-04 empty-state cards** — `f88ef27` (test, RED) → `f09c67a` (feat, GREEN)

**Wave merge commit:** `baf2348` — chore: merge executor worktree (09-03 error/empty UX)
**SUMMARY.md (this file):** committed by orchestrator after watchdog stall.

## Files Created/Modified

**Created (8):**
- `src/photos/retry.ts` — anchored-regex classifier + `[2000, 4000, 8000]` const
- `src/photos/retry.test.ts` — pure-function tests, 11 cases
- `src/photos/uploadQueue.test.ts` — retry-loop integration tests
- `src/reel/osmRasterStyle.ts` — parallel raster MapLibre style with OSM attribution
- `src/reel/MapCanvas.fallback.test.ts` — vi.mock('maplibre-gl', ...) matching production import surface; sessionStorage no-loop assertion
- `src/components/MapFallbackBanner.tsx` — amber top-of-map dismissible banner reading sessionStorage flag
- `src/routes/AppReelRoute.test.tsx` — empty-state card render tests (copy, amber class, link to `/app/trips`)
- `src/routes/TripsRoute.test.tsx` — jsdom-stub setup for CityForm/CityList/PhotoDetailSheet/MapPicker/reverseGeocode; empty-card render + `pointer-events-none` assertion

**Modified (6):**
- `src/photos/uploadQueue.ts` — `scheduleOne` wrapped with retry loop using existing `updateItem(...)`; immutable status transitions
- `src/components/PhotoUploader.tsx` — amber retry tile + countdown setInterval + manual retry button + dismiss (×)
- `src/components/PhotoUploader.test.tsx` — StrictMode safety: assert `setIntervalSpy.mock.calls.length === N_RETRYING_ITEMS`
- `src/reel/MapCanvas.tsx` — named import `AJAXError`; new `map.on('error', ...)` handler; sessionStorage flag set BEFORE setStyle; view-state preservation via getCenter/setZoom/once('styledata', restore)
- `src/routes/AppReelRoute.tsx` — empty-state card (CONTEXT-locked copy + amber CTA)
- `src/routes/TripsRoute.tsx` — overlay card on map's lower half (CONTEXT-locked copy + `pointer-events-none`)

## Decisions Made

- Followed plan as written — no design or scope deviations.
- The retry classifier's anchored regex pattern matches the plan's W3-fix acceptance criterion exactly: `grep -F '/^HTTP (\d{3})$/' src/photos/retry.ts` succeeds.
- vi.mock('maplibre-gl', ...) factory uses `{ default: { Map }, Map, AJAXError: FakeAJAXError }` to match MapCanvas.tsx import line `import maplibregl, { AJAXError, type Map as MapLibreMap } from 'maplibre-gl'`.
- TripsRoute test pre-stubs ALL jsdom-hostile route imports (CityForm, CityList, PhotoDetailSheet, MapPicker, reverseGeocode) to avoid WebGL/Canvas module-eval explosions.

## Deviations from Plan

**One operational deviation — non-code:**

**1. [Orchestrator backfill] SUMMARY.md written by orchestrator, not executor**
- **Found during:** Post-Task-4 metadata phase
- **Issue:** Executor agent hit the stream watchdog 600s timeout after the final feat commit (`f09c67a`) but before invoking the SUMMARY.md write step. All 8 task commits (4 RED + 4 GREEN) landed cleanly on the worktree branch.
- **Fix:** Orchestrator merged the worktree branch into main and authored this SUMMARY.md retroactively from git log + diff inspection + verification of test pass.
- **Files modified:** This file only.
- **Verification:** `bun run typecheck` clean; `bun run test` 405/405 pass (38 test files including the 6 new ones for 09-03); merged commit `baf2348` shows all expected file deltas.
- **Committed in:** (this commit)

**Total deviations:** 1 operational (orchestrator backfilled SUMMARY)
**Impact on plan:** Zero — all code changes landed exactly as specified; only the SUMMARY.md authorship moved from executor to orchestrator.

## Issues Encountered

- **Executor stream watchdog stall** — after the final `feat(09-03): ERR-04 empty-state polish` commit (`f09c67a`), the executor agent stopped emitting tool calls for 600s and the watchdog terminated the task. Worktree state was clean and all commits present; orchestrator recovered by merging directly.
- **Test runner pitfall caught during verification** — the agent's internal verification was run with `bun test` (Bun's runner) instead of `bun run test` (which invokes the project's `vitest run` script). Bun's runner doesn't implement `vi.advanceTimersByTimeAsync` and doesn't resolve Vite path aliases. Re-running via `bun run test` produced 56/56 pass on the 6 new test files and 405/405 pass across the full suite. No source code changes required — this was a runner-invocation issue, not a test-quality issue.

## User Setup Required

None for Plan 09-03 itself.

Cross-plan operator actions documented elsewhere remain pending (see `09-01-SUMMARY.md` and `09-02-SUMMARY.md`):
- GitHub secrets/vars + `production` environment + first tag push (09-01)
- Auth0 Action deploy + attach to Login flow + one-off backfill SQL (09-02)

## Next Phase Readiness

- All three in-scope error/empty surfaces shipped: ERR-01 retry, ERR-03 MapTiler fallback, ERR-04 + /app/trips empty cards.
- **ERR-02 (MP4 fail card) stays deferred to Phase 10** per CONTEXT D-X — Phase 10 introduces Redis/BullMQ/Puppeteer pipeline; that's where the MP4 lifecycle materializes.
- Single-amber accent rule honored across all new UI; no public-surface illustrations introduced.
- Phase 9 implementation complete pending verifier signoff.

---
*Phase: 09-deploy-part-2-empty-error-states*
*Completed: 2026-06-01*
