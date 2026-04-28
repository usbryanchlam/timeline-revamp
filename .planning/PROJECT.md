# Timeline

## What This Is

A cinematic mobile-first travel-memory reel where the map is the canvas and time is the axis you scrub. Recruiters open the link on their phone and within 30 seconds see Bryan's actual trips already playing — camera flying between cities with pitch and bearing, photos popping in as the camera lands, captions fading, chapters ticking by like an Instagram Story made of geography. Authenticated users get their own `/u/:handle` reel; an MP4 export turns any reel into a shareable card.

## Core Value

**The motion.** The camera flies like a movie. If everything else fails, the cinematic flyTo between chapters must feel like Apple Maps Flyover or Apple Weather — that is what makes the product memorable.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] **REEL-01**: Hardcoded 10-chapter reel with full gesture state machine running on iPhone 14 Pro (Safari + Chrome), all 6 states verified manually.
- [x] **REEL-02**: Reduced-motion fallback renders all chapters in a static scrolling list.
- [x] **REEL-03**: Bottom-horizontal chapter rail per design mockup with scrub cursor partial-fill.

### Active

<!-- Current scope. Building toward W12 launch. Tracked in REQUIREMENTS.md. -->

See `.planning/REQUIREMENTS.md` — 30+ requirements across REEL, AUTH, DATA, PUBLIC, DEPLOY, MP4, A11Y, PERF.

### Out of Scope

<!-- Explicit boundaries from docs/plan.md § scope cuts. Includes reasoning. -->

- **"Trips" as a separate entity** — flat cities with optional `trip_label` string covers v1; trip-grouping is v2 enhancement.
- **Two views (Reel + Trips as tabs)** — collapsed to one combined Trips view (map + chronological list).
- **Service worker / offline mode** — preserves weekend budget; network-required is fine for portfolio.
- **i18n** — English only for v1.
- **3D terrain on map** — MapLibre flat tiles only; 3D is v2.
- **AI captions / Google Takeout import / social graph / GDPR export** — all v2 (see TODOS.md).
- **MP4 launch gate** — MP4 is "ships if any fallback rung works"; if all three rungs fail (server, client, GIF), MP4 is cut and v1 launches without it.

## Context

**Bryan's setup:**
- Existing Auth0 tenant (personal) — used for identity, no new IdP.
- Existing OCI free tier with Ampere A1 VM available — used for hosting, no Vercel/Supabase.
- Working solo; 12 weekends of available time.
- Audience: hiring managers reviewing portfolio links on phone in 30 seconds. Low context, low patience, high visual discrimination.

**Prior work:**
- `~/Workspaces/timeline/` — old React-Leaflet travel tracker; reference only, not a migration.
- This project is greenfield reimagination, not modernization of the stack.

**Design system:**
- See `DESIGN.md` for typography, color, motion tokens, component inventory.
- Three locked design risks: single amber accent, arrival-pulse signature easing, no empty-state illustrations on public surfaces.
- Aesthetic direction: **Cinematic-Editorial Hybrid**. Reference: Apple Weather, Apple Maps Flyover, premium travel publication.

## Constraints

- **Tech stack**: React 19 + TypeScript + Vite 7 — current, demonstrates modern stack.
- **Map renderer**: MapLibre GL JS v5 (NOT Leaflet) — the cinematic thesis cannot execute on a DOM renderer.
- **Auth**: Auth0 Universal Login — owned infra, resume-worthy.
- **Storage**: OCI Object Storage via Pre-Authenticated Requests (PARs), NOT S3 signed URLs — OCI-native.
- **Deploy**: Docker Compose on OCI Ampere A1 VM (2 OCPU / 8GB minimum) — existing infra.
- **Backend**: Hono + Drizzle + Postgres 16 in Docker — fast, typed, schema-as-code.
- **Mobile-first**: iPhone 14 Pro is canonical reference device. Desktop is the also-works surface.
- **Browser floor**: iOS 17+ Safari, Chrome 109+, Firefox 115+ (per MediaRecorder + WebGL captureStream reality).
- **Performance budget**: Lighthouse mobile ≥ 90 on public reel; initial JS ≤ 250KB gzipped (excludes MapLibre, dynamic-imported after LCP); LCP ≤ 2.5s on Moto G4 3G; CLS ≤ 0.1.
- **MP4 RAM math**: at 8GB Ampere VM with concurrency=1, headless Chromium + FFmpeg + Postgres + Redis + Node + OS ≈ 3.3GB idle. A second concurrent Chromium would near OOM under spike.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MapLibre GL JS v5, not Leaflet | Cinematic camera with pitch/bearing/curve requires WebGL vector tiles | ✓ |
| Tailwind 3.4, not v4 | v4 still settling; 3.4 + container-queries plugin is calmer for W1 | ✓ |
| bun as package manager | Garry/gstack ecosystem default, install ~3x faster than npm cold | ✓ |
| Single amber accent (#FFD470) | Constraint forces palette discipline, photos do the color work | ✓ |
| Arrival-pulse easing `cubic-bezier(0.16, 1, 0.3, 1)` | Signature motion identity — overshoot lands "like Apple Weather" | ✓ |
| Mobile portrait Variant B (Cinematic) | Approved via /design-shotgun mockups, recruiter mental model match | ✓ |
| Skip W0 de-risk spike | Discover MP4 perf problems by hitting them; if it doesn't work we cut | ✓ Pending W10 |
| Lazy user provisioning on first JWT | Simpler than Auth0 webhook; user row created on first authenticated call | — Pending W4b |
| Public-read OCI bucket prefix for photos | One PAR for all thumbnails, simpler than per-photo PARs | — Pending W6 |
| Bulk PATCH `/api/cities/reorder` with `db.transaction()` | Postgres `DEFERRABLE INITIALLY DEFERRED` unique constraint | — Pending W5 |
| MP4 fallback ladder: server → client MediaRecorder → GIF → cut | Pre-committed escape hatch; launch is not blocked by MP4 | — Pending W10–W11 |
| Pure gesture state machine + effectful React hook | Machine is testable in isolation; hook owns DOM/timer effects | ✓ |
| Window-level pointer listeners with `capture: true` | MapLibre's `setPointerCapture` swallows element-level events | ✓ |

---
*Last updated: 2026-04-27 after `/gsd-import` path 1 hand-import from gstack docs*
