---
gsd_state_version: 1.0
milestone: v1.0.0
milestone_name: milestone
status: ready_to_plan
stopped_at: Phase 08.1 context gathered
last_updated: "2026-05-27T05:01:15.633Z"
last_activity: 2026-05-27 -- Phase 08.1 execution started
progress:
  total_phases: 13
  completed_phases: 6
  total_plans: 26
  completed_plans: 17
  percent: 46
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-27)

**Core value:** The motion — camera flies like a movie. Apple Maps Flyover / Apple Weather as the polish bar.
**Current focus:** Phase 08.1 — infra-terraform

## Current Position

Phase: 9
Plan: Not started
Status: Ready to plan
Last activity: 2026-05-28

Progress: [███████░░░░░] 58% (7 of 12 phases complete)

## Performance Metrics

**Velocity:**

- Total phases completed: 7
- Total plans completed: 25 (1 Phase 1, 6 Phase 2 incl. hotfix, 3 Phase 3, 2 Phase 4, 3 Phase 5, 4 Phase 6, 3 Phase 7)
- Average duration: ~5h04m per phase
- Total execution time: ~38 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan | Notes |
|-------|-------|-------|----------|-------|
| 1 (Reel + gestures) | 1 | ~6h | ~6h | Single hand-coded plan; iPhone gesture polish |
| 2 (Reel polish + perf) | 6 | ~5h | ~50min | Parallel agent dispatch; one bug-chase iteration (lazy CSS) |
| 3 (App shell) | 3 | ~5h | ~1h40 | Parallel wave 1 + solo wave 2; plan-checker caught 3 blockers pre-execution |
| 4 (Backend + Auth0) | 2 | ~6h | ~3h | Sequential plans (04-02 depends on 04-01); plan-checker round 1 REVISE (DATA-02 brittle constraint approach + Tasks 5/6 ordering); 3 Auth0 dashboard landmines on first live test |
| 5 (Cities CRUD + reorder + reel API) | 3 | ~8h | ~2h40 | `superpowers:subagent-driven-development` workflow: fresh implementer subagent per task with two-stage review (spec compliance → code quality) + fix subagent per Important issue. 52 new tests (88 → 140). 8+ review-fix commits caught real bugs pre-merge (Drizzle wrapping, StrictMode mountedRef, concurrent drag race, focus rings, tz drift). 1 mid-Task-2 stream timeout recovered cleanly via fresh-agent resume. DEFERRABLE constraint exercised end-to-end for the first time via two-row swap test |
| 6 (Photo upload pipeline + REEL-09) | 4 | ~5h | ~1h15 | First use of `superpowers:dispatching-parallel-agents` skill — Wave 1 (06-01 client pipeline + 06-02 server PAR/sharp) ran fully in parallel via disjoint file trees (atomic dep pre-install at 27fdab7 avoided bun.lock race). 95 new tests (140 → 235: 19 client pipeline, 19 server endpoints + MIME sniff, 36 UI components, 21 reel cycling). Plan-checker round 2 REVISE caught 4 blockers pre-execution (silently-dropped locked decisions: full-screen viewer + per-photo delete UI; server MIME byte-sniff missing; 06-04 cross-plan dep). 06-02 agent stream watchdog killed it after work completed but before turn close — atomic-per-task commits made disk verification + recovery trivial. Real OCI bucket provisioning (CORS via S3-compat API only — Native API silent-drop landmine documented in memory). |
| 7 (Public URLs + handle reservation) | 3 | ~3h | ~1h | 113 new tests (235 → 348: 30 plan 07-01 + 58 plan 07-02 + 0 plan 07-03 config-as-code + 1 UAT-fix regression). TWO mid-plan stream-idle timeouts (~20min each, on 07-01 + 07-02 executor agents) — recovered cleanly via inline completion against atomic-per-task disk state. Stream-timeout pattern now load-bearing: 4 occurrences across phases 5/6/7. Three deviations auto-fixed pre-merge (inverted jsdom polyfill guard; arrow-fn-as-constructor for maplibre mock; comment-text-vs-grep-guard friction for `mountedRef`/`easeTo`/`listen 443` literals — second time this hazard surfaced in one phase). Live UAT caught a Chromium close-watcher anti-modal-trap: double-Esc dismissed the HandlePickerModal even with cancel-preventDefault — fixed with document-level keydown capture-phase listener. 3 mobile UAT items deferred to post-Phase-8 deployment QA (iPhone 60FPS orbit sustain, iOS globe projection rendering, mixed-case URL resolution on the deployed stack). |

**Recent Trend:**

- `superpowers:dispatching-parallel-agents` worked exactly as designed: Wave 1 of Phase 6 (06-01 + 06-02) shipped in parallel, ~90min wall clock for ~3h of serial work, zero cross-plan conflicts. Key prerequisite: atomic dep pre-install (one commit, one lockfile mutation) before dispatching parallel agents to avoid bun.lock race.
- Plan-checker round-2 revision pattern now load-bearing for Phase 6: round 1 caught 4 blockers (2 silently-dropped CONTEXT.md decisions, 1 server MIME-sniff gap, 1 cross-plan dep miss). The cost of one revision round was ~10min; the cost of executing wrong plans would have been hours.
- Stream watchdog kills are recoverable with atomic-per-task commit discipline. Phase 6 Waves 1+3 both had stream timeouts AFTER all task commits + SUMMARY.md were on disk — git log + ls verified, no rework needed.
- OCI Object Storage CORS landmine: Console UI has no CORS tab; Native API silently drops `corsRules` from `bucket update --from-json` (HTTP 200 with no rules persisted); S3-compat endpoint via AWS CLI is the only working path. Saved as project memory.
- Subagent-driven-development with two-stage review caught more bugs pre-merge than gsd-executor's single-pass model (Phase 5: 5 distinct latent bugs surfaced by reviewers, all fixed before merge)
- UAT still catches StrictMode-specific bugs (mountedRef pattern, MapPicker effect coordination) — review subagents miss these because they don't see runtime behavior
- DEFERRABLE unique constraint from Phase 4 was real and load-bearing; the two-row swap test proves the constraint works under concurrent reorder
- Drizzle's `DrizzleQueryError` wrapping silently breaks naïve `err.code === '23505'` checks — saved as project memory; future server code uses `pgErrorCode(err)` helper
- Test count growth: 88 → 140 (Phase 5) → 235 (Phase 6) — +147 tests across 2 phases
- cities.test.ts hit 945 lines (past 800 ceiling) in Phase 5 — still flagged for split; deferred into Phase 7+ housekeeping

*Updated after each phase completion*

## Accumulated Context

### Roadmap Evolution

- Phase 08.1 inserted after Phase 8: infra-terraform (TF-first OCI provisioning before Phase 8 DNS cutover) (URGENT)

### Decisions

Decisions are logged in `.planning/PROJECT.md` Key Decisions table. Recent decisions affecting current work:

- **Phase 1**: Pure gesture state machine + effectful React hook split.
- **Phase 1**: Window-level pointer listeners with `capture: true` (MapLibre's `setPointerCapture` swallows element-level events).
- **Phase 1**: `touch-action: none` on `.reel-root`. Flick detection uses duration < 300ms gate, not velocity.
- **Phase 2**: MapTiler `streets-v2-dark` style URL with demotiles fallback when key absent.
- **Phase 2**: LCP poster is a generic dark radial gradient (no JPEG asset). Scales to multi-user reels in Phase 9.
- **Phase 2**: MapLibre's CSS imported in `src/main.tsx` (eager bundle), not at the top of MapCanvas.tsx (lazy chunk). Avoids JS-runs-before-CSS race.
- **Phase 2**: `manualChunks: { maplibre: ['maplibre-gl'] }`. Maplibre is a separate ~283 KB gzip chunk.
- **Phase 2**: Vitest 4.x; 100% line + branch coverage on stateMachine.ts.
- **Phase 3**: React Router v7 (unified `react-router` package, not `react-router-dom`). `createBrowserRouter` + `RouterProvider`.
- **Phase 3**: `darkMode: 'media'` (Tailwind 3.4) — system preference, no manual toggle in v1. Manual toggle deferred to v2 (logged in `.planning/TODOS.md`).
- **Phase 3**: Light-mode tokens via `@media (prefers-color-scheme: light)` direct overrides on `--color-*` (no semantic-alias layer like `--bg`/`--surface`/`--accent` — would have been dead config).
- **Phase 3**: Public reel always dark (DESIGN.md:72). `--color-bg-map` is NOT overridden in light mode.
- **Phase 3**: `RequireAuth` is a 13-line pass-through stub for now. Phase 4 edits this file to add Auth0 — clean seam, no restructure needed.
- **Phase 3**: BottomNav text-only (Reel | Trips | Me); no icon library installed.
- **Phase 3**: `/app/` Reel ↔ BottomNav z-index collision solved via `.app-reel-host` wrapper + scoped CSS rule (`!important` required because ChapterRail uses inline `bottom` style).
- **Phase 3**: Amber tokens reconciled to DESIGN.md (`#FFE4A0` / `#FFD470` / `#E8B040`) in both `index.css` and `tailwind.config.ts` — pre-existing drift surfaced during planning.
- **Phase 4**: Backend lives at `server/` at repo root (NO monorepo / workspaces). Frontend stays at `src/`. One `bun run dev` runs both via custom `scripts/dev.ts` (spawn vite + tsx watch, prefix output, signal-forward).
- **Phase 4**: JWKS validation via `jose` (`createRemoteJWKSet` + `jwtVerify`) wrapped in custom Hono middleware. Tests use `jose.SignJWT` + `createLocalJWKSet` injected via `__setJwksGetterForTest` hook — no live Auth0 required for the unit tests.
- **Phase 4**: DATA-02 deferrable unique constraint on `cities (user_id, order_index)` is owned by hand-authored migration `0001_cities_deferrable_unique.sql`. Schema.ts has NO `uniqueIndex` declaration for it — by design, so future `db:generate` runs don't silently regress the constraint to a non-deferrable index. DATA-02 OWNERSHIP NOTICE block at top of `schema.ts` documents this.
- **Phase 4**: Lazy user provisioning (AUTH-03) is server-side middleware (`lazyProvisionUser`), not Auth0 webhook. Runs after `requireJwt`, INSERTs `users` row on first miss keyed by `auth0_sub`, leaves `handle` NULL for the picker.
- **Phase 4**: `<AuthProvider>` mounts inside `AppLayout` (NOT `main.tsx` or `App.tsx`) — AUTH-04 grep-enforced: `@auth0/auth0-react` import is forbidden in public routes (`/`, `/u/:handle`, 404).
- **Phase 4**: Handle picker is modal-based (`HandlePickerGate` + `HandlePickerModal`), not a separate route. Triggers when `users.handle IS NULL` after first authenticated `/api/me` call. Reserved-word list has 26 entries.
- **Phase 4**: `.env.local` has dual sets of Auth0 keys — `AUTH0_*` (server reads) and `VITE_AUTH0_*` (frontend reads). Same values; SPAs ship client_id in JS bundles by design so duplicating it is not a secret leak.
- **Phase 5**: `pgErrorCode(err)` helper at `server/db/pgError.ts` unwraps both raw pg `err.code` and Drizzle's `DrizzleQueryError.cause.code`. Required because Drizzle wraps pg errors and naïve `err.code === '23505'` never fires — caught a latent silent-500 on duplicate-handle POST in `me.ts`. Applied to all four route catch blocks (cities.ts GET/POST/PATCH/DELETE) and me.ts.
- **Phase 5**: BigDataCloud reverse-geocoding is client-side only per Fair Use Policy. CI-enforced via `server/auth/__no-bigdatacloud.test.ts` meta-test (walks `server/**/*.ts` and fails the build if any file mentions the string). `__` prefix convention for project-invariant meta-tests.
- **Phase 5**: `reorderSchema` Zod uses `.strict()` outer + `superRefine` for duplicate-id, duplicate-orderIndex, gap-detection. Pre-flight ownership AND completeness check runs OUTSIDE the transaction (body must include ALL user's cities, not a partial reorder).
- **Phase 5**: `PATCH /api/cities/reorder` runs all UPDATEs inside `db.transaction(async (tx) => ...)` — first endpoint to exercise the DATA-02 DEFERRABLE constraint. Two-row swap test (cities 0,1 → 1,0) proves DEFERRABLE works end-to-end. Single `now = new Date()` shared across all rows in the batch.
- **Phase 5**: Hono route ordering: `PATCH /reorder` MUST be registered BEFORE `PATCH /:id` (Hono matches in registration order — `/reorder` would otherwise be captured as an id param). Locked in by a regression-guard test asserting 200, not 422-from-updateCitySchema.
- **Phase 5**: REEL-09 grouping: `groupChapters` pure function collapses ADJACENT (not global) cities with byte-equal `(lat, lng)` into one `ChapterGroup`. Exact equality, no tolerance. Photo cycling half of REEL-09 deferred to Phase 6+ (no photos yet). `groupsToChapters` helper encapsulates the `members[0]` projection so Phase 6 has one site to upgrade.
- **Phase 5**: DnD library locked to `@dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities`. Drag handle is a separate `<button aria-label="Reorder">` with `min-w-[44px]` — listeners applied only to the handle, NOT the whole row, so card-body taps still open the edit form. PointerSensor `activationConstraint: { distance: 4 }` prevents accidental drag on tap.
- **Phase 5**: Optimistic-update mirror pattern: local `useState` order mirror + `useEffect` resync on cities prop change. On drag end: setOrder(newOrder) → PATCH → on failure throw to revert. `pendingRef` gate prevents concurrent-drag stale-snapshot revert.
- **Phase 5**: MapPicker reactive marker sync via dual-effect pattern: init effect handles map+click+initial-fitBounds and sets `mapReadyTick`; sync effect with deps `[cities, mapReadyTick]` owns ALL city-marker rendering (tear-down + recreate). Cleanup explicitly disposes markers BEFORE `map.remove()` to prevent listener leaks.
- **Phase 5**: `/app/` reel switched from `SEEDED_CITIES` to API data via `useCitiesQuery → groupChapters → groupsToChapters`. `Reel` + `ReducedMotionReel` gained `chapters?: readonly CityChapter[]` prop with `= SEEDED_CITIES` default — zero-arg public-route calls (`PublicReelRoute`, `HandleReelRoute`) still render seeded data unchanged. Phase 7 wires public routes to per-handle data.
- **Phase 5**: `arrivedAt` date-input timezone anchor: client converts `"YYYY-MM-DD"` to `new Date(\`${ymd}T00:00:00\`).toISOString()` before POST/PATCH. Prevents day-shift for non-UTC users (Tokyo +9: saving "today" at 10pm local would otherwise round to UTC midnight → previous day).
- **Phase 5**: `mountedRef` pattern under React 18 StrictMode requires re-anchor inside the effect body (`mountedRef.current = true; return () => { mountedRef.current = false }`). Without re-anchor, StrictMode's double-invoke leaves the ref stuck at false on the live remount and post-await guards all early-return — surfaces as Save button stuck on "Saving". Saved as project memory.
- **Phase 5**: Saved-city pin = 12px amber circle with thin dark border + soft amber halo per DESIGN.md single-accent rule. Draft pin = 18px amber circle with double-stop halo (stronger glow). Teardrop SVG attempt (one commit) reverted — DESIGN.md mandates `border-radius: 50%` for map pins and amber as THE pin color.
- **Phase 5**: Auth0 SDK `cacheLocation: 'memory'` kept as-is — re-login-on-reload is acceptable for the portfolio use case (users land once and scroll). Saved as 5th landmine in Auth0 SPA setup memory for future projects.
- **Phase 6 (06-03)**: `@testing-library/react` + `jsdom` installed as dev deps — plan stated "already installed" but project had none. Per-file `// @vitest-environment jsdom` annotation used (not global) because `jose` library's Uint8Array coercion fails in jsdom environment. Server tests stay in node.
- **Phase 6 (06-03)**: Photos trigger in TripsRoute rendered as separate per-city amber ghost button list below CityList (not via CityList prop) — CityList.tsx is Phase 5 scope, read-only for this plan.
- **Phase 6 (06-03)**: PhotoViewer created during Task 3 (PhotoDetailSheet dependency) rather than waiting for Task 4 — avoids two-pass build failure without changing the commit ownership (Task 4 commits the file).
- **Phase 6 (06-03)**: Caption is read-only in both PhotoDetailSheet and PhotoViewer per CONTEXT.md deferred_ideas. Per-photo delete is LOCKED (implemented). Full-screen viewer is LOCKED (implemented).
- **Phase 6 (06-04)**: Hidden aria-hidden img used for single-next preload (not `<link rel="preload">`) — jsdom does not add `<link>` in body to queryable DOM. AppReelContent inner component extracted to satisfy rules-of-hooks (useAllPhotos must not be called after early returns). Cycle interval: 4s per orchestrator spec (CONTEXT.md originally said 2.5s — discrepancy flagged in SUMMARY for real-device QA tuning). REEL-09 closed.

### Pending Todos

[From `.planning/todos/pending/` — ideas captured during sessions]

- **Lighthouse mobile audit** on `bun run preview` — verify LCP element, perf score ≥ 90, CLS ≤ 0.1. Phase 2 deferred check.
- **Optional: split framer-motion into its own chunk** in vite.config.ts manualChunks. Phase 2 follow-up.
- **Visual review of Phase 3 routes on iPhone:** `/`, `/u/foo`, `/app/`, `/app/trips`, `/app/me`, light/dark mode toggle via OS settings.
- **Visual review of Phase 2 motion** (Apple-Weather-pace check on Framer choreography + tuned flyTo).
- **Manual theme toggle in v2** (logged in `.planning/TODOS.md` by 03-03).
- **Future refactor (Phase 9):** extract `<ReelView />` shared between PublicReelRoute / HandleReelRoute / AppReelRoute — currently each branches `usePrefersReducedMotion()` independently.
- **Phase 4 doc fix:** plan 04-02 told user to whitelist Allowed Callback URLs as origin-only (`http://localhost:5173`) but the SDK code sends `${origin}/app`. User had to extend the dashboard whitelist after first run. Worth a small follow-up to either patch the plan/SUMMARY or change the code's `redirect_uri` to be origin-only.
- **Phase 5 carry-overs (housekeeping candidates for Phase 6 lead-in):**
  - Split `server/routes/cities.test.ts` (945 lines, past 800 ceiling). Natural cuts: `cities.read.test.ts`, `cities.write.test.ts`, `cities.reorder.test.ts` + shared `cities.test.helpers.ts`.
  - Move pre-flight ownership/completeness check INSIDE the `db.transaction` in PATCH /reorder — closes the narrow TOCTOU race where a concurrent DELETE could leave a gap in 0..n-1.
  - Replace `mapReadyTick` side-effect counter in MapPicker with `useState(map)` so React re-renders on init naturally.
  - Add keyed `Map<cityId, Marker>` diff in MapPicker so unchanged cities don't get torn down + recreated on every prop change. Defer until 100+ cities.
  - Extract `formatArrived` from `CityList.tsx` + `ChapterOverlay.tsx` into `src/utils/formatDate.ts`.
  - Deterministic `updatedAt` seed in PATCH-strictly-advances test (currently uses 50ms sleep; backdate seed to `Date.now() - 1000` for full determinism).

### Blockers/Concerns

[Issues that affect future work]

- **Phase 6 prereq**: OCI Object Storage bucket created + Pre-Authenticated Request (PAR) URL minting flow understood. Account ID, region, namespace, bucket name needed in `.env.local`.
- **Phase 6 prereq**: HEIC → JPEG client-side library decision (`heic-to`, `libheif-js`, or browser-native `<input>` accept filter only?). Bundle-size impact on the public-routes-stay-tiny invariant must be considered (HEIC libs are 200+ KB; lazy-load behind `/app/` only).
- **Phase 6 prereq**: thumbnail strategy — server-side via `sharp` (Hono runs on Bun; sharp works), or client-side double-upload? Affects server VM CPU sizing in Phase 8.
- **Phase 8 prereq**: OCI Ampere A1 VM provisioning — confirm 2 OCPU / 8 GB sizing.
- **Phase 8 prereq**: DNS for `timeline.bryanlam.dev` not yet pointed.

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Auto-import | Google Takeout location-history → city seed | v2 | Phase 1 (planning) |
| AI captions | LLM-generated captions from photo+EXIF | v2 | Phase 1 (planning) |
| Trip entity | Multi-city named trips with shared cover photo | v2 | Phase 1 (planning) |
| Social graph | Following/discovery between users | v2 | Phase 1 (planning) |
| GDPR | User-initiated export + delete flows | v2 | Phase 1 (planning) |
| Offline | Service worker + cached reel playback | v2 | Phase 1 (planning) |
| 3D terrain | MapLibre 3D layer | v2 | Phase 1 (planning) |
| Self-hosted tiles | tileserver-gl Docker container | v2 | Phase 1 (planning) |
| MP4 worker VM | Decoupled render VM | v2 | Phase 1 (planning) |
| Optimistic locking | Concurrent write detection | v2 | Phase 1 (planning) |
| Photo gallery | Dedicated per-city gallery view | v2 | Phase 1 (planning) |
| Per-reel poster generation | Server-side first-frame render at save time | Phase 9+ | Phase 2 (post-mortem) |
| Manual theme toggle | UI control to override `prefers-color-scheme` | v2 | Phase 3 (03-03 planning) |
| Country column | Persist reverse-geocoded country on cities row | v2 | Phase 5 (05-03 SUMMARY) |
| REEL-09 photo cycling | Cycle through ChapterGroup.members' photos when chapters collapse | Phase 6+ | Phase 5 (05-03 — no photos yet) |
| `mapReadyTick` refactor | Replace side-effect counter with `useState(map)` | Phase 6+ | Phase 5 (05-03 code review M4) |
| MapPicker marker diffing | Keyed `Map<cityId, Marker>` instead of full tear-down | Phase 6+ | Phase 5 (05-03 code review I-4) |

## Session Continuity

Last session: 2026-05-18T03:44:20.895Z
Stopped at: Phase 08.1 context gathered

**Next action**: Plan Phase 6 (Photo upload pipeline). ROADMAP goal: iPhone HEIC files converted to JPEG client-side, resized to 2048px max longest-edge, EXIF stripped, uploaded to OCI Object Storage via PAR, thumbnails generated server-side, photo detail sheet opens on overlay tap.

Phase 6 is where the cinematic surface gets its actual photos. REEL-09's "cycling photos" half — deferred from Phase 5 — gets implemented here once photos exist. The `ChapterGroup.members` array is already preserved on the type for that purpose; Phase 6 wires the cycling animation.

Phase 6 also is where the existing public reel surface (`/`, `/u/:handle`) starts looking like a real product — Phase 7 will wire the per-handle data fetch, but Phase 6 photos will already render on `/app/` reels.

Codebase map (`.planning/codebase/`) was refreshed before Phase 5 (2026-05-09). Phase 5 added: server validation/, db/pgError.ts, components/CityList.tsx, components/CityForm.tsx, reel/groupChapters.ts, geocode/bigdatacloud.ts, routes for AppReelRoute/TripsRoute. Worth a `/gsd-map-codebase` refresh before Phase 6 planning, OR have the planner cite the missing parts.

## Notable Artifacts

- **Source-of-truth gstack docs** at `~/.gstack/projects/usbryanchlam-timeline-revamp/bryanlam-main-design-20260423-104825.md` (master plan) and `bryanlam-main-eng-review-test-plan-20260424-200544.md` (QA plan). Repo copies in `docs/plan.md` and `docs/test-plan.md` are snapshots; gstack remains primary.
- **Design system** at `DESIGN.md` (repo root) — read before any UI change. Amber tokens at `DESIGN.md:85-87`; "public reel always dark" lock at `DESIGN.md:72`; "map pin: `border-radius: 50%`" at `DESIGN.md:159`; "Active map pin: 16px circle with amber gradient + glow halo" at `DESIGN.md:230`.
- **v2 backlog** at `TODOS.md` (repo root) and `.planning/TODOS.md` (Phase-3-internal toggles).
- **Codebase map** at `.planning/codebase/` — STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS. **Stale post-Phase-5** (cities CRUD endpoints, CityForm/CityList, groupChapters, MapPicker reactive sync, pgError helper, BigDataCloud meta-test all not yet documented). Worth refreshing before Phase 6 planning OR citing the staleness in the plan prompt.
- **`.env.local`** has 11 keys total: `VITE_MAPTILER_KEY`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `PORT`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`. All gitignored. Phase 6 will likely add OCI PAR credentials: `OCI_BUCKET_NAMESPACE`, `OCI_BUCKET_NAME`, `OCI_REGION`, and a PAR-creation credential (key file path or signing key).
- **Phase memory feedback** saved to `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/`:
  - `feedback_post_merge_install.md` — bun install after merging deps
  - `feedback_lazy_chunk_css.md` — hoist library CSS out of lazy chunks
  - `feedback_dual_runtime_env.md` — Vite VITE_-prefix vs server unprefixed
  - `feedback_auth0_spa_setup.md` — 5 Auth0 SPA dashboard landmines
  - `project_drizzle_pg_error_wrapping.md` — DrizzleQueryError wraps pg.code at err.cause.code
  - `feedback_mountedref_strictmode.md` — useRef(true) + cleanup-only effect leaves ref stuck at false after StrictMode double-mount

---
*Last updated: 2026-05-14 after Phase 6 closure (commits 9038eda, 5f30cda, a8933b9, ce04aa2).*
