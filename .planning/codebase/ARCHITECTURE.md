# Architecture

**Analysis Date:** 2026-06-19

**Phase context:** Phase 9 complete + live-verified. v0.2.4 deployed via tag-driven GHA CI/CD. iPhone UAT round closed at v0.2.4; Phase 11 (mobile polish + a11y branch) is next.

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                  Browser (Vite + React 19 + StrictMode)                  │
│                                                                          │
│   src/main.tsx ─► src/App.tsx (createBrowserRouter)                      │
│                       │                                                  │
│      ┌────────────────┼─────────────────┬──────────────┐                 │
│      ▼                ▼                 ▼              ▼                 │
│  PublicReelRoute  HandleReelRoute   AppLayout      NotFoundRoute         │
│   `/`             `/u/:handle`      `/app/*`        `*`                  │
│   (no auth,       (no auth,          AuthProvider                        │
│    SEEDED reel)    fetch /api/u/...   └► RequireAuth                     │
│                    Reel/Orbit/Globe       └► HandlePickerGate            │
│                    selector)                  └► Outlet + BottomNav      │
│                                                  ▲                       │
│                                                  │ /app/, trips, me      │
└──────────────────────────────────────────────────┼───────────────────────┘
                                                   │
                  Bearer ${access_token}           │       Auth0 Universal
                  ──────────────────────► /api/*  ◄── Login + JWKS (per-app
                  (Vite dev proxy → :8787)         │   client_id + Action
                  (prod: nginx → :8787)            │   gated by client_id)
                                                   │
┌──────────────────────────────────────────────────┴───────────────────────┐
│                    Hono API (Bun in prod, tsx in dev)                    │
│                                                                          │
│  server/index.ts                                                         │
│    GET  /api/health                  (PUBLIC)                            │
│    GET  /api/handles/check           (PUBLIC, no-store)                  │
│    GET  /api/u/:handle/reel          (PUBLIC, cached @ Nginx)            │
│    USE  /api/me{,/*}    ── requireJwt → lazyProvisionUser ── meRouter    │
│    USE  /api/cities{,/*}                                  ── citiesRouter│
│    USE  /api/cities/:cityId/photos{/*}             ── photosNestedRouter │
│    USE  /api/photos/:id{/finalize}                       ── photosRouter │
│    SERVE dist/ (Hono serveStatic) ─ SPA shell for all non-/api routes    │
└──────────────────────────────────────────────────┬───────────────────────┘
                                                   │
                                                   ▼ pg.Pool (port 5432)
┌─────────────────────────────────────────────────────────────────────────┐
│             Postgres 16 (compose service `postgres`, loopback only)      │
│   users / cities / photos                                                │
│   cities (user_id, order_index) UNIQUE DEFERRABLE INITIALLY DEFERRED     │
│       (hand-authored migration 0001_cities_deferrable_unique.sql)        │
└─────────────────────────────────────────────────────────────────────────┘

                  OCI Object Storage (Pre-Authenticated Requests)
                   ───────────────────────────────────────────
                  PUT master via 5-min write PAR (client direct)
                  GET master via bucket ObjectRead (server reads
                       for sharp thumbnail; client renders <img>)
```

## Architectural Seams

The codebase has **five load-bearing architectural seams**. Violating any of them creates problems that are silent at compile time but loud at runtime.

### Seam 1: AUTH-04 — public reel must not import Auth0 SDK

`Auth0Provider` is mounted **only inside `src/routes/AppLayout.tsx`**. The public reel routes (`/`, `/u/:handle`, `*`) must NOT import `@auth0/auth0-react`. This serves two purposes:

1. **LCP / bundle size.** The `@auth0/auth0-react` chunk is heavy; deferring it to the `/app` lazy chunk keeps the public LCP fast.
2. **Silent-auth traffic isolation.** Public visitors get zero Auth0 silent-auth requests on first visit.

**Enforcement:** grep-based meta-test pattern (mirrors `server/auth/__no-bigdatacloud.test.ts`). Type system does not enforce it.

**Consequence for CTAs on the public surface** (UAT v0.2.2 fix): CTAs that want to trigger Auth0 (e.g., the "Make your own" button in `src/reel/CTAPill.tsx`) cannot call `loginWithRedirect()` directly. They navigate to `/app?signup=1` instead, and `src/components/RequireAuth.tsx:23-34` reads the query param and passes `screen_hint: 'signup'` to `loginWithRedirect`.

### Seam 2: Pure gesture state machine + effectful React hook split

`src/gestures/stateMachine.ts` is a **pure function**: no DOM, no timers, no React, no side effects. Every transition returns a new `ReelState` object (immutable). Tests can drive it with synthetic events.

`src/gestures/useGestureMachine.ts` owns ALL the side effects: pointer event binding, long-press timers, fly-done timers, auto-play tick, page lifecycle listeners (`visibilitychange`, `orientationchange`, keyboard).

**UAT v0.2.0 split** corrected a bug where the fly-done timer's `useEffect` included `state.pointerCount` in its deps. A finger touching the screen mid-flight re-ran the effect → cleared the in-flight timer → scheduled a fresh full-duration timer → flight felt "hung." Split into two effects:
- Fly-done timer: deps `[state.name, state.chapterIndex, dispatch]` (no `pointerCount`)
- MAP_INTERACT idle timer: deps `[state.name, state.pointerCount, dispatch]` (needs `pointerCount`)

Plus: `transition()` POINTER_UP handler relaxed to accept flicks during `CHAPTER_SWIPE` (in addition to `IDLE`/`PAUSED`), enabling TikTok-style mid-flight retarget. MapLibre's `flyTo` is interruptible, so the camera smoothly redirects.

### Seam 3: Reel rendering branches by route + by reduced-motion + by chapter count

Each route picks a reel variant based on two signals:

- **`usePrefersReducedMotion()`** — system setting
- **`chapters.length`** — 0 (globe), 1 (orbit), N≥2 (multi-chapter reel)

| Chapter count | Motion | Component |
|---|---|---|
| 0 | full | `GlobeReel` (slow rotation, MapLibre `setProjection({type:'globe'})`) |
| 0 | reduced | `GlobeReducedMotionReel` |
| 1 | full | `OrbitReel` (45°/s bearing orbit; `useBearingOrbit` hook) |
| 1 | reduced | `OrbitReducedMotionReel` |
| ≥2 | full | `Reel` (gesture machine + chapter flight + PhotoCycle + PlayPauseIndicator) |
| ≥2 | reduced | `ReducedMotionReel` (static scroll list of chapters) |

**Selection logic is duplicated** across `PublicReelRoute`, `HandleReelRoute`, `AppReelRoute`. Refactor candidate: `<ReelView />` (logged in CONCERNS.md).

### Seam 4: Photo pipeline (client side first, server PAR mint, finalize via sharp)

```text
[client]                                       [server]                       [OCI]
File pick ─► HEIC convert (lazy heic-to)        │                              │
        ─► canvas resize (max 2048px)           │                              │
        ─► uploadQueue (p-limit, retry, jitter) │                              │
                                                │                              │
        POST /api/cities/:id/photos/upload-url ─► requireJwt                   │
                                                  + ownership                  │
                                                  + count cap (10)             │
                                                  + Zod content-type           │
                                                  ─► db.transaction:           │
                                                       INSERT photo            │
                                                       UPDATE masterKey        │
                                                  ─► OCI: createWritePar       │
                                                  ◄─ {photoId, uploadUrl}      │
        ◄────────────────────────────────────────                              │
        PUT bytes to uploadUrl ─────────────────────────────────────────────► (5min PAR)
                                                                                │
        POST /api/photos/:id/finalize ──────────► getMasterBuffer (HTTP GET)   │
                                                  ◄────────────────────────── (ObjectRead)
                                                  ─► sniffImageMime (magic)    │
                                                  ─► sharp 400px thumb         │
                                                  ─► putObject thumb           │
                                                  ─► status='ready'            │
        ◄─ {id, masterUrl, thumbUrl}                                            │
```

**Status states:** `pending` → `ready` (success) | `failed` (any pipeline error after upload-url mint). Failed photos do NOT count toward the 10-per-city cap.

**Idempotency:** `/finalize` returns 409 `already_finalized` if status is already `ready`, 409 `photo_failed` if `failed`. Safe to retry from the client.

**Security note:** Server NEVER trusts the client-declared `contentType`. The first 8 bytes of the master object are sniffed against JPEG / PNG magic bytes in `sniffImageMime`. Mismatched bytes → photo marked `failed`.

### Seam 5: Motion + timing constants as single source of truth

`src/reel/motion.ts` and `src/reel/timing.ts` own ALL reel motion numbers. No other file in the codebase should hardcode `8000`, `200`, `1000`, etc. — read from the exported constants.

`stateMachine.ts:66` re-exports `FLY_DURATION_MS` from `motion.ts` so the gesture state machine's `CHAPTER_FLY_DONE` timer stays in lockstep with MapLibre's actual `flyTo` duration. UAT v0.2.0 tuning bumped `FLY_DURATION_MS` 2400 → 8000 and `AUTOPLAY_DWELL_MS` 4500 → 8000; the **invariant** `AUTOPLAY_DWELL_MS >= FLY_DURATION_MS` must hold (else autoplay advances mid-fly).

## Layers

### Layer 1 — UI surface (`src/reel/`, `src/components/`, `src/routes/`)

Tailwind + Framer Motion + design tokens from `src/index.css`. DESIGN.md is the canonical design contract; the runtime is downstream.

Notable subsystems:
- **`src/reel/`** — the cinematic surface. `Reel.tsx`, `MapCanvas.tsx`, `ChapterOverlay.tsx`, `ChapterRail.tsx`, `PhotoCycle.tsx`, `PlayPauseIndicator.tsx` (UAT v0.2.0 addition), `CTAPill.tsx`, `StateBadge.tsx` (dev-only).
- **`src/components/`** — the `/app` editor surface: `CityForm.tsx`, `CityList.tsx`, `MapPicker.tsx`, `PhotoDetailSheet.tsx`, `PhotoGrid.tsx`, `PhotoUploader.tsx`, `PhotoViewer.tsx`, `RequireAuth.tsx`, `BottomNav.tsx`, `MapFallbackBanner.tsx`.

### Layer 2 — Auth (`src/auth/`)

- `AuthProvider.tsx` — wraps `<Auth0Provider>` with project-specific redirect handling + reads `VITE_AUTH0_*` env. Mounted only inside `AppLayout`.
- `RequireAuth.tsx` (in `src/components/`) — gates `/app/*` behind `isAuthenticated`. Reads `?signup=1` to forward `screen_hint`.
- `HandlePickerGate.tsx` / `HandlePickerModal.tsx` — runs `/api/me` on mount, opens the modal if handle is null. Modal uses native `<dialog>` + double-Esc anti-modal-trap workaround (memory: `feedback_dialog_double_esc.md`).
- `useApi.ts` — Bearer-token-attaching `fetch` wrapper.
- `suggestHandle.ts` — derives a handle suggestion from Auth0 user identity.

### Layer 3 — Data fetching (`src/api/`, `src/hooks/`)

- `src/api/` — typed fetch functions for cities, photos, handles, public reel.
- `src/hooks/` — `useAllPhotos.ts`, `usePhotosQuery.ts`, hook-shaped state owners.

### Layer 4 — Reel data shaping (`src/data/`, `src/reel/groupChapters.ts`, `src/reel/chaptersWithPhotos.ts`)

- `cityToChapter.ts` — maps `CityDTO` → `CityChapter` (with default zoom/pitch/bearing if not stored).
- `seeded-cities.ts` — hardcoded 9-city reel for public surface (UAT v0.2.0).
- `groupChapters.ts` — collapses adjacent cities at byte-equal `(lat, lng)` into a `ChapterGroup`.
- `chaptersWithPhotos.ts` — joins chapters with photo cards.

### Layer 5 — Backend (`server/`)

- `server/index.ts` — Hono app, middleware order, route mounting, error handler.
- `server/auth/` — JWT validation (`jose` + JWKS), lazy user provisioning, context augmentation.
- `server/routes/` — handler modules. Public: `health`, `handlesCheck`, `publicReel`. Authenticated: `me`, `cities`, `photos`.
- `server/db/` — Drizzle client, schema, hand-authored `0001_cities_deferrable_unique.sql`, `pgErrorCode` helper.
- `server/oci/` — `parClient.ts` (PEM-based signer, `createWritePar`, `getPublicUrl`, `getMasterBuffer`), `sniffImageMime`.
- `server/validation/` — Zod schemas for city + photo inputs.
- `server/handles/` — handle validator + reserved-words list (26 entries).
- `server/env.ts` — Zod-parsed env with module-load `process.exit(1)` on failure (memory: `feedback_module_load_env_validation_blocks_ci.md`).

### Layer 6 — Infra & deploy (`infra/`, `ops/`, `docker-compose*.yml`, `Dockerfile`, `.github/workflows/`)

- `Dockerfile` — multi-stage: deps → build (Vite `dist/` + server transpile) → runtime (Bun, uid 1001 `app` user).
- `docker-compose.yml` — `postgres` service only (loopback bind).
- `docker-compose.prod.yml` — overrides + adds `api` service with `image: ${OCIR_REGISTRY}/${OCIR_REPO}:${IMAGE_TAG}`.
- `ops/nginx/timeline.conf` — reverse proxy, public-reel cache (`X-Cache-Status` header), TLS via Let's Encrypt.
- `infra/terraform/` — OCI VM, bucket, IAM, OIDC trust (Phase 8.1).
- `infra/cloud-init.yaml` — VM bootstrap (4 known bugs, F1 follow-up).
- `infra/DEPLOY.md` — operator runbook.
- `.github/workflows/deploy.yml` — three triggers (PR / push:main / push:tag), three jobs (verify / build-and-push / deploy). `deploy` job scp's compose files (UAT v0.2.1 fix), runs SSH script that pulls image, runs migration, recreates container. Approval gate at `production` env (per-deploy reviewer required since v0.2.3).

## Data Flow Patterns

**Public reel (`/`)** — zero network. SEEDED_CITIES rendered immediately. No Auth0, no API.

**Public per-handle reel (`/u/:handle`)** — single GET to `/api/u/:handle/reel`, cached at Nginx for 5 min (case-preserving cache key per D-21). Server returns `{ user: { handle }, chapters: [...] }` or 404.

**Authenticated `/app` reel** — `useCitiesQuery` → `groupChapters` → `groupsToChapters` → `Reel`. Re-fetches via `useApi` after city CRUD.

**City CRUD** — `MapPicker` click → reverse-geocode (client-side via BigDataCloud) → `CityForm` (Zod-validated submit) → `POST /api/cities` → optimistic update + refetch. Reorder via `@dnd-kit/sortable` → `PATCH /api/cities/reorder` (all-or-nothing transaction).

**Photo upload** — `PhotoUploader` → HEIC convert + canvas resize → `requestUploadUrl` → PUT to PAR → `finalizePhoto` → refetch grid.

## Error Handling

- **Frontend:** every API call wrapped in `try/catch`; errors surface as banner UI (`MapFallbackBanner` for tile fallback, modal error states for forms). API helper functions throw `Error` with `error` code from the server JSON payload (e.g. `not_found`, `photo_limit_reached`).
- **Server:** Hono `app.onError` catches uncaught throws, logs with request ID, returns 500. Specific errors use `c.json({ error: '...' }, status)`. `pgErrorCode(err)` unwraps both raw pg `err.code` and Drizzle's `DrizzleQueryError.cause.code` — required everywhere `23505` (unique violation), `22P02` (invalid UUID), etc. are checked (memory: `project_drizzle_pg_error_wrapping.md`).
- **Tile-load fallback (ERR-03):** on 429 from MapTiler, `MapCanvas.tsx` swaps style to OSM raster, sets `sessionStorage` flag to prevent re-trigger loop, emits `onFallbackActivated` callback so the UI can banner the user.

## Entry Points

- **Web:** `index.html` → `src/main.tsx` → `<App />`.
- **Server (prod):** `node_modules/.bin/bun server/index.ts` inside `oven/bun:1-alpine`. Listens on `0.0.0.0:8787`, nginx proxies from `127.0.0.1:8787`.
- **Server (dev):** `scripts/dev.ts` orchestrates `vite` + `tsx watch server/index.ts` in one terminal, forwards signals, prefixes output.
- **Migration:** `bun run server/db/migrate.ts` — runs Drizzle migrations against `DATABASE_URL`. Required after schema changes.

## Abstractions Worth Knowing

- **`useApi()` / `useApiJson<T>()`** — Bearer-token-attached fetch hook. Wraps `fetch` in a closure with the access token.
- **`groupChapters(cities)`** — pure function that collapses adjacent same-coord cities into a `ChapterGroup`.
- **`cycleIntervalForPhotoCount(n, dwellMs?)`** — pure math; returns 0 for n≤1.
- **`pgErrorCode(err)`** — unwraps Drizzle's wrapper to surface the underlying pg error code.
- **`getOciClient()`** — singleton (`realClient ??= buildRealClient()`); failure is NOT cached (assignment is short-circuited), so next request retries (relevant after the UAT v0.2.3 PEM perm fix).
- **`__setOciClientForTest(c)`** / **`__setJwksGetterForTest(g)`** — test-injection hooks for fake clients (see TESTING.md).
- **`<RequireAuth>`** — gate component; reads `?signup=1` and forwards `screen_hint: 'signup'` to Auth0.
- **`<HandlePickerGate>`** — silently fetches `/api/me`; renders the modal sibling when handle is null.
