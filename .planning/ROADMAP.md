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
- [x] **Phase 6: Photo upload pipeline** - HEIC convert, resize, EXIF strip, OCI PAR upload, thumbnails. (4 plans; +95 tests, 140→235; first parallel-agent wave; OCI CORS via S3-compat landmine documented)
- [x] **Phase 7: Public URLs + handle reservation** - `/u/:handle` unauthenticated reel, handle picker, Nginx cache. (3 plans; +58 tests, 289→347 across the phase; double-Esc anti-modal-trap landmine fixed in UAT; 3 mobile UAT items defer to post-Phase-8)
- [x] **Phase 8: Deploy part 1** - OCI VM setup, Docker Compose, Nginx + Let's Encrypt, DNS cutover. (3 plans + 8.1 inserted; live at https://timeline.bryanlam.dev on 2026-05-30; 8 findings F1–F8 captured for follow-up)
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
**Plans**: 4 plans (planned 2026-05-12)

Plans:

**Wave 1**
- [x] 06-01: HEIC convert + resize + EXIF strip on client
- [x] 06-02: OCI PAR upload + thumbnail pipeline (server, sharp on Bun)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 06-03: Photo detail sheet UI + multi-select uploader + full-screen viewer + per-photo delete

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 06-04: REEL-09 photo cycling on /app/ reel

**Cross-cutting constraints:**
- Single amber accent (DESIGN.md) — pins, focus rings, progress bars, CTAs
- StrictMode-safe `mountedRef` pattern in every component with async work (memory: feedback_mountedref_strictmode.md)
- `pgErrorCode(err)` helper in every server-side catch (Drizzle wraps pg errors)
- Hono route ordering: literal routes before parameterized routes (regression test mirror from cities.ts /reorder)
- `prefers-reduced-motion` honored in any cycling/transition (PhotoCycle, PhotoViewer)
- Server-side MIME byte-sniff at finalize (no trust in client-declared contentType)

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
**Plans**: 3 plans (planned 2026-05-14)

Plans:

**Wave 1**
- [x] 07-01-PLAN.md — Handle reservation flow: GET /api/handles/check + HandlePickerModal upgrade (native dialog + live debounced check + URL preview) [AUTH-05/06/07] (completed 2026-05-15; double-Esc anti-modal-trap fix in 216a0cd)

**Wave 2** *(depends on 07-01 for server/index.ts mount-block coordination)*
- [x] 07-02-PLAN.md — Public reel: GET /api/public/u/:handle + usePublicReel + HandleReelRoute rewrite + OrbitReel (1-city 45°/s orbit) + GlobeReel (0-city slow globe) + reduced-motion variants + NotFoundHandleRoute [PUBLIC-01/02/03, REEL-08] (completed 2026-05-15)

**Wave 3** *(depends on 07-02 for app-layer Cache-Control header contract)*
- [x] 07-03-PLAN.md — ops/nginx/timeline.conf: proxy_cache_path zone + /api/public/u/[^/]+$ + /u/[^/]+$ location blocks + TTL 5m/1m + X-Cache-Status + X-No-Cache bypass (file committed; Phase 8 wires) [PUBLIC-04] (completed 2026-05-15)

### Phase 8: Deploy part 1
**Goal**: First public live domain. Manual deploy via SSH. OCI VM provisioned, Docker Compose stack running, TLS auto-renewing.
**Depends on**: Phase 7
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-05
**Success Criteria** (what must be TRUE):
  1. OCI Ampere A1 VM (≥ 2 OCPU, ≥ 8 GB) running Docker Compose with API + Postgres + Nginx (Redis deferred to Phase 10 per 08-CONTEXT D-08).
  2. `https://timeline.bryanlam.dev` resolves with valid Let's Encrypt cert.
  3. `certbot renew --dry-run` succeeds.
  4. Manual `git pull && docker compose up -d --build` ships a new version.
**Plans**: 3 plans (TBD)

Plans:
- [x] 08-01: OCI VM provisioning + Docker Compose stack
- [x] 08-02: Nginx reverse proxy + Let's Encrypt
- [x] 08-03: DNS cutover + smoke test (completed 2026-05-30; 10-gate smoke 9 pass + 1 partial; 8 findings F1-F8 captured in 08-03-SUMMARY.md)

### Phase 08.1: infra-terraform (INSERTED)

**Goal:** Replace manual Phase 8 OCI provisioning with Terraform-managed IaC. Full OCI footprint (VCN + Ampere A1 4/24/100 VM + Reserved Public IP + photos bucket + IAM Instance Principal) declared in `infra/terraform/`; cloud-init absorbs `infra/setup.sh` line-by-line; GHA OIDC workflow handles plan-on-PR, apply-on-main with manual approval, and weekly drift detection. Pre-cuts the Phase 8 Wave 3 DNS flip so it targets a TF-provisioned VM.
**Requirements**: DEPLOY-01 (re-scoped from Phase 8 manual to 8.1 TF), DEPLOY-03 (partial — TF-infrastructure CI; app-code CI remains Phase 9), DEPLOY-07 (NEW candidate — infrastructure reproducible via `terraform apply`; no clickops)
**Depends on:** Phase 8 (paused at Wave 3 DNS cutover; 8.1 lands fully before Wave 3 resumes)
**Plans:** 3/3 plans complete

Plans:

**Wave 1**
- [x] 08.1-01-PLAN.md — TF stack scaffolding (versions/providers/backend/variables/main/network/compute/cloud-init) + reserved public IP + cloud-init.yaml absorbing setup.sh + DEPLOY.md Bootstrap + Terraform Provisioning sections + delete infra/setup.sh [DEPLOY-01, DEPLOY-07]

**Wave 2** *(depends on 08.1-01 for the instance OCID consumed by dynamic group matching_rule)*
- [x] 08.1-02-PLAN.md — storage.tf (photos bucket + CORS via null_resource/aws s3api S3-compat — provider has NO native cors_rules) + iam.tf (dynamic group scoped to instance.id; policy scoped to target.bucket.name='timeline-photos') + outputs.tf bucket_name + namespace [DEPLOY-01, DEPLOY-07]

**Wave 3** *(depends on 08.1-02 for storage/iam resources that PR plan + apply workflows plan against)*
- [x] 08.1-03-PLAN.md — iam.tf extension (Identity Domain data + 2 Service Users + Identity Propagation Trust with 2 OIDC subject rules + scoped policies for write/PR-read) + .github/workflows/terraform.yml (3 triggers, environment: production manual gate, weekly drift cron with idempotent issue creation) [DEPLOY-03, DEPLOY-07]

### Phase 9: Deploy part 2 + empty/error states
**Goal**: GitHub Actions CI builds + auto-deploys on tag. Empty/error states pass for all built surfaces. App is shippable without MP4.
**Depends on**: Phase 8
**Requirements**: DEPLOY-03, DEPLOY-04, DEPLOY-06, ERR-01, ERR-02, ERR-03, ERR-04
**Success Criteria** (what must be TRUE):
  1. `git tag v0.x.0 && git push --tags` triggers CI build, push to OCI Container Registry, deploy to VM.
  2. All empty/error states render correctly (0 cities, photo upload retry, MapTiler rate-limit fallback, MP4 fail card).
  3. Health endpoint, request logging, and error middleware are in place.
  4. App is launch-shippable at end of W9 even if MP4 is later cut.
**Plans**: 3 plans (planned 2026-06-01)

Plans:

**Wave 1** *(parallel — disjoint file trees)*
- [x] 09-01-PLAN.md — Tag-driven CI/CD: .github/workflows/deploy.yml (verify + arm64 buildx + appleboy ssh-action) + docker-compose.prod.yml image-pin + infra/DEPLOY.md ## CI/CD section [DEPLOY-03, DEPLOY-04]
- [x] 09-02-PLAN.md — Production middleware + pre-CI infra cleanup: server/index.ts (hono/request-id + app.onError) + server/auth/jwt.ts (F9 namespaced email claim w/ fallback) + infra/cloud-init.yaml (F1.1 dhparam + options-ssl-nginx.conf pre-create) + 2 new test files + 1 extended test file [DEPLOY-06]

**Wave 2** *(depends on 09-02 for server error contract used in retry UI)*
- [x] 09-03-PLAN.md — Error/empty state UX: src/photos/retry.ts (NEW [2000,4000,8000] backoff + classifier) + uploadQueue.ts retry loop + PhotoUploader retrying tile + src/reel/osmRasterStyle.ts (NEW) + MapCanvas 429 fallback + MapFallbackBanner (NEW amber border banner) + AppReelRoute empty card copy edit + TripsRoute bottom-overlay card replacing glass-pill + 5 new test files [ERR-01, ERR-03, ERR-04]

*ERR-02 deferred to Phase 10 per CONTEXT D-X (no Redis/BullMQ + MP4 render lifecycle yet — Phase 10 ships).*

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
**Plans**: 3 plans (Branch D selected — MP4 cut from v1; mobile polish + a11y audit)

Plans:
- [ ] 11-01-PLAN.md — A11y infrastructure (axe-core + Playwright + Lighthouse install), reduced-motion landmark fixes, aria-live arrival alignment, PhotoDetailSheet+PhotoViewer native <dialog> conversion + close-watcher anti-modal-trap [A11Y-01, A11Y-03, A11Y-04, A11Y-05, A11Y-06, A11Y-07]
- [ ] 11-02-PLAN.md — Keyboard handlers (Enter→OPEN_DETAIL) + REQUIREMENTS.md A11Y-08 edit + F8 suggestHandle tests + dev-only useFrameRate hook + FpsBadge (tree-shake guarded) + Lighthouse v1.0.0 mobile baseline [A11Y-02, A11Y-08]
- [ ] 11-03-PLAN.md — Playwright iPhone visual-review matrix (5 routes × 2 themes) + INDEX.md verdicts + MP4-04/05/06 cut documentation + 11-SUMMARY.md phase rollup [MP4-04, MP4-05, MP4-06]

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
