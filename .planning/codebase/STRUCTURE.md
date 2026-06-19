# Codebase Structure

**Analysis Date:** 2026-06-19

**Phase context:** Phase 9 complete + live-verified (v0.2.4). All phases 1–9 + iPhone UAT round reflected below.

## Top-Level Directory Layout

```
timeline-revamp/
├── docs/                       # Snapshot copies of gstack planning artifacts (read-only mirrors)
│   ├── plan.md                 #   master implementation plan
│   └── test-plan.md            #   /qa input — affected pages, edge cases
├── .planning/                  # GSD durable planning (survives compaction)
│   ├── PROJECT.md              #   product framing, decisions table
│   ├── REQUIREMENTS.md         #   numbered requirements (REEL-*, AUTH-*, DATA-*, etc.)
│   ├── ROADMAP.md              #   12 phases + success criteria
│   ├── STATE.md                #   current state (bumped 2026-06-19 after UAT round)
│   ├── TODOS.md                #   tactical todos
│   ├── codebase/               #   THIS DIR — STACK / INTEGRATIONS / ARCHITECTURE / STRUCTURE / CONVENTIONS / TESTING / CONCERNS
│   └── phases/                 #   per-phase artifacts
│       ├── 02-reel-polish/
│       ├── 03-app-shell/
│       ├── 04-backend-auth0/
│       ├── 05-city-crud/
│       ├── 06-photo-upload-pipeline/
│       ├── 07-public-urls-handle/
│       ├── 08-deploy-part-1/
│       ├── 08.1-infra-terraform/
│       └── 09-deploy-part-2-empty-error-states/
│
├── src/                        # Frontend (Vite + React 19)
├── server/                     # Backend (Bun + Hono)
├── infra/                      # Terraform + cloud-init + DEPLOY.md
├── ops/                        # Nginx config
├── public/                     # Static assets (UAT v0.2.0 added seed-photos/)
├── test/                       # Test setup (jsdom polyfills)
├── scripts/                    # Dev orchestrator
├── .github/workflows/          # CI/CD
├── docker-compose.yml          # Postgres only (base; loopback bind)
├── docker-compose.prod.yml     # Adds api with image: + scp'd to VM by deploy.yml
├── Dockerfile                  # Multi-stage build (deps/build/runtime; uid 1001 app user)
├── package.json                # Bun-runs-everything; scripts: dev, dev:web, dev:server, build, test, test:watch, test:coverage, typecheck, db:generate, db:migrate
├── bun.lock                    # Committed lockfile
├── vite.config.ts              # Path alias @/ → src/, @server/ → server/ (narrow door for shared validator)
├── tailwind.config.ts          # Design tokens — amber palette, easings, motion durations, fonts
├── tsconfig{,.app,.node}.json  # Project references: app + node
├── drizzle.config.ts           # Drizzle Kit config for db:generate
├── DESIGN.md                   # Design contract — read before any UI change
├── CLAUDE.md                   # AI rules for this project
└── README.md
```

## `src/` — Frontend

```
src/
├── App.tsx                     # createBrowserRouter — five routes; `/`, `/u/:handle`, `/app/*`, `*`
├── main.tsx                    # ReactDOM.createRoot + StrictMode + maplibre-gl CSS hoist
├── index.css                   # Tailwind base + design tokens + `.scrim-*` + `.glass-pill` + `.app-reel-host`
├── vite-env.d.ts               # ImportMetaEnv typing for VITE_AUTH0_* + VITE_MAPTILER_KEY
│
├── routes/                     # React Router v7 route components
│   ├── AppLayout.tsx           #   /app/* parent — AuthProvider → RequireAuth → HandlePickerGate
│   ├── AppReelRoute.tsx        #   /app — wraps Reel in `.app-reel-host` (BottomNav z-index wrapper)
│   ├── AppReelRoute.test.tsx
│   ├── HandleReelRoute.tsx     #   /u/:handle — fetches /api/u/:handle/reel, branches Reel/Orbit/Globe
│   ├── HandleReelRoute.test.tsx
│   ├── MeRoute.tsx             #   /app/me — Auth0 avatar + name + email + Sign Out (Phase 8 commit 4aa9479)
│   ├── NotFoundHandleRoute.tsx #   /u/:handle 404 (when handle doesn't exist)
│   ├── NotFoundRoute.tsx       #   * — generic 404 with "Back to reel" link
│   ├── PublicReelRoute.tsx     #   / — SEEDED_CITIES, no auth, no fetch
│   ├── TripsRoute.tsx          #   /app/trips — MapPicker + CityList + draft/edit CityForm
│   └── TripsRoute.test.tsx
│
├── auth/                       # Auth0-aware
│   ├── AuthProvider.tsx        #   <Auth0Provider> mount; throws on missing VITE_AUTH0_* envs
│   ├── HandlePickerGate.tsx    #   Renders modal sibling when handle is null
│   ├── HandlePickerModal.tsx   #   Form + double-Esc anti-modal-trap workaround
│   ├── HandlePickerModal.test.tsx
│   ├── suggestHandle.ts        #   Derives suggestion from Auth0 user identity (per F8 follow-up)
│   └── useApi.ts               #   useApi() — fetch with Bearer attached
│
├── components/                 # Layout-level shared components
│   ├── BottomNav.tsx           #   Fixed h-16 nav for /app/*; Reel | Trips | Me; amber active tab
│   ├── CityForm.tsx            #   Create + edit; Zod-validated; date input timezone anchor
│   ├── CityList.tsx            #   @dnd-kit/sortable list; drag handle is separate <button>
│   ├── CityList.test.tsx
│   ├── MapFallbackBanner.tsx   #   Banner shown when MapTiler 429 → OSM raster swap (ERR-03)
│   ├── MapPicker.tsx           #   /app/trips map; click → reverse-geocode → CityForm
│   ├── PhotoDetailSheet.tsx    #   Bottom-sheet modal for a city's photos
│   ├── PhotoDetailSheet.test.tsx
│   ├── PhotoGrid.tsx           #   Thumbnail grid inside PhotoDetailSheet
│   ├── PhotoUploader.tsx       #   File picker → HEIC convert → resize → upload queue
│   ├── PhotoUploader.test.tsx
│   ├── PhotoViewer.tsx         #   Full-screen viewer with delete + nav (LOCKED in Phase 6)
│   ├── PhotoViewer.test.tsx
│   └── RequireAuth.tsx         #   Reads ?signup=1; forwards screen_hint to Auth0 (UAT v0.2.2)
│
├── reel/                       # The cinematic surface — single feature module
│   ├── Reel.tsx                #   ≥2-chapter reel: gesture machine + MapCanvas + ChapterOverlay + PhotoCycle + PlayPauseIndicator
│   ├── ReducedMotionReel.tsx   #   prefers-reduced-motion fallback — static scroll list of chapters
│   ├── ReducedMotionVariants.test.tsx
│   ├── OrbitReel.tsx           #   1-chapter orbit: 45°/s bearing rotation (useBearingOrbit)
│   ├── OrbitReel.test.tsx
│   ├── OrbitReducedMotionReel.tsx
│   ├── GlobeReel.tsx           #   0-chapter: MapLibre setProjection({type:'globe'}) + slow rotation
│   ├── GlobeReel.test.tsx
│   ├── GlobeReducedMotionReel.tsx
│   ├── MapCanvas.tsx           #   Lazy-loaded MapLibre canvas; flyTo with FLY_DURATION_MS/FLY_CURVE/easeCamera
│   ├── MapCanvas.fallback.test.ts
│   ├── MapPoster.tsx           #   LCP poster — dark radial gradient (no JPEG); Suspense fallback
│   ├── mapStyle.ts             #   STYLE_URL constant: MapTiler 'hybrid' (UAT) or demotiles fallback
│   ├── osmRasterStyle.ts       #   OSM raster fallback style for ERR-03
│   ├── motion.ts               #   FLY_DURATION_MS = 8000, FLY_CURVE = 2.2, easeCamera() (UAT v0.2.0 tuned)
│   ├── timing.ts               #   AUTOPLAY_DWELL_MS = 8000, CROSSFADE_MS = 200, MIN_CYCLE_INTERVAL_MS = 800 (UAT v0.2.0 tuned)
│   ├── timing.test.ts          #   Hermetic against AUTOPLAY_DWELL_MS tuning (UAT v0.2.0 rewrite)
│   ├── ChapterOverlay.tsx      #   Bottom-anchored city name + caption + photo stack
│   ├── ChapterRail.tsx         #   Horizontal scrub indicator at bottom
│   ├── PhotoCycle.tsx          #   Cross-fade rotating photos within a chapter
│   ├── PhotoCycle.test.tsx     #   Pins dwellMs explicitly (UAT v0.2.0 hermetic fix)
│   ├── chaptersWithPhotos.ts   #   Joins ChapterGroup + photos
│   ├── chaptersWithPhotos.test.ts
│   ├── groupChapters.ts        #   Collapse adjacent same-coord cities → ChapterGroup
│   ├── groupChapters.test.ts
│   ├── CTAPill.tsx             #   "Make your own" — links to /app?signup=1 (UAT v0.2.2)
│   ├── PlayPauseIndicator.tsx  #   UAT v0.2.0 ADDITION — transient + persistent toggle UI
│   ├── PlayPauseIndicator.test.tsx
│   ├── StateBadge.tsx          #   DEV-only state debugger (gated on import.meta.env.DEV)
│   ├── useBearingOrbit.ts      #   Hook driving OrbitReel's 45°/s rotation
│   ├── useBearingOrbit.test.ts
│   └── usePrefersReducedMotion.ts
│
├── gestures/                   # Reel input layer
│   ├── stateMachine.ts         #   PURE — transitions; UAT v0.2.0 relaxed flick-from-CHAPTER_SWIPE for mid-flight retarget
│   ├── stateMachine.test.ts    #   +3 new tests for mid-flight retarget (UAT v0.2.0)
│   └── useGestureMachine.ts    #   EFFECTFUL — UAT v0.2.0 split timer effects so pointerCount doesn't reset fly-done
│
├── data/                       # Data shaping
│   ├── seeded-cities.ts        #   9-city HK→SF itinerary (UAT v0.2.0); PhotoCard-based with /seed-photos/<city>/1.jpg URLs
│   ├── cityToChapter.ts        #   CityDTO → CityChapter mapping
│   └── cityToChapter.test.ts
│
├── api/                        # Typed fetch clients
│   ├── cities.ts
│   ├── photos.ts
│   ├── photos.test.ts
│   ├── handlesCheck.ts
│   ├── handlesCheck.test.ts
│   ├── publicReel.ts
│   └── publicReel.test.ts
│
├── hooks/                      # Custom hooks
│   ├── useAllPhotos.ts
│   ├── useAllPhotos.test.ts
│   ├── usePhotosQuery.ts
│   └── usePhotosQuery.test.ts
│
├── photos/                     # Client-side photo pipeline
│   ├── heicToJpeg.ts           #   Lazy heic-to wasm
│   ├── heicToJpeg.test.ts
│   ├── canvasResize.ts         #   Canvas → JPEG blob with max-dim 2048
│   ├── canvasResize.test.ts
│   ├── retry.ts                #   Exponential backoff helper
│   ├── retry.test.ts
│   ├── uploadQueue.ts          #   p-limit (ESM-only) + per-photo retry
│   └── uploadQueue.test.ts
│
├── geocode/                    # Client-side reverse-geocode
│   └── bigdatacloud.ts         #   Fetches BigDataCloud API; CI-enforced server-side via __no-bigdatacloud.test.ts
│
├── motion/                     # Framer Motion variants (shared)
│   └── variants.ts             #   Stagger containers + arrival pulse variants
│
└── types/                      # Shared types
    ├── city.ts                 #   CityDTO
    └── reel.ts                 #   CityChapter, ReelStateName, PhotoSeed, PhotoCard, ReelPhoto, isPhotoCard
```

## `server/` — Backend

```
server/
├── index.ts                    # Hono app — middleware order: requestId → logger → CORS → routes
├── env.ts                      # Zod-parsed env; module-load process.exit on missing (CI stub required)
│
├── auth/
│   ├── jwt.ts                  #   requireJwt — jose + JWKS RS256; __setJwksGetterForTest hook
│   ├── jwt.test.ts
│   ├── lazyProvision.ts        #   lazyProvisionUser — INSERT users on first JWT; sets c.var.user
│   ├── context.ts              #   Hono ContextVariableMap augmentation (side-effect import)
│   └── __no-bigdatacloud.test.ts  # Meta-test: forbid "bigdatacloud" string in server/**/*.ts
│
├── routes/
│   ├── health.ts               #   GET /api/health → {status,db}
│   ├── health.test.ts
│   ├── handlesCheck.ts         #   GET /api/handles/check?handle=... → {state}
│   ├── handlesCheck.test.ts
│   ├── publicReel.ts           #   GET /api/u/:handle/reel — public, case-insensitive LOWER() lookup
│   ├── publicReel.test.ts
│   ├── me.ts                   #   GET /api/me, POST /api/me/handle (claim)
│   ├── cities.ts               #   GET / POST / PATCH / DELETE / PATCH /reorder (deferrable txn)
│   ├── cities.test.ts          #   945 lines — flagged for split (CONCERNS.md)
│   ├── photos.ts               #   nested router /api/cities/:cityId/photos + flat /api/photos/:id{/finalize}
│   └── photos.test.ts
│
├── db/
│   ├── client.ts               #   pg.Pool + drizzle()
│   ├── schema.ts               #   users, cities, photos; DATA-02 OWNERSHIP NOTICE for the deferrable unique
│   ├── pgError.ts              #   pgErrorCode(err) — unwraps DrizzleQueryError.cause.code
│   ├── migrate.ts              #   bun run server/db/migrate.ts (CI + prod deploy)
│   └── migrations/             #   0000_* drizzle-generated; 0001_cities_deferrable_unique.sql hand-authored
│
├── oci/
│   ├── parClient.ts            #   PEM-based signer; getOciClient() singleton; sniffImageMime
│   └── parClient.test.ts
│
├── validation/
│   ├── cityInput.ts            #   Zod schemas for city create/update/reorder
│   └── photoInput.ts           #   Zod schemas for photo upload-url + finalize
│
├── handles/
│   ├── validate.ts             #   Shared with frontend via @server alias — validateHandle()
│   └── reservedWords.ts        #   26 reserved handles
│
├── index.error.test.ts         # Server top-level error handler tests
└── index.requestId.test.ts     # Request-ID propagation tests
```

## `infra/` and `ops/`

```
infra/
├── DEPLOY.md                   # Operator runbook (Post-Provision SCP block; needs chmod 711 .oci/ added — F1 follow-up)
├── cloud-init.yaml             # VM bootstrap (4 known bugs — Phase 8 F1)
└── terraform/
    ├── main.tf
    ├── compute.tf              # OCI Ampere A1 VM (2 OCPU / 8GB)
    ├── storage.tf              # Bucket with access_type = "ObjectRead" (Phase 8 F5 Path A; Path B = future)
    ├── iam.tf
    ├── oidc.tf                 # GHA OIDC trust (provider version pin landmine — memory)
    └── variables.tf

ops/
└── nginx/
    └── timeline.conf           # Reverse proxy; public_reel cache; proxy_pass for /assets and SPA shell
```

## `public/` — Static assets

```
public/
└── seed-photos/                # UAT v0.2.0 ADDITION — 9 vertical CC0 Unsplash photos
    ├── hong-kong/1.jpg
    ├── taipei/1.jpg
    ├── okinawa/1.jpg
    ├── osaka/1.jpg
    ├── bangkok/1.jpg
    ├── singapore/1.jpg
    ├── melbourne/1.jpg
    ├── london/1.jpg
    └── san-francisco/1.jpg
```

Served at `/seed-photos/<city>/1.jpg` by Vite dev + Hono `serveStatic` prod.

## `.github/workflows/`

```
.github/workflows/
├── deploy.yml                  # Tag-driven CI/CD — verify + build-and-push + deploy
│                               # UAT v0.2.1 ADDED: scp compose files to VM
│                               # UAT v0.2.4 BUMPED: Node 24 majors (actions/checkout@v5, docker/* @v4/@v7)
└── terraform.yml.deferred      # Phase 8.1 Terraform workflow — deferred per OIDC trust gap
```

## Build & Path-Alias Conventions

- **`@/` → `src/`** — frontend imports use `@/components/...`, `@/reel/...`, etc. (`vite.config.ts:23`).
- **`@server/` → `server/`** — narrow door from frontend to server for SHARED handle validator + reserved-words list ONLY (`vite.config.ts:24`). Frontend MUST NOT import anything else from `server/` — DB code + auth middleware would either compile-error (Node-only) or leak server contracts.
- **`paths` in tsconfig** mirrors the Vite aliases.
- **`paths-ignore`** in `.github/workflows/deploy.yml` excludes `infra/terraform/**`, `docs/**`, `.planning/**` from triggering CI.

## Naming Conventions

- **Routes:** `*Route.tsx` (e.g., `TripsRoute.tsx`). `AppLayout.tsx` is the only non-`Route`-suffixed top-level route component.
- **Components:** PascalCase TSX files in `src/components/` and `src/reel/`.
- **Hooks:** `use*.ts` in `src/hooks/`.
- **State machines:** `*Machine.ts` pure, `use*Machine.ts` effectful wrapper.
- **Tests:** co-located, same basename + `.test.{ts,tsx}`.
- **Meta-tests:** `__*.test.ts` double-underscore prefix (project invariants).
- **Hand-authored SQL migrations:** numbered with a description: `0001_cities_deferrable_unique.sql`.
- **Phase plans:** `.planning/phases/NN-name/NN-MM-PLAN.md`, paired `*-SUMMARY.md`, plus `*-CONTEXT.md`, `*-RESEARCH.md`, `*-VERIFICATION.md`.

## Generated / Committed Artifacts

- **`bun.lock`** — committed.
- **`dist/`** — gitignored. Built by `bun run build` (CI) or `vite build` (dev).
- **`node_modules/`** — gitignored.
- **`.env`** / **`.env.*`** — gitignored (Phase 8 F7 hardening). `.env.example` whitelisted.
- **`.oci/`** + **`*.pem`** — gitignored (Phase 8 F7 hardening).
- **`.dev/certs/`** — gitignored; mkcert local CA for iPhone HTTPS dev (memory: `feedback_auth0_https_iphone_dev.md`).
- **`drizzle/`** — Drizzle Kit metadata (`_meta`, `meta/`) committed for migration history.

## Files NOT to Edit Without Context

- **`DESIGN.md`** — design contract. Update DESIGN.md atomically with any change to motion/color/spacing tokens.
- **`server/db/schema.ts`** — DATA-02 OWNERSHIP NOTICE at top: do NOT add `uniqueIndex` for the deferrable constraint; it's in `0001_cities_deferrable_unique.sql`.
- **`server/db/migrations/0001_cities_deferrable_unique.sql`** — hand-authored; reorder transaction depends on it.
- **`docker-compose.prod.yml`** — UAT v0.2.1 set `image:` directive; required for the deploy to actually pull from OCIR.
- **`.github/workflows/deploy.yml`** — multiple memory-recorded gotchas: GHA secrets read at job-start, tag-match guard, scp step (UAT v0.2.1), Node 24 majors (UAT v0.2.4).
- **`server/env.ts`** — module-load `process.exit(1)` on missing env; CI must stub `AUTH0_DOMAIN`/`AUTH0_AUDIENCE` (memory: `feedback_module_load_env_validation_blocks_ci.md`).

## What's NOT in the Codebase (Yet)

- **No `src/utils/`** — `formatArrived` is duplicated in `CityList.tsx` + `ChapterOverlay.tsx` (CONCERNS.md hygiene item).
- **No `<ReelView />` abstraction** — selection logic duplicated across the 3 reel routes (CONCERNS.md refactor candidate).
- **No formal a11y test layer** — Phase 11 scope.
- **No Phase 10 MP4 worker** (BullMQ + Puppeteer + FFmpeg) — on hold by user choice.
- **No Instance Principal auth for OCI** — PEM is still in the container (Phase 8 F8 follow-up, deferred).
