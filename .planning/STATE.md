# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-27)

**Core value:** The motion — camera flies like a movie. Apple Maps Flyover / Apple Weather as the polish bar.
**Current focus:** Phase 4 — Backend skeleton + Auth0 wiring.

## Current Position

Phase: **4 of 12** (Backend skeleton + Auth0 wiring)
Plan: 0 of 2 (planning ready to start)
Status: **Ready to plan**
Last activity: 2026-05-06 — Phase 3 closed out. Three plans landed (03-01 router, 03-02 nav + auth seam + collision fix, 03-03 light/dark theme + amber reconciliation). Wave 1 dispatched in parallel via superpowers/dispatching-parallel-agents (03-01 + 03-03), wave 2 solo (03-02). Plan-checker iteration: round 1 REVISE (3 blockers + 3 warnings), round 2 PASS.

Progress: [███░░░░░░░░░] 25% (3 of 12 phases complete)

## Performance Metrics

**Velocity:**
- Total phases completed: 3
- Total plans completed: 10 (1 in Phase 1, 6 in Phase 2 incl. hotfix, 3 in Phase 3)
- Average duration: ~5 hours per phase
- Total execution time: ~16 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan | Notes |
|-------|-------|-------|----------|-------|
| 1 (Reel + gestures) | 1 | ~6h | ~6h | Single hand-coded plan; iPhone gesture polish |
| 2 (Reel polish + perf) | 6 | ~5h | ~50min | Parallel agent dispatch; one bug-chase iteration (lazy CSS) |
| 3 (App shell) | 3 | ~5h | ~1h40 | Parallel wave 1 + solo wave 2; plan-checker caught 3 blockers pre-execution |

**Recent Trend:**
- Plan quality improved phase-over-phase (Phase 3's plan-checker round caught issues before code wrote them)
- Side bug discovered during Phase 3 planning: amber tokens drifted from DESIGN.md — reconciled in 03-03 Task 1
- Parallel dispatch via worktrees + agents continues to net ~3× wall-clock vs sequential

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

### Pending Todos

[From `.planning/todos/pending/` — ideas captured during sessions]

- **Lighthouse mobile audit** on `bun run preview` — verify LCP element, perf score ≥ 90, CLS ≤ 0.1. Phase 2 deferred check.
- **Optional: split framer-motion into its own chunk** in vite.config.ts manualChunks. Phase 2 follow-up.
- **Visual review of Phase 3 routes on iPhone:** `/`, `/u/foo`, `/app/`, `/app/trips`, `/app/me`, light/dark mode toggle via OS settings.
- **Visual review of Phase 2 motion** (Apple-Weather-pace check on Framer choreography + tuned flyTo).
- **Manual theme toggle in v2** (logged in `.planning/TODOS.md` by 03-03).
- **Future refactor (Phase 9):** extract `<ReelView />` shared between PublicReelRoute / HandleReelRoute / AppReelRoute — currently each branches `usePrefersReducedMotion()` independently.

### Blockers/Concerns

[Issues that affect future work]

- **Phase 4 prereq**: Auth0 tenant config — confirm existing personal tenant has a new application registered for this project; need `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE` env vars. Cannot execute plan 04-02 without this.
- **Phase 4 prereq**: Docker installed and running locally — Postgres 16 in Docker for plan 04-01.
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

Last session: 2026-05-06
Stopped at: Phase 3 fully shipped. `main` at `e7fb632` (origin synced). Three plans landed: 03-01 (router), 03-02 (nav + auth seam + collision), 03-03 (theme + amber). All wave 1 + 2 worktrees cleaned up. App still builds and ships at every commit. 85/85 tests preserved through phase. No backend yet (Phase 4).

**Next action**: Plan Phase 4 (Backend skeleton + Auth0 wiring). 2 plans pre-named in ROADMAP:
- 04-01: Backend skeleton (Hono + Drizzle + migrations + health + Postgres in Docker, no auth)
- 04-02: Auth0 wiring (Universal Login, JWT middleware, lazy provisioning, handle picker UI)

Plan 04-02 covers AUTH-05/06/07 (handle pattern, reserved words, picker prompt) in addition to AUTH-01-04 listed in ROADMAP — the handle picker UI line implies these. Worth flagging during planning.

After planning, plan 04-01 can execute immediately (Docker required); plan 04-02 blocks on user creating an Auth0 application and pasting the env vars into `.env.local`.

## Notable Artifacts

- **Source-of-truth gstack docs** at `~/.gstack/projects/usbryanchlam-timeline-revamp/bryanlam-main-design-20260423-104825.md` (master plan) and `bryanlam-main-eng-review-test-plan-20260424-200544.md` (QA plan). Repo copies in `docs/plan.md` and `docs/test-plan.md` are snapshots; gstack remains primary.
- **Design system** at `DESIGN.md` (repo root) — read before any UI change. Amber tokens at `DESIGN.md:85-87`; "public reel always dark" lock at `DESIGN.md:72`.
- **v2 backlog** at `TODOS.md` (repo root) and `.planning/TODOS.md` (Phase-3-internal toggles).
- **Codebase map** at `.planning/codebase/` — STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS. **Refresh recommended** at end of Phase 4 (backend introduces a whole new area not in current map).
- **MapTiler API key** in `.env.local` (gitignored); Auth0 env vars NOT YET added (needed for Phase 4 04-02).
- **Phase memory feedback** saved to `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/`: post-merge `bun install`, hoist library CSS out of lazy chunks.

---
*Last updated: 2026-05-06 after Phase 3 closure (commit `e7fb632`).*
