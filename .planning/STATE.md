# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-27)

**Core value:** The motion — camera flies like a movie. Apple Maps Flyover / Apple Weather as the polish bar.
**Current focus:** Phase 2 — Reel polish + perf budget.

## Current Position

Phase: **2 of 12** (Reel polish + perf budget)
Plan: 0 of 5 (planning not yet started — run `/gsd-plan-phase 2`)
Status: **Ready to plan**
Last activity: 2026-04-27 — Phase 1 closed; `.planning/` initialized via `/gsd-import` path 1 (hand-import from gstack docs).

Progress: [█░░░░░░░░░░░] 8% (1 of 12 phases complete)

## Performance Metrics

**Velocity:**
- Total phases completed: 1
- Total plans completed: 1
- Average duration: ~6 hours (W1 ran across 2 evenings)
- Total execution time: ~6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 (Reel + gestures) | 1 | ~6h | ~6h |

**Recent Trend:**
- Last 1 plan: 6h
- Trend: Insufficient data (1 sample)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in `.planning/PROJECT.md` Key Decisions table. Recent decisions affecting current work:

- **Phase 1**: Pure gesture state machine + effectful React hook split. Machine is testable in isolation; hook owns DOM/timer effects.
- **Phase 1**: Window-level pointer listeners with `capture: true`. MapLibre's `setPointerCapture` swallows element-level pointer events — without window-level capture, MAP_INTERACT cannot return to IDLE.
- **Phase 1**: `touch-action: none` (NOT `manipulation`) on `.reel-root`. iOS still claims pan rights with `manipulation`, breaking horizontal scrub.
- **Phase 1**: Flick detection uses duration < 300ms gate, not velocity threshold. Spec literal — duration IS the velocity proxy.
- **Phase 2 (pre-decided)**: MapTiler swap is the first plan of Phase 2 because all later visual review depends on real city detail.
- **Phase 2 (pre-decided)**: Dynamic-import MapCanvas + LCP poster image is required for the Lighthouse 90 perf budget; not optional polish.

### Pending Todos

[From `.planning/todos/pending/` — ideas captured during sessions]

None yet (mechanism not used in Phase 1).

### Blockers/Concerns

[Issues that affect future work]

- **Phase 2 prereq**: MapTiler API key required. User signs up at maptiler.com, key goes in `VITE_MAPTILER_KEY` env var. ~5 min user task.
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

## Session Continuity

Last session: 2026-04-27
Stopped at: `.planning/` initialized via path-1 hand-import. PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md written. Codebase map already in place from earlier `/gsd-map-codebase` run.

**Next action**: `/gsd-plan-phase 2` to generate the five Phase 2 plans (MapTiler, dynamic-import, motion polish, tests, StateBadge gate).

## Notable Artifacts

- **Source-of-truth gstack docs** at `~/.gstack/projects/usbryanchlam-timeline-revamp/bryanlam-main-design-20260423-104825.md` (master plan) and `bryanlam-main-eng-review-test-plan-20260424-200544.md` (QA plan). Repo copies in `docs/plan.md` and `docs/test-plan.md` are snapshots; gstack remains primary.
- **Design system** at `DESIGN.md` (repo root) — read before any UI change.
- **v2 backlog** at `TODOS.md` (repo root) — explicit cuts that should not creep back.
- **Codebase map** at `.planning/codebase/` — STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS. Refresh planned at end of W4, W6, W9.

---
*Last updated: 2026-04-27 after `/gsd-import` path 1 hand-import.*
