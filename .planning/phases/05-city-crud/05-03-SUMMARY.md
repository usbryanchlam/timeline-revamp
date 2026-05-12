---
phase: 05-city-crud
plan: 03
status: shipped
commits:
  - 572c8e3  # feat(server): PATCH /api/cities/reorder with DEFERRABLE transaction + tests (task 1)
  - a6a2e8f  # fix(server): single batch timestamp + duplicate-id reorder test (review feedback)
  - 63fda49  # feat(client): groupChapters REEL-09 pure function (task 2)
  - 4657847  # feat(client): @dnd-kit CityList with drag-handle + wire reorder in TripsRoute (task 3)
  - f32538e  # feat(client): MapPicker reactive marker sync (deferred from 05-02)
  - 12a41c4  # fix(client): focus ring + concurrent-drag gate + explicit marker cleanup (review feedback)
  - a9fb36a  # feat(client): /app/ reel switches to API-driven data + REEL-09 grouping + empty-state CTA (task 4)
  - e6ed842  # fix(client): focus rings on AppReel CTAs + extract groupsToChapters helper (review feedback)
tests_added: 9
tests_total: 140
requirements_advanced:
  - DATA-03 (complete — PATCH /api/cities/reorder in db.transaction exercises DATA-02 deferrable constraint)
  - REEL-09 (grouping half complete — photo cycling half waits for Phase 6 photos)
phase_complete: true
---

## What Shipped

### Server
- `PATCH /api/cities/reorder` — load-bearing endpoint that exercises the DATA-02 deferrable unique constraint for the first time. All N UPDATEs run inside `db.transaction(async (tx) => ...)` so intermediate (user_id, order_index) duplicates are tolerated; the constraint check happens once at COMMIT. Without DEFERRABLE, a two-row swap would fail mid-transaction with 23505. Single `now` timestamp shared across all rows in the batch (easier diffing).
- Registered BEFORE `PATCH /:id` in the router file with an explicit comment — Hono matches in registration order, and the literal "reorder" would otherwise be captured as an id param. Locked in by a regression-guard test that fires `PATCH /api/cities/reorder` and asserts the response is 200 (would be 422 from `updateCitySchema.strict()` if route ordering regressed).
- `reorderSchema` (Zod) — `.strict()` outer, items array `.min(1)`, `superRefine` catches duplicate ids, duplicate `orderIndex`, and gaps in the 0..n-1 invariant. Pre-flight ownership + completeness checks run OUTSIDE the transaction so failure paths are cheap.
- Cross-user id in batch → 404 (no existence leak); incomplete body → 422 with `reason: 'must_include_all_cities'`.

### Client
- `src/reel/groupChapters.ts` — pure function. Collapses ADJACENT identical-coord (byte-equal lat AND lng) cities into one `ChapterGroup` with `members: readonly CityDTO[]`. Adjacency-only (A-B-A produces 3 groups), exact-equality (no tolerance). 9 Vitest cases hitting all branches; manual coverage trace shows 100% line+branch. JSDoc documents the empty-country v1 limitation (cityToChapter defaults country to '' because the DB schema has no country column).
- `groupsToChapters(groups)` — small helper next to `groupChapters` that projects each group to a single CityChapter via `members[0]` and pipes through `citiesToChapters`. Phase 6+ photo cycling will upgrade this one site instead of every consumer.
- `src/components/CityList.tsx` — @dnd-kit drag-and-drop list. `PointerSensor` with `activationConstraint: { distance: 4 }` (prevents accidental drag on tap), `KeyboardSensor` with `sortableKeyboardCoordinates` (Space/Arrow/Enter). Drag handle is a separate `<button aria-label="Reorder">` with `min-w-[44px]` — the card body remains tap-to-edit. Local mirror state + useEffect resync on `cities` prop change. Optimistic reorder with revert-on-throw and a `useRef`-based concurrent-drag gate (prevents stale-snapshot revert when a second drag fires before the first PATCH resolves). Both buttons have `focus-visible:ring-2 ring-amber-500` rings for keyboard a11y.
- `src/routes/TripsRoute.tsx` — replaces the inline CityCard render loop with `<CityList ...>`. `handleReorder` PATCHes `/api/cities/reorder` with `{ items: orderedIds.map((id, idx) => ({id, orderIndex: idx})) }`. Refetches on both success and failure paths; throws on failure so the mirror reverts.
- `src/components/MapPicker.tsx` — reactive marker sync (deferred from 05-02). Init effect now only handles map init + click handler + initial fitBounds. A new `[cities, mapReadyTick]` effect owns ALL city-marker rendering (tear-down + recreate); a `mapReadyTick` state bridges the async-init → effect-rerun gap. Draft pin stays in its own separate effect. `maplibreGlRef` caches the dynamic-imported module so subsequent effects don't re-import. Cleanup now explicitly disposes markers BEFORE `map.remove()`.
- `src/routes/AppReelRoute.tsx` — `/app/` reel switches from SEEDED_CITIES to API-driven data. Four render branches: loading (dark map bg, no card flash), error (Retry button with focus ring), empty (CTA card linking to `/app/trips` with "Your reel will appear here." + "Add a city" focus-ringed link), data (`groupsToChapters(groupChapters(cities))` → pass to Reel/ReducedMotionReel via the new `chapters` prop).
- `src/reel/Reel.tsx` + `src/reel/ReducedMotionReel.tsx` — both gained a `chapters?: readonly CityChapter[]` prop with `= SEEDED_CITIES` default. PublicReelRoute and HandleReelRoute continue zero-arg-calling them and render seeded data unchanged.

## Deviations / Open Items

1. **`server/routes/cities.test.ts` is 945 lines — past the 800 ceiling.** Flagged by Task 1 reviewer; deferred to a separate housekeeping commit (which didn't land this plan). Natural split: `cities.read.test.ts` / `cities.write.test.ts` / `cities.reorder.test.ts` with a shared `cities.test.helpers.ts` for JWT minting, app construction, and SUB_A/SUB_B cleanup. Recommend tracking as a tech-debt task or rolling into Phase 6 setup.

2. **Pre-flight TOCTOU race in PATCH /reorder.** The ownership/completeness pre-flight runs OUTSIDE the transaction; a concurrent DELETE between pre-flight and the first UPDATE could leave a gap in the user's 0..n-1 sequence (the deleted row's `orderIndex` slot becomes unclaimed). Severity is low (same user racing themselves means same browser tab firing two mutations; the optimistic-UI mirror serializes via the `pendingRef` gate in CityList). Documented for fix in 05-04 or later: move the pre-flight INSIDE the transaction and assert affected-row-count matches expected.

3. **Tear-down + recreate ALL city markers on every cities prop change** (`src/components/MapPicker.tsx`). At Phase 5 scale (<<100 cities) imperceptible. For 500+ cities, a keyed `Map<cityId, Marker>` diff would avoid re-creating unchanged markers. Defer to Phase 6+ optimization.

4. **`mapReadyTick` state in MapPicker is a code smell** (using a side-effect counter as a useEffect dep). Cleaner alternative: store the map instance in `useState` instead of a ref so React re-renders on init. Functional today; refactor candidate for Phase 6+.

5. **`formatArrived` duplicated** between `src/components/CityList.tsx` and `src/reel/ChapterOverlay.tsx`. Trivial chore to extract to `src/utils/formatDate.ts`. Defer.

6. **Photo cycling half of REEL-09 not implemented** — there are no photos yet (Phase 6 territory). `ChapterGroup.members` is preserved as-is so Phase 6 can wire cycling without touching `groupChapters` itself.

7. **Empty-country subtitle on /app/-reel chapters.** API-driven CityDTOs have `country: ''` because the DB schema has no country column; `cityToChapter` defaults the field to ''. ChapterOverlay's country subtitle renders blank for /app/-reel chapters. Seeded `/` and `/u/:handle` chapters still have country populated. Documented in `groupChapters.ts` JSDoc; AppReelRoute has a one-line NOTE pointing there. If subtitle emptiness becomes a UX issue, add a `country` column in a future phase and route it through `cityToChapter` — the DB schema is the source of truth.

## Verification

- `bun run typecheck` — clean
- `bun run test` — **140 passed (6 files)**. New: 1 (cities.test.ts dup-id reorder test from Task 1 fix commit) + 8 reorder tests (Task 1 happy-path/foreign-id/missing-city/dup-orderIndex/gap/two-row-swap-DEFERRABLE-proof/no-auth/route-ordering-regression-guard) + 9 groupChapters tests = 18 new server-side + util tests. (The "tests_added: 9" in frontmatter counts only the groupChapters tests — server-side reorder tests are 8 + 1 = 9, totaling 18 new across the plan. Confusing; clarified here.)
- `bun run build` — succeeds; `maplibre-wqmL2Hxp.js` remains its own 1.05 MB chunk per `vite.config.ts` manualChunks. Build emits the standard "chunk > 500 kB" hint for maplibre — expected.
- BigDataCloud server-architectural-guard from 05-01 still green.
- Public routes regression check: `git diff --stat 2ad16ca..HEAD -- 'src/routes/PublicReelRoute.tsx' 'src/routes/HandleReelRoute.tsx' 'src/data/seeded-cities.ts' 'src/reel/MapCanvas.tsx'` returns empty.

## ROADMAP Closure

Phase 5 success criteria from ROADMAP.md are now all satisfied:
- **#1** — User can save a city (05-02 POST /api/cities)
- **#2** — Save creates a row with `order_index = max(order_index) + 1` (05-02 server-authoritative order_index)
- **#3** — Reorder via PATCH `/api/cities/reorder` in `db.transaction` (this plan)
- **#4** — Trips view: combined map + chronological list (05-01 layout, 05-02 form, 05-03 drag handle)
- **#5** — Adjacent identical-coord chapters collapse (this plan, `groupChapters` REEL-09)

Phase 5 closes here. Photo cycling (REEL-09 cycling half) and per-handle public-tree data fetch are explicit Phase 6 / Phase 7 territory and intentionally NOT touched.

## What Phase 6 Picks Up

- Photos table + upload + OCI bucket (per ROADMAP)
- ChapterGroup photo cycling on the reel (visual completion of REEL-09)
- Possible housekeeping carry-overs from open items 1, 3, 4, 5 above
- TOCTOU fix on PATCH /reorder pre-flight (open item 2) — small, can be folded into early Phase 6

## Workflow Used

`superpowers:subagent-driven-development` — fresh implementer subagent per task, two-stage review (spec compliance → code quality) per task, fix subagent for each Important issue. 8 commits on `feature/05-03-reorder-reel` (4 feature + 3 review fixes + the deferred MapPicker sync). All 4 tasks landed without an orchestrator stream timeout.
