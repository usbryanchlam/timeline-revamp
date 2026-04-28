# Roadmap: Timeline

## Overview

Twelve weekend phases turn a hardcoded reel prototype into a deployed multi-user product. The order front-loads the cinematic hook (W1–W2), pushes risky features (MP4 export) toward the end with an explicit fallback ladder, and reserves the last weekend for launch polish + portfolio narrative. Each phase is sized so a fresh GSD execution context can complete it.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned weekend milestones, one phase per weekend.
- Decimal phases (e.g. 2.1): Reserved for urgent insertions; none yet.

- [x] **Phase 1: Reel engine prototype** - Vite + React + MapLibre + gesture state machine on hardcoded data.
- [ ] **Phase 2: Reel polish + perf budget** - MapTiler swap, dynamic-import, motion polish, first tests.
- [ ] **Phase 3: App shell** - Bottom nav, theming, React Router v7. Still no backend.
- [ ] **Phase 4: Backend skeleton + Auth0** - Hono + Drizzle + Postgres + Auth0 wiring (split into 2 plans).
- [ ] **Phase 5: City CRUD + map picker** - Click map → reverse-geocode → save. Reorder via deferred-unique transaction.
- [ ] **Phase 6: Photo upload pipeline** - HEIC convert, resize, EXIF strip, OCI PAR upload, thumbnails.
- [ ] **Phase 7: Public URLs + handle reservation** - `/u/:handle` unauthenticated reel, handle picker, Nginx cache.
- [ ] **Phase 8: Deploy part 1** - OCI VM setup, Docker Compose, Nginx + Let's Encrypt, DNS cutover.
- [ ] **Phase 9: Deploy part 2 + empty/error states** - GitHub Actions CI, tagged auto-deploy, error UX. App live.
- [ ] **Phase 10: MP4 ladder rung 1 (server-side)** - BullMQ + Puppeteer + FFmpeg. 90s benchmark gate.
- [ ] **Phase 11: MP4 rung 2/3 OR mobile polish + a11y audit** - Branches on Phase 10 outcome.
- [ ] **Phase 12: Launch polish + resume copy** - Real device testing, OG image, tag v1.0.0, ship.

## Phase Details

### Phase 1: Reel engine prototype + gesture validation
**Goal**: Vite + React + TypeScript + MapLibre running a hardcoded 10-chapter reel with the full gesture state machine wired. Verify on real iPhone.
**Depends on**: Nothing (first phase)
**Requirements**: REEL-01, REEL-02, REEL-03
**Success Criteria** (what must be TRUE):
  1. ✓ 30-second test passes on a real iPhone (iOS 17+ Safari).
  2. ✓ All gesture transitions verified manually: pull-to-refresh disabled, back-edge-swipe not intercepted, 3-finger yields, `visibilitychange` suspends, `orientationchange` resumes.
  3. ✓ Reduced-motion fallback renders all 10 chapters in a static scroll list.
  4. ✓ Bottom-horizontal chapter rail with scrub cursor matches mockup.
**Plans**: 1 plan (executed iteratively in-session — formal split skipped because phase predates GSD adoption).
**Status**: ✓ Complete (commits 3d1adb0..1db86c9, 2026-04-23..2026-04-27)

Plans:
- [x] 01-01: Reel engine + gestures + 4 hotfixes for iPhone bugs + design polish (rail layout, zoom, overlay padding)

### Phase 2: Reel polish + perf budget
**Goal**: Reel feels production-grade. Cinematic city detail via MapTiler. Lighthouse 90 budget met. First tests cover the gesture state machine.
**Depends on**: Phase 1
**Requirements**: REEL-04, REEL-05, REEL-06, REEL-07, PERF-01, PERF-02, PERF-03, PERF-04, PERF-05
**Success Criteria** (what must be TRUE):
  1. MapTiler vector tiles render at zooms 12-13 with city-block detail.
  2. Initial JS bundle ≤ 250 KB gzipped (MapLibre dynamic-imported after LCP).
  3. Lighthouse mobile perf score ≥ 90 on public reel page.
  4. Photo overlays fade in offset-by-stagger; arrival pulse fires on land.
  5. flyTo curves tuned subjectively to feel cinematic — passes visual review.
  6. `StateBadge` dev affordance hidden in production builds.
  7. `stateMachine.ts` has Vitest unit tests covering every transition; pass on `bun test`.
**Plans**: 5 plans (TBD by `/gsd-plan-phase 2`)

Plans:
- [ ] 02-01: MapTiler swap (env var, style URL, restore zooms 12-13)
- [ ] 02-02: Dynamic-import MapCanvas + LCP poster image
- [ ] 02-03: Motion polish (Framer Motion 11 photo overlay choreography, flyTo curve tuning)
- [ ] 02-04: Vitest setup + stateMachine.ts unit tests
- [ ] 02-05: Gate StateBadge behind import.meta.env.DEV

### Phase 3: App shell
**Goal**: Multi-route shell with bottom nav, theme support, routing. Still no backend.
**Depends on**: Phase 2
**Requirements**: APP-01, APP-02, APP-03
**Success Criteria** (what must be TRUE):
  1. React Router v7 routes `/` (public reel) and `/app/*` (authenticated tree) and `/u/:handle` (public per-handle reel; backend stub OK).
  2. Bottom nav (Reel | Trips | Me) renders on `/app/*` only.
  3. Tailwind light + dark themes wired with system preference default.
  4. App still builds and ships at any commit on this phase.
**Plans**: 3 plans (TBD by `/gsd-plan-phase 3`)

Plans:
- [ ] 03-01: React Router v7 install + route structure
- [ ] 03-02: Bottom nav component + private/public route guards
- [ ] 03-03: Light/dark theme tokens + ThemeProvider

### Phase 4: Backend skeleton + Auth0 wiring
**Goal**: Hono API + Drizzle schema + Postgres in Docker locally, then Auth0 end-to-end with lazy user provisioning. **Split into two plans** because first-time backend + first-time auth in one weekend is too tight.
**Depends on**: Phase 3
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, DATA-01, DATA-02
**Success Criteria** (what must be TRUE):
  1. `bun run dev` starts Hono API on a separate port; `/health` returns 200.
  2. Drizzle schema migrations run cleanly; `users`, `cities`, `photos`, `notifications` tables created.
  3. Auth0 Universal Login redirects from frontend to Auth0 and back with valid JWT.
  4. JWT middleware validates against Auth0 JWKS; rejects expired/wrong-audience tokens.
  5. First authenticated `/api/me` call lazily creates a `users` row.
  6. `<Auth0Provider>` wraps `/app/*` tree only; public reel never triggers silent auth.
**Plans**: 2 plans

Plans:
- [ ] 04-01: Backend skeleton (Hono + Drizzle + migrations + health + Postgres in Docker, no auth)
- [ ] 04-02: Auth0 wiring (Universal Login, JWT middleware, lazy provisioning, handle picker UI)

### Phase 5: City CRUD + map picker
**Goal**: User can add, edit, reorder, delete cities via the authenticated `/app/trips` view. Reorder uses bulk transaction.
**Depends on**: Phase 4
**Requirements**: DATA-03, DATA-04, REEL-09
**Success Criteria** (what must be TRUE):
  1. Click on map → BigDataCloud reverse-geocodes (lat, lng) → form pre-fills city name.
  2. Save creates a `cities` row with `order_index = max(order_index) + 1`.
  3. Drag-reorder triggers `PATCH /api/cities/reorder` in a single transaction with the deferred-unique constraint.
  4. Trips view renders combined map (pins) + chronological list (cards).
  5. Adjacent identical-coordinate chapters collapse to one chapter group on the reel.
**Plans**: 3 plans (TBD)

Plans:
- [ ] 05-01: Map-pick UI + reverse-geocode
- [ ] 05-02: City form (create/edit/delete)
- [ ] 05-03: Reorder API + drag-and-drop UI

### Phase 6: Photo upload pipeline
**Goal**: User can upload photos for a city; HEIC converted, resized, EXIF stripped, stored to OCI Object Storage, served via public-read prefix.
**Depends on**: Phase 5
**Requirements**: DATA-05, DATA-06, DATA-07
**Success Criteria** (what must be TRUE):
  1. iPhone HEIC files are converted to JPEG client-side before upload.
  2. Photos resize to 2048px max longest-edge, EXIF stripped.
  3. Upload posts to OCI via PAR; thumbnail generated server-side.
  4. Per-city limit: 10 photos, 5 MB each enforced both client and server.
  5. Photo detail sheet opens on overlay tap and displays full-size with caption.
**Plans**: 3 plans (TBD)

Plans:
- [ ] 06-01: HEIC convert + resize + EXIF strip on client
- [ ] 06-02: OCI PAR upload + thumbnail pipeline
- [ ] 06-03: Photo detail sheet UI

### Phase 7: Public URLs + handle reservation
**Goal**: `/u/:handle` works unauthenticated; users without a handle pick one on first authenticated visit; reserved words blocked; uniqueness enforced.
**Depends on**: Phase 6
**Requirements**: AUTH-05, AUTH-06, AUTH-07, PUBLIC-01, PUBLIC-02, PUBLIC-03, PUBLIC-04, REEL-08
**Success Criteria** (what must be TRUE):
  1. `/u/bryan` renders Bryan's reel without authentication.
  2. Handle picker UI validates `[a-z0-9-]{3,20}`, lowercase, blocks `admin`/`api`/`app`/`u`/etc.
  3. 0-city reel shows world view + "No trips yet" caption.
  4. 1-city reel shows 8s orbit camera at zoom 14, pitch 60.
  5. Nginx caches public reel HTML keyed by handle.
**Plans**: 3 plans (TBD)

Plans:
- [ ] 07-01: Handle reservation flow + reserved-word list
- [ ] 07-02: Public reel route + 0/1-city empty states
- [ ] 07-03: Nginx public-reel cache config

### Phase 8: Deploy part 1
**Goal**: First public live domain. Manual deploy via SSH. OCI VM provisioned, Docker Compose stack running, TLS auto-renewing.
**Depends on**: Phase 7
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-05
**Success Criteria** (what must be TRUE):
  1. OCI Ampere A1 VM (≥ 2 OCPU, ≥ 8 GB) running Docker Compose with API + Postgres + Redis + Nginx.
  2. `https://timeline.bryanlam.dev` resolves with valid Let's Encrypt cert.
  3. `certbot renew --dry-run` succeeds.
  4. Manual `git pull && docker compose up -d --build` ships a new version.
**Plans**: 3 plans (TBD)

Plans:
- [ ] 08-01: OCI VM provisioning + Docker Compose stack
- [ ] 08-02: Nginx reverse proxy + Let's Encrypt
- [ ] 08-03: DNS cutover + smoke test

### Phase 9: Deploy part 2 + empty/error states
**Goal**: GitHub Actions CI builds + auto-deploys on tag. Empty/error states pass for all built surfaces. App is shippable without MP4.
**Depends on**: Phase 8
**Requirements**: DEPLOY-03, DEPLOY-04, DEPLOY-06, ERR-01, ERR-02, ERR-03, ERR-04
**Success Criteria** (what must be TRUE):
  1. `git tag v0.x.0 && git push --tags` triggers CI build, push to OCI Container Registry, deploy to VM.
  2. All empty/error states render correctly (0 cities, photo upload retry, MapTiler rate-limit fallback, MP4 fail card).
  3. Health endpoint, request logging, and error middleware are in place.
  4. App is launch-shippable at end of W9 even if MP4 is later cut.
**Plans**: 3 plans (TBD)

Plans:
- [ ] 09-01: GitHub Actions CI workflow
- [ ] 09-02: OCI Container Registry + auto-deploy hook
- [ ] 09-03: Empty/error state polish for all surfaces

### Phase 10: MP4 ladder rung 1 — server-side render
**Goal**: Build the BullMQ + Puppeteer + FFmpeg pipeline. Run the 300-frame benchmark. Decide ladder rung based on result.
**Depends on**: Phase 9
**Requirements**: MP4-01, MP4-02, MP4-03
**Success Criteria** (what must be TRUE):
  1. 300-frame benchmark renders in ≤ 90s wall-clock on the OCI Ampere A1 VM, OR is determined infeasible — explicit go/no-go.
  2. If pass: Concurrency=1, 5 renders / 24h rate limit, 5-min job timeout enforced.
  3. If pass: Notification polling UX wired (5s interval while active).
  4. If fail: drop to Phase 11 client path immediately. Do not invest more.
**Plans**: 2 plans (TBD)

Plans:
- [ ] 10-01: Puppeteer + MapLibre + FFmpeg pipeline + benchmark
- [ ] 10-02: BullMQ queue + rate limit + notification polling (only if benchmark passes)

### Phase 11: MP4 rung 2/3 OR mobile polish + a11y audit
**Goal**: Branches on Phase 10 outcome. Either ship MP4 export via client/GIF fallback, OR cut MP4 from v1 and use the weekend for mobile polish + axe-core audit.
**Depends on**: Phase 10
**Requirements**: MP4-04, MP4-05, MP4-06, A11Y-01..08
**Success Criteria** (what must be TRUE):
  - **Branch A** (Phase 10 server passed): Notification polish + rate limits + download flow shipped.
  - **Branch B** (Phase 10 server failed → try client `MediaRecorder`): iOS 17+ probe works; codec ladder avc1 → vp9 → vp8 picks first supported.
  - **Branch C** (Branches A+B both failed → 10s GIF): GIF export ships, document as fallback.
  - **Branch D** (all three failed): MP4 cut from v1, documented; weekend used for axe-core audit + iPhone SE / Pixel 7 / iPad real-device polish.
**Plans**: 2-3 plans (TBD, branch-dependent)

Plans:
- [ ] 11-01: (branch-dependent — chosen at start of phase)
- [ ] 11-02: A11y audit + mobile polish (always runs, even on Branches A-C as tail-end work)

### Phase 12: Launch polish + resume copy
**Goal**: Ship to `main`, tag `v1.0.0`. Real device testing. OG image. Recruiter FAQ. Portfolio link. LinkedIn post. First monitoring dashboard.
**Depends on**: Phase 11
**Requirements**: PUBLIC-05, PUBLIC-06
**Success Criteria** (what must be TRUE):
  1. Real-device QA passes on iPhone SE, Pixel 7, iPad — no regressions from Phase 1 acceptance.
  2. Server-rendered 1200×630 OG image renders for `/` and `/u/:handle`.
  3. Amber-pin SVG favicon ships.
  4. Recruiter-facing landing copy + FAQ + portfolio link in repo README.
  5. `git tag v1.0.0 && git push --tags` deploys to production.
  6. LinkedIn post drafted (not necessarily posted).
**Plans**: 3 plans (TBD)

Plans:
- [ ] 12-01: OG image renderer
- [ ] 12-02: Real-device QA pass + final polish
- [ ] 12-03: Launch artifacts (README, FAQ, LinkedIn draft, v1.0.0 tag)

## Slack

The original plan reserved W0 for an MP4 de-risk spike. That weekend is now distributed across W11–W12 as natural slack — polish and a11y audit have more breathing room if MP4 ships smoothly, and the cut-MP4 branch (D) absorbs an entire weekend if needed.

---
*Last updated: 2026-04-27 after import from docs/plan.md*
