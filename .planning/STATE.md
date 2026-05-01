# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-27)

**Core value:** The motion — camera flies like a movie. Apple Maps Flyover / Apple Weather as the polish bar.
**Current focus:** Phase 3 — App shell (React Router v7, route guards, theme tokens).

## Current Position

Phase: **3 of 12** (App shell)
Plan: 0 of N (not yet planned)
Status: **Ready to plan**
Last activity: 2026-04-30 — Phase 2 closed out. Six plans landed (02-01 through 02-05 + 02-07-fix-lazy hotfix). One dead-end intermediate (02-06-skyfix, reverted in 02-07). User confirmed end-to-end map rendering works on iPhone Safari + Chrome desktop. Manual Lighthouse audit deferred but not blocking.

Progress: [██░░░░░░░░░░] 17% (2 of 12 phases complete)

## Performance Metrics

**Velocity:**
- Total phases completed: 2
- Total plans completed: 7 (1 in Phase 1, 6 in Phase 2)
- Average duration: ~5 hours per phase
- Total execution time: ~11 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan | Notes |
|-------|-------|-------|----------|-------|
| 1 (Reel + gestures) | 1 | ~6h | ~6h | Single hand-coded plan; iPhone gesture polish |
| 2 (Reel polish + perf) | 6 | ~5h | ~50min | Parallel agent dispatch via superpowers; one bug-chase iteration |

**Recent Trend:**
- Phase 2 plans averaged ~50min including parallel dispatch overhead
- Per-plan velocity improved 7× when running parallel via worktrees vs sequential
- One root-cause regression (lazy-import + library CSS race) cost ~1h to diagnose; feedback memory captured

*Updated after each phase completion*

## Accumulated Context

### Decisions

Decisions are logged in `.planning/PROJECT.md` Key Decisions table. Recent decisions affecting current work:

- **Phase 1**: Pure gesture state machine + effectful React hook split. Machine is testable in isolation; hook owns DOM/timer effects.
- **Phase 1**: Window-level pointer listeners with `capture: true`. MapLibre's `setPointerCapture` swallows element-level pointer events — without window-level capture, MAP_INTERACT cannot return to IDLE.
- **Phase 1**: `touch-action: none` (NOT `manipulation`) on `.reel-root`. iOS still claims pan rights with `manipulation`, breaking horizontal scrub.
- **Phase 1**: Flick detection uses duration < 300ms gate, not velocity threshold. Spec literal — duration IS the velocity proxy.
- **Phase 2**: MapTiler `streets-v2-dark` style URL with demotiles fallback when key absent. Sky/atmosphere not configured (and not needed — pitch 55-65 renders fine on this style).
- **Phase 2**: LCP poster is a generic dark radial gradient (no JPEG asset). Scales to multi-user reels in Phase 9 — same poster regardless of which city the user's reel starts at.
- **Phase 2**: MapLibre's CSS imported in `src/main.tsx` (eager bundle), not at the top of `MapCanvas.tsx` (lazy chunk). Avoids JS-runs-before-CSS race that broke MapLibre canvas sizing on chapter transitions.
- **Phase 2**: `manualChunks: { maplibre: ['maplibre-gl'] }` in vite.config.ts. Maplibre-gl is a separate ~283 KB gzip chunk, lazily loaded on demand. Main bundle (post-Framer) is 103 KB gzip — well under PERF-02's 250 KB ceiling.
- **Phase 2**: Vitest 4.x + `@vitest/coverage-v8`. State machine has 100% line + branch coverage (85 tests).
- **Phase 2**: Framer Motion 11 currently bundled into the main chunk (not split via manualChunks). Optional follow-up if LCP scoring requires it.

### Pending Todos

[From `.planning/todos/pending/` — ideas captured during sessions]

- **Lighthouse mobile audit** on `bun run preview` — verify LCP element is `<div>` (the new MapPoster radial gradient), perf score ≥ 90, CLS ≤ 0.1. Deferred human-verify checkpoint from 02-02. Not blocking Phase 3.
- **Optional: split framer-motion into its own chunk** in vite.config.ts manualChunks. Currently Framer is bundled into the main chunk (~37 KB gzip of the main bundle). Splitting it would shrink the LCP-blocking bundle further.
- **Visual review**: subjective Apple-Weather-pace check on Framer staggered choreography + tuned 1.6/1800ms flyTo. Deferred from 02-03.

### Blockers/Concerns

[Issues that affect future work]

- **Phase 4 prereq**: Auth0 tenant config — confirm existing personal tenant has a new application registered for this project; `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE` env vars needed.
- **Phase 8 prereq**: OCI Ampere A1 VM provisioning — confirm 2 OCPU / 8 GB sizing before W8 starts; resize or add worker VM if not.
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

## Session Continuity

Last session: 2026-04-30
Stopped at: Phase 2 fully shipped. `main` at `7af6586` (origin synced). 6 plans landed: 02-01 (MapTiler), 02-02 (originally LCP+lazy, then patched in 02-07), 02-03 (Framer + flyTo tune), 02-04 (Vitest + 85 tests), 02-05 (StateBadge prod-gate), 02-07 (lazy CSS hoist + generic poster + setSky revert). Map renders correctly on iPhone Safari and Chrome desktop across all 10 chapter transitions. PERF requirements satisfied via main bundle 103 KB gzip + 283 KB maplibre chunk.

**Next action**: Plan Phase 3 (App shell). Run `/gsd-plan-phase 3` to generate PLAN.md files. Phase 3 goal per ROADMAP.md: React Router v7 install, bottom nav + private/public route guards, light/dark theme tokens. Estimate 3-5 plans. After planning, the same parallel-worktree dispatch pattern from Phase 2 applies.

## Notable Artifacts

- **Source-of-truth gstack docs** at `~/.gstack/projects/usbryanchlam-timeline-revamp/bryanlam-main-design-20260423-104825.md` (master plan) and `bryanlam-main-eng-review-test-plan-20260424-200544.md` (QA plan). Repo copies in `docs/plan.md` and `docs/test-plan.md` are snapshots; gstack remains primary.
- **Design system** at `DESIGN.md` (repo root) — read before any UI change.
- **v2 backlog** at `TODOS.md` (repo root) — explicit cuts that should not creep back.
- **Codebase map** at `.planning/codebase/` — STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS. Refresh planned at end of W4, W6, W9.
- **MapTiler API key** in `.env.local` (gitignored); also in any active `.worktrees/*/`. Free tier 100k req/mo.
- **Phase 2 lessons saved to memory**: post-merge `bun install` discipline; library-CSS-out-of-lazy-chunks pattern.

---
*Last updated: 2026-04-30 after Phase 2 closure (commit `7af6586`).*
