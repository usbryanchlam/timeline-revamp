# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-27)

**Core value:** The motion — camera flies like a movie. Apple Maps Flyover / Apple Weather as the polish bar.
**Current focus:** Phase 5 — City CRUD + map picker.

## Current Position

Phase: **5 of 12** (City CRUD + map picker)
Plan: 0 of N (not yet planned)
Status: **Ready to plan**
Last activity: 2026-05-09 — Phase 4 closed out. Two plans landed (04-01 backend skeleton, 04-02 Auth0 + lazy provisioning + handle picker). End-to-end Auth0 flow validated on browser: Universal Login → handle picker modal → /app/ reel with bottom nav. Three Auth0 dashboard landmines hit during testing (callback URL path mismatch, SPA-vs-API per-app authorization grant required, dual env var sets needed for Vite); all resolved and saved as feedback memory.

Progress: [████░░░░░░░░] 33% (4 of 12 phases complete)

## Performance Metrics

**Velocity:**
- Total phases completed: 4
- Total plans completed: 12 (1 Phase 1, 6 Phase 2 incl. hotfix, 3 Phase 3, 2 Phase 4)
- Average duration: ~5h30m per phase
- Total execution time: ~22 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan | Notes |
|-------|-------|-------|----------|-------|
| 1 (Reel + gestures) | 1 | ~6h | ~6h | Single hand-coded plan; iPhone gesture polish |
| 2 (Reel polish + perf) | 6 | ~5h | ~50min | Parallel agent dispatch; one bug-chase iteration (lazy CSS) |
| 3 (App shell) | 3 | ~5h | ~1h40 | Parallel wave 1 + solo wave 2; plan-checker caught 3 blockers pre-execution |
| 4 (Backend + Auth0) | 2 | ~6h | ~3h | Sequential plans (04-02 depends on 04-01); plan-checker round 1 REVISE (DATA-02 brittle constraint approach + Tasks 5/6 ordering); 3 Auth0 dashboard landmines on first live test |

**Recent Trend:**
- Plan quality improved phase-over-phase (Phase 3 + Phase 4 both had plan-checker REVISE rounds catching real issues pre-execution)
- Phase 4 was the largest plan-line count yet (~1900 lines combined for 2 plans) — embedded code samples were load-bearing for first-time-backend territory; small incremental cleanup possible next time
- Auth0 SPA dashboard config has more landmines than Regular Web Apps; saved feedback memory documents the four (callback path, per-app authorization, dual env vars, hosted-domain confusion)
- Test count: 85 → 88 (Phase 4 added 3 jose-based JWT validation tests using in-memory keypair injection)

*Updated after each phase completion*

## Accumulated Context

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

### Pending Todos

[From `.planning/todos/pending/` — ideas captured during sessions]

- **Lighthouse mobile audit** on `bun run preview` — verify LCP element, perf score ≥ 90, CLS ≤ 0.1. Phase 2 deferred check.
- **Optional: split framer-motion into its own chunk** in vite.config.ts manualChunks. Phase 2 follow-up.
- **Visual review of Phase 3 routes on iPhone:** `/`, `/u/foo`, `/app/`, `/app/trips`, `/app/me`, light/dark mode toggle via OS settings.
- **Visual review of Phase 2 motion** (Apple-Weather-pace check on Framer choreography + tuned flyTo).
- **Manual theme toggle in v2** (logged in `.planning/TODOS.md` by 03-03).
- **Future refactor (Phase 9):** extract `<ReelView />` shared between PublicReelRoute / HandleReelRoute / AppReelRoute — currently each branches `usePrefersReducedMotion()` independently.
- **Phase 4 doc fix:** plan 04-02 told user to whitelist Allowed Callback URLs as origin-only (`http://localhost:5173`) but the SDK code sends `${origin}/app`. User had to extend the dashboard whitelist after first run. Worth a small follow-up to either patch the plan/SUMMARY or change the code's `redirect_uri` to be origin-only.
- **Phase 5 prereq:** BigDataCloud reverse-geocoding API key (or chosen provider). Used for click-on-map → city-name lookup. Free tier check.

### Blockers/Concerns

[Issues that affect future work]

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

## Session Continuity

Last session: 2026-05-09
Stopped at: Phase 4 fully shipped + verified end-to-end. `main` at `f86c4d2` (origin synced). Two plans landed (04-01 backend, 04-02 Auth0). 88/88 tests pass. Frontend + server typecheck green via shared `tsconfig.json` references. User completed live login flow on browser: Universal Login → handle picker modal (entered a handle) → /app/ reel renders with bottom nav. Lazy provisioning created `users` row keyed by Auth0 `sub` claim.

**Next action**: Plan Phase 5 (City CRUD + map picker). 3+ plans expected. ROADMAP goal: user clicks on map → BigDataCloud reverse-geocodes lat/lng → form pre-fills city name → save creates `cities` row with `order_index = max(order_index) + 1` → drag-reorder triggers `PATCH /api/cities/reorder` in single transaction with the deferred-unique constraint → Trips view renders combined map (pins) + chronological list.

Phase 5 is where the deferrable constraint from Phase 4 actually gets exercised. The `cities_user_id_order_index_unique` constraint is `DEFERRABLE INITIALLY DEFERRED` so a bulk reorder transaction can SET, swap, COMMIT without intermediate uniqueness violations. Plan 05-XX should cite DATA-02 OWNERSHIP NOTICE in `server/db/schema.ts` and walk through the transaction pattern explicitly.

Codebase map (`.planning/codebase/`) is now stale — Phase 4 added `server/` and `scripts/` directories not in the map. Worth a `/gsd-map-codebase` refresh before Phase 5 plans, OR have the planner cite the missing parts and accept the staleness for one more phase.

## Notable Artifacts

- **Source-of-truth gstack docs** at `~/.gstack/projects/usbryanchlam-timeline-revamp/bryanlam-main-design-20260423-104825.md` (master plan) and `bryanlam-main-eng-review-test-plan-20260424-200544.md` (QA plan). Repo copies in `docs/plan.md` and `docs/test-plan.md` are snapshots; gstack remains primary.
- **Design system** at `DESIGN.md` (repo root) — read before any UI change. Amber tokens at `DESIGN.md:85-87`; "public reel always dark" lock at `DESIGN.md:72`.
- **v2 backlog** at `TODOS.md` (repo root) and `.planning/TODOS.md` (Phase-3-internal toggles).
- **Codebase map** at `.planning/codebase/` — STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS. **Stale post-Phase-4** (backend added but not yet documented). Worth refreshing before Phase 5 planning OR citing the staleness in the plan prompt.
- **`.env.local`** has 11 keys total: `VITE_MAPTILER_KEY`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `PORT`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`. All gitignored. Phase 5 will likely add a BigDataCloud API key.
- **Phase memory feedback** saved to `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/`: post-merge `bun install`, hoist library CSS out of lazy chunks, verify dual-runtime env vars, Auth0 SPA setup landmines.

---
*Last updated: 2026-05-09 after Phase 4 closure (commit `f86c4d2`).*
