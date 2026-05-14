# Requirements: Timeline

**Defined:** 2026-04-27
**Core Value:** The motion — camera flies like a movie. Apple Maps Flyover / Apple Weather as the polish bar.

## v1 Requirements

Requirements for v1 launch. Each maps to roadmap phases.

### REEL — Cinematic reel surface

- [x] **REEL-01**: Hardcoded 10-chapter reel runs on iPhone 14 Pro Safari + Chrome with all gesture transitions verified.
- [x] **REEL-02**: `prefers-reduced-motion: reduce` swaps to static vertical chapter list, native scroll, no map.
- [x] **REEL-03**: Bottom-horizontal chapter rail with scrub cursor partial-fill; matches design mockup.
- [ ] **REEL-04**: MapLibre flyTo curves tuned to feel cinematic (Apple Maps Flyover / Apple Weather reference). Subjective; passes visual review.
- [ ] **REEL-05**: Photo overlay choreography fades in offset-by-stagger via Framer Motion 11 (not hard-snap).
- [ ] **REEL-06**: MapTiler vector tiles wired; zooms restored to 12-13 with cinematic city-block landings.
- [ ] **REEL-07**: Camera arrival pulse animation fires on chapter land using `cubic-bezier(0.16, 1, 0.3, 1)`.
- [ ] **REEL-08**: Single-city reel renders an 8s orbit at zoom 14 / pitch 60 (no inter-city flyTo).
- [x] **REEL-09**: Two adjacent chapters with identical coordinates collapse to one chapter group with cycling photos.

### A11Y — Accessibility

- [ ] **A11Y-01**: Reduced-motion path passes axe-core with 0 violations.
- [ ] **A11Y-02**: Keyboard-only path completes "add a city" flow without a mouse.
- [ ] **A11Y-03**: Reel container is `role="region"` with `aria-label` (not `application` — known footgun).
- [ ] **A11Y-04**: Chapter transitions fire `aria-live="polite"` announcement ("Kyoto, October 2024").
- [ ] **A11Y-05**: Photo overlays have `alt` from user-entered captions; empty-alt if no caption.
- [ ] **A11Y-06**: Detail sheet has focus trap, `Esc` closes.
- [ ] **A11Y-07**: Overlay text passes WCAG AA contrast on bright-photo worst case (gradient scrim ensures it).
- [ ] **A11Y-08**: Keyboard controls: ←/→ scrub ±1s, ↑/↓ chapter prev/next, Space play/pause, Enter open detail.

### PERF — Performance budgets

- [ ] **PERF-01**: Lighthouse mobile ≥ 90 (perf, a11y, best practices, SEO) on public reel page.
- [ ] **PERF-02**: Initial JS ≤ 250 KB gzipped (excludes MapLibre, which is dynamic-imported after LCP).
- [ ] **PERF-03**: LCP ≤ 2.5s on Moto G4 3G; LCP element is pre-rendered 1280×720 poster of opening frame.
- [ ] **PERF-04**: CLS ≤ 0.1.
- [ ] **PERF-05**: WebGL init runs after LCP completes.

### APP — App shell + theming

- [ ] **APP-01**: Bottom nav (Reel | Trips | Me) renders on authenticated routes only.
- [ ] **APP-02**: Tailwind theme supports light + dark, system preference by default.
- [ ] **APP-03**: React Router v7 routes private tree (`/app/*`) and public tree (`/u/:handle`).

### AUTH — Authentication and handles

- [ ] **AUTH-01**: Auth0 Universal Login flow works end-to-end on production domain.
- [ ] **AUTH-02**: JWT middleware validates against Auth0 JWKS on `/api/*` (private routes only).
- [ ] **AUTH-03**: Lazy user provisioning — `users` row created on first authenticated API call, NOT via Auth0 webhook.
- [ ] **AUTH-04**: Frontend `<Auth0Provider>` wraps the private tree only; public reel never triggers silent auth.
- [ ] **AUTH-05**: Handles match `[a-z0-9-]{3,20}`, case-insensitive, lowercase-enforced, uniqueness-enforced.
- [ ] **AUTH-06**: Reserved-word list blocks `admin`, `api`, `app`, `u`, `signup`, `login`, etc.
- [ ] **AUTH-07**: Handle picker UI prompts users without a handle on first authenticated visit.

### DATA — Schema, CRUD, photos

- [ ] **DATA-01**: Drizzle schema for `users`, `cities`, `photos`, `notifications` with FK cascades documented.
- [ ] **DATA-02**: `cities` table has `DEFERRABLE INITIALLY DEFERRED` unique constraint on `(user_id, order_index)`.
- [ ] **DATA-03**: `PATCH /api/cities/reorder` accepts `[{id, order_index}, ...]` and runs in `db.transaction()`.
- [ ] **DATA-04**: City CRUD: click on map → BigDataCloud reverse-geocode → form fills → save.
- [ ] **DATA-05**: Photo upload pipeline: HEIC detect + convert to JPEG, client-side resize to 2048px max, EXIF strip, OCI PAR upload, thumbnail generation.
- [ ] **DATA-06**: Photo limits: 10 per city, 5 MB per photo, single combined `.heic`/`.jpg`/`.png` accepted.
- [ ] **DATA-07**: Photos served from public-read OCI bucket prefix (single PAR for thumbnails).

### PUBLIC — Public per-user reel

- [ ] **PUBLIC-01**: `/u/:handle` renders unauthenticated reel page with seed user's data.
- [ ] **PUBLIC-02**: Empty state (0 cities) shows world view + caption "No trips yet. Check back soon."
- [ ] **PUBLIC-03**: 1-city state shows orbit camera (per REEL-08).
- [ ] **PUBLIC-04**: Nginx caches public reels (vary on handle).
- [ ] **PUBLIC-05**: OG image is server-rendered 1200×630 PNG via `@vercel/og` or Puppeteer.
- [ ] **PUBLIC-06**: Favicon = amber pin SVG (no full logotype).

### DEPLOY — OCI deployment + CI

- [ ] **DEPLOY-01**: OCI Ampere A1 VM (2 OCPU / 8 GB min) hosts Docker Compose stack.
- [ ] **DEPLOY-02**: Nginx reverse proxy with Let's Encrypt TLS via certbot, auto-renew.
- [ ] **DEPLOY-03**: GitHub Actions CI builds + pushes to OCI Container Registry on tag.
- [ ] **DEPLOY-04**: Tagged-release auto-deploy to VM (manual SSH for W8, automated by W9).
- [ ] **DEPLOY-05**: DNS for `timeline.bryanlam.dev` cuts over to OCI VM.
- [ ] **DEPLOY-06**: Production health endpoint + request logging + error middleware on Hono API.

### ERR — Empty / error states

- [ ] **ERR-01**: Photo upload fail shows inline retry with exponential backoff, max 3 retries.
- [ ] **ERR-02**: MP4 render fail shows notification card with category + retry button. Never silently drop a job.
- [ ] **ERR-03**: MapTiler rate-limit triggers OSM raster fallback with banner: "Map service limited; some detail reduced."
- [ ] **ERR-04**: Authenticated `/app` with 0 cities shows onboarding card "Add your first city".

### MP4 — Export pipeline (stretch goal, non-blocking)

- [ ] **MP4-01** (rung 1, server-side): BullMQ + Redis + Puppeteer + MapLibre + FFmpeg renders 300-frame benchmark in ≤ 90s wall-clock.
- [ ] **MP4-02** (rung 1 if pass): Concurrency=1, per-user 5 renders / 24h DB-enforced rate limit, 5-min job timeout.
- [ ] **MP4-03** (rung 1 if pass): Time-limited PAR for download, notification row inserted, frontend polls `/api/notifications?since=:ts` every 5s while render active.
- [ ] **MP4-04** (rung 2 fallback if rung 1 fails): Client `MediaRecorder` + `canvas.captureStream(30)`. iOS 17+ capability probe; codec order avc1 → vp9 → vp8.
- [ ] **MP4-05** (rung 3 fallback if rung 2 fails): 10-second looping GIF export.
- [ ] **MP4-06** (cut path): If all three rungs fail, MP4 is cut from v1 and shipped as v2 feature. Launch proceeds.

## v2 Requirements

Deferred to future release. See `TODOS.md` for the full backlog.

### Highlights

- **TRIP-01**: Trip-grouping entity (multi-city named trips).
- **IMPORT-01**: Auto-import from Google Takeout location history.
- **AI-01**: AI-generated captions from photo content + EXIF.
- **SOCIAL-01**: Following / discovery graph between users.
- **I18N-01**: Localized captions, dates, UI strings.
- **3D-01**: MapLibre 3D terrain on supported devices.
- **TILES-01**: Self-hosted tileserver-gl Docker container.
- **MP4-V2-01**: Dedicated MP4 worker VM (decoupled from API VM).
- **CONCURRENCY-01**: Optimistic locking on edits to detect concurrent writes.
- **GALLERY-01**: Dedicated photo gallery view per city.
- **GDPR-01**: User-initiated export + delete flows.
- **PWA-01**: Service worker for offline reel playback.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Mobile native apps | Mobile web reel is the differentiator; native is duplicative for portfolio |
| Sharing to native iOS / Android share sheets | Web Share API is enough; native deep-linking is overkill |
| Comments / likes / social interaction | Out of category — this is a reel, not a network |
| Map drawing tools (routes, polygons) | Out of category — this is a reel, not a map editor |
| Multiple map style themes | Single design system, single color story; theme variation is noise |
| Account deletion UI | GDPR export/delete is v2; v1 manages via support ticket |

## Traceability

Mapping of requirements to roadmap phases. Updated as `ROADMAP.md` evolves.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REEL-01 | Phase 1 (W1) | ✓ Done |
| REEL-02 | Phase 1 (W1) | ✓ Done |
| REEL-03 | Phase 1 (W1) | ✓ Done |
| REEL-04 | Phase 2 (W2) | Pending |
| REEL-05 | Phase 2 (W2) | Pending |
| REEL-06 | Phase 2 (W2) | Pending |
| REEL-07 | Phase 2 (W2) | Pending |
| REEL-08 | Phase 7 (W7) | Pending |
| REEL-09 | Phase 6 (W6) | ✓ Done |
| A11Y-01..08 | Phase 11 (W11) | Pending |
| PERF-01..05 | Phase 2 (W2) | Pending |
| APP-01..03 | Phase 3 (W3) | Pending |
| AUTH-01..04 | Phase 4 (W4) | Pending |
| AUTH-05..07 | Phase 4 (W4) | Pending |
| DATA-01..03 | Phase 4 (W4) | Pending |
| DATA-04 | Phase 5 (W5) | Pending |
| DATA-05..07 | Phase 6 (W6) | Pending |
| PUBLIC-01..04 | Phase 7 (W7) | Pending |
| PUBLIC-05..06 | Phase 12 (W12) | Pending |
| DEPLOY-01..02 | Phase 8 (W8) | Pending |
| DEPLOY-03..06 | Phase 9 (W9) | Pending |
| ERR-01..04 | Phase 9 (W9) | Pending |
| MP4-01..03 | Phase 10 (W10) | Pending |
| MP4-04..06 | Phase 11 (W11) | Pending |

**Coverage:**
- v1 requirements: 50 total
- Mapped to phases: 50
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-27*
*Last updated: 2026-04-27 after import from docs/plan.md*
