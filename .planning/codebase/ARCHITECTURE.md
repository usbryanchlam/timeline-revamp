<!-- refreshed: 2026-04-27 -->
# Architecture

**Analysis Date:** 2026-04-27
**Phase:** Post-Phase 4 (backend skeleton + Auth0 + lazy provisioning shipped). Phase 5 (city CRUD) is the next layer to land.

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                       Browser (Vite + React 19)                       │
│                                                                       │
│   src/main.tsx ──► src/App.tsx (createBrowserRouter)                  │
│                          │                                            │
│         ┌────────────────┼─────────────────┬───────────────┐          │
│         ▼                ▼                 ▼               ▼          │
│   PublicReelRoute   HandleReelRoute    AppLayout       NotFoundRoute  │
│   `/`               `/u/:handle`       `/app/*`        `*`            │
│   (no auth,         (no auth,          AuthProvider                   │
│    no fetch,         seeded reel)       └► RequireAuth                │
│    seeded reel)                            └► HandlePickerGate        │
│                                                └► Outlet + BottomNav  │
│                                                   ▲                   │
│                                                   │ /app/, trips, me  │
└───────────────────────────────────────────────────┼───────────────────┘
                                                    │
                       Bearer ${access_token}       │       Auth0
                  ─────────────────────────────► /api/me  ◄── (Universal
                       (Vite proxy → :8787)         │         Login + JWKS)
                                                    │
┌───────────────────────────────────────────────────┴───────────────────┐
│                        Hono API (Bun + tsx)                           │
│                                                                       │
│  server/index.ts                                                      │
│    GET  /health, /api/health         (PUBLIC, no middleware)          │
│    USE  /api/me{,/*}  → requireJwt → lazyProvisionUser → meRouter     │
│                                                                       │
│  server/auth/jwt.ts        validate RS256 via jose + JWKS, set        │
│                            c.var.auth0Sub / auth0Email                │
│  server/auth/lazyProvision SELECT users WHERE auth0_sub=…             │
│                            INSERT … RETURNING on miss; sets c.var.user│
│  server/routes/me.ts       GET / (echo user), POST /handle (claim)    │
└───────────────────────────────────────────────────┬───────────────────┘
                                                    │
                                                    ▼ pg.Pool
┌──────────────────────────────────────────────────────────────────────┐
│                Postgres 16 (docker-compose service `postgres`)        │
│   tables: users, cities, photos, notifications                        │
│   constraints: cities (user_id, order_index) UNIQUE DEFERRABLE        │
│                INITIALLY DEFERRED — owned by hand-authored migration  │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Router | Map URL → route component | `src/App.tsx:10-23` |
| Public reel | Render seeded reel without any fetch / auth | `src/routes/PublicReelRoute.tsx`, `src/routes/HandleReelRoute.tsx` |
| App layout | Mount Auth0 → gate auth → gate handle → render outlet + nav | `src/routes/AppLayout.tsx:24-37` |
| Auth provider | Scope `@auth0/auth0-react` to `/app/*` only | `src/auth/AuthProvider.tsx:11-43` |
| Auth gate | Redirect to Auth0 Universal Login when unauthenticated | `src/components/RequireAuth.tsx:20-40` |
| Handle gate | Fetch `/api/me`, render picker modal when handle is null | `src/auth/HandlePickerGate.tsx:27-56` |
| API client | Attach `Authorization: Bearer …` to every fetch | `src/auth/useApi.ts:11-22` |
| Reel surface | Compose MapCanvas + overlays around the gesture state | `src/reel/Reel.tsx:27-107` |
| Map canvas | Lazy-loaded MapLibre wrapper, flyTo on chapter change | `src/reel/MapCanvas.tsx` |
| Gesture machine | Pure transition function; states + events + clamping | `src/gestures/stateMachine.ts:89-317` |
| Hono app | Wire middleware chain + routers + `serve()` | `server/index.ts:14-42` |
| JWT middleware | Verify token against Auth0 JWKS, set context vars | `server/auth/jwt.ts:49-73` |
| Lazy provisioner | SELECT-or-INSERT user keyed by `auth0_sub` | `server/auth/lazyProvision.ts:32-56` |
| /api/me router | GET current user, POST claim handle | `server/routes/me.ts:15-73` |
| Drizzle schema | Tables `users`, `cities`, `photos`, `notifications` | `server/db/schema.ts:36-106` |
| Shared handle validator | Cross-trust-boundary regex + reserved-word check | `server/handles/validate.ts:25-32` |

## Pattern Overview

**Overall:** SPA + thin REST API. Frontend is route-driven; backend is a flat middleware chain (no controllers, no service layer yet). Two surfaces share a hard architectural seam: the public reel renders client-only with seeded data, the authenticated `/app/*` tree mounts Auth0 lazily on first navigation.

**Key Characteristics:**
- **Public/private split is enforced by component composition, not by routing config.** Auth0Provider lives only inside `AppLayout`; nothing on `/` or `/u/:handle` ever loads the `@auth0/auth0-react` chunk (`src/routes/AppLayout.tsx:24`, `src/auth/AuthProvider.tsx:7-8`).
- **Pure gesture state machine + effectful hook.** `src/gestures/stateMachine.ts` is testable in isolation; `useGestureMachine` owns timers/listeners and is the only place side effects run.
- **MapLibre is a slave to gesture state.** Map starts `interactive: false`; `dragPan`/`touchZoomRotate` are toggled by `stateName === 'MAP_INTERACT'` (`src/reel/MapCanvas.tsx:119-134`).
- **Shared validator across the trust boundary.** `server/handles/validate.ts` is imported by the frontend via the `@server` alias (`vite.config.ts:16`) so client and server agree byte-for-byte on what is a legal handle.
- **MapLibre is dynamically imported AND pre-split.** `Reel.tsx:14-16` uses `React.lazy()` to defer the chunk until after first paint; `vite.config.ts:38-43` puts `maplibre-gl` in its own `manualChunks` bucket so the chunk is stable across deploys.
- **MapLibre CSS is hoisted to `main.tsx`.** `import 'maplibre-gl/dist/maplibre-gl.css'` lives at `src/main.tsx:3` so the stylesheet ships in the initial CSS bundle. Importing it inside the lazy chunk would race the JS — controls would render before their styles. Do not move this.

## Layers

**Frontend entry:**
- Files: `src/main.tsx`, `src/App.tsx`
- Mounts React, declares the router. No conditionals beyond `prefers-reduced-motion`, which now lives in each route component.

**Routing (React Router v7):**
- File: `src/App.tsx:10-23`
- Five routes: `/` (public reel), `/u/:handle` (public per-handle reel — Phase 9 will swap stub for real fetch), `/app` index (auth reel), `/app/trips`, `/app/me`, `*` (404). The `/app` parent has `<AppLayout />` as `element`; children render through `<Outlet />`.

**Auth boundary:**
- Files: `src/auth/AuthProvider.tsx`, `src/components/RequireAuth.tsx`, `src/auth/HandlePickerGate.tsx`, `src/auth/HandlePickerModal.tsx`, `src/auth/useApi.ts`
- Mount order is load-bearing: `AuthProvider → RequireAuth → HandlePickerGate → Outlet`. RequireAuth calls `useAuth0()` (throws outside Auth0Provider). HandlePickerGate calls `/api/me` (requires authentication).
- `useApi()` wraps `fetch` with `getAccessTokenSilently()` so callers never see the token.

**Reel:**
- Files: `src/reel/{Reel,MapCanvas,MapPoster,ChapterOverlay,ChapterRail,CTAPill,StateBadge,ReducedMotionReel,usePrefersReducedMotion}.tsx`
- `Reel.tsx` wires the gesture machine to overlays; `MapCanvas.tsx` is a `React.lazy` chunk and falls back to `MapPoster` (identical positioning, no layout shift).

**Gestures:**
- `stateMachine.ts` (pure) — states `IDLE | SCRUBBING | CHAPTER_SWIPE | MAP_INTERACT | PAUSED | SUSPENDED`, `transition(state, event, totalChapters)` always returns a new object.
- `useGestureMachine.ts` — binds PointerEvents (window-level capture for move/up so MapLibre's `setPointerCapture` cannot swallow them), runs long-press / fly-done / map-idle / orientation-settle timers.

**Backend entry:**
- File: `server/index.ts`
- Hono app with `logger()` globally, two public health probes (`/health`, `/api/health`), and a single authenticated namespace `/api/me{,/*}` whose middleware chain is `requireJwt → lazyProvisionUser → meRouter` (line 32-34). The order is enforced by reading order — `lazyProvisionUser` reads `c.var.auth0Sub` set by `requireJwt`.

**JWT validation flow:**
- `server/auth/jwt.ts:21-30` — `createRemoteJWKSet(https://${AUTH0_DOMAIN}/.well-known/jwks.json)` with `cooldownDuration: 30s`, `cacheMaxAge: 600s`. Issuer is `https://${AUTH0_DOMAIN}/` (trailing slash REQUIRED — Auth0 mints it that way).
- `requireJwt` extracts the bearer header, calls `jwtVerify(token, jwksGetter, { issuer, audience })`, sets `c.var.auth0Sub` + `c.var.auth0Email`. Any jose error collapses to a single 401 `{ error: 'invalid_token' }` to avoid leaking which check failed; the underlying error message is written to stderr.
- A `__setJwksGetterForTest` seam (`jwt.ts:32-34`) lets `jwt.test.ts` mint local tokens against an in-memory JWKS without hitting Auth0.

**Lazy provisioning:**
- `server/auth/lazyProvision.ts:32-56` — `db.query.users.findFirst({ where: eq(auth0Sub, …) })`; on miss, `db.insert(users).values({ auth0Sub, email }).returning()`. Sets `c.var.user`. Documented race (two simultaneous never-seen-before requests) is acceptable for v1; the v2 fix is `.onConflictDoUpdate()`.

**Hono context typing:**
- `server/auth/context.ts:15-21` — `declare module 'hono' { interface ContextVariableMap { auth0Sub: string; auth0Email: string; user: User } }`. This is a side-effect import in `server/index.ts:12`; removing it silently relaxes types across every authenticated handler.

**Database:**
- `server/db/client.ts` — single `pg.Pool` per process, drizzled with the schema namespace.
- `server/db/schema.ts:36-106` — `users`, `cities`, `photos`, `notifications`. All FKs ON DELETE CASCADE. **DATA-02 ownership pattern:** the deferrable `UNIQUE (user_id, order_index)` on `cities` is intentionally NOT modeled in `schema.ts`. Drizzle's `pg-core` only knows unique INDEXes, but Postgres rejects `CREATE UNIQUE INDEX ... DEFERRABLE`. Constraint lives in `server/db/migrations/0001_cities_deferrable_unique.sql` (hand-authored) so future `bun run db:generate` runs see nothing to diff and leave it alone. Do not add `uniqueIndex(...)` to `schema.ts`.

## Data Flow

### Public reel (`/`, `/u/:handle`)

1. `index.html` loads `src/main.tsx`, which imports MapLibre CSS and renders `<App />` (`src/main.tsx:3,12`).
2. Router resolves `/` to `PublicReelRoute` (or `/u/:handle` to `HandleReelRoute`); each picks `<Reel />` vs `<ReducedMotionReel />` via `usePrefersReducedMotion()` (`src/routes/PublicReelRoute.tsx:6-8`).
3. `Reel.tsx` initialises the gesture machine on `SEEDED_CITIES` and renders `<Suspense fallback={MapPoster}><MapCanvas/></Suspense>` (`src/reel/Reel.tsx:30,72-79`).
4. PointerEvents → `useGestureMachine` → `transition()` → new `ReelState` → MapCanvas effect fires `flyTo({ center, zoom, pitch, bearing, easing: easeArrival })` (`src/reel/MapCanvas.tsx:106-115`).
5. No network request to the API ever runs on this path.

### Authenticated provisioning (first visit)

1. User navigates to `/app` → `AppLayout` mounts `AuthProvider` → `RequireAuth` (`src/routes/AppLayout.tsx:25-35`).
2. `useAuth0()` reports `!isAuthenticated`; `RequireAuth` calls `loginWithRedirect({ appState: { returnTo: window.location.pathname } })` (`src/components/RequireAuth.tsx:23-29`).
3. Auth0 Universal Login redirects to `${origin}/app`; `Auth0Provider.onRedirectCallback` navigates to `appState.returnTo` (`src/auth/AuthProvider.tsx:34-37`).
4. `HandlePickerGate` mounts inside `RequireAuth` and fetches `/api/me` via `useApi()` with an `AbortController` (`src/auth/HandlePickerGate.tsx:32-46`).
5. Vite dev proxy forwards `/api/*` to `http://localhost:8787` (`vite.config.ts:22-31`).
6. Hono runs `requireJwt` → token validated against Auth0 JWKS → `c.var.auth0Sub` set (`server/auth/jwt.ts:53-60`).
7. `lazyProvisionUser` finds no row → INSERTs with `handle: null` → sets `c.var.user` (`server/auth/lazyProvision.ts:36-54`).
8. `meRouter.get('/')` returns `{ id, email, handle: null, createdAt }` (`server/routes/me.ts:15-23`).
9. `HandlePickerGate` sees `handle === null` and mounts `<HandlePickerModal />`; modal POSTs `/api/me/handle` after local validation (`src/auth/HandlePickerModal.tsx:44-72`); server re-validates and UPDATEs the row, mapping PG `23505` to HTTP 409 `taken` (`server/routes/me.ts:60-71`).

## Architectural Constraints

- **Threading:** Browser is single-threaded as usual. Server runs as a single Node process started by `@hono/node-server` (`server/index.ts:36`); there are no worker threads. The gesture machine is reentrancy-safe because every transition returns a new object.
- **Global state:** Module-level singletons: `mapRef` inside `MapCanvas.tsx` (one map per mount), `pool` in `server/db/client.ts:6`, `jwksGetter` in `server/auth/jwt.ts:27`, frozen `env` object in `server/env.ts:30`. The Hono `app` itself is exported from `server/index.ts:14` for testability.
- **Process boundary in dev:** Two children spawned by `scripts/dev.ts:17-20` (Vite + `tsx watch server/index.ts`); signals (SIGINT/SIGTERM/SIGHUP) are forwarded to both, first-to-die tears down its sibling.
- **Side-effect import:** `server/index.ts:12` (`import './auth/context.js'`) MUST stay — it registers the Hono `ContextVariableMap` augmentation. Without it `c.var.user` becomes `unknown` everywhere.
- **`.app-reel-host` collision wrapper:** When the reel renders inside `AppLayout` (`/app/`), the fixed BottomNav (h-16) would cover the ChapterRail. `src/routes/AppReelRoute.tsx:15-18` wraps the reel in `.app-reel-host`; `src/index.css:95-97` lifts `[data-chapter-rail]` above the nav (`!important` because ChapterRail uses inline `bottom`). Public `/` does not get the wrapper, so its rail is unaffected.
- **MapLibre CSS race:** `src/main.tsx:3` is the only safe place to import `maplibre-gl/dist/maplibre-gl.css`. Co-locating it with the lazy chunk would let the JS execute before the stylesheet arrives.
- **`@server` alias is a narrow door:** Frontend may only import from `@server/handles/*` (validator + reserved words). Importing anything else from `server/` either crashes the bundle (Node-only modules: `pg`, `dotenv`) or leaks server contracts into the SPA (`vite.config.ts:11-17`).

## Anti-Patterns

### Importing `@auth0/auth0-react` outside `AppLayout`

**What happens:** A component on the public reel imports `useAuth0()` "for convenience".
**Why it's wrong:** It pulls the Auth0 SDK into the public reel chunk, defeating the AUTH-04 split. It also throws at runtime because `Auth0Provider` is not mounted on `/`.
**Do this instead:** Keep all Auth0 imports under `src/auth/` and `src/components/RequireAuth.tsx`, and only render those components inside `AppLayout`.

### Adding `uniqueIndex(...)` for `(user_id, order_index)` to `schema.ts`

**What happens:** A future Phase 5 plan tries to model the cities ordering constraint in Drizzle.
**Why it's wrong:** Drizzle generates a `CREATE UNIQUE INDEX`, which Postgres cannot make DEFERRABLE. The reorder transaction (Phase 5) requires deferred uniqueness or it fails on the first intermediate UPDATE.
**Do this instead:** Leave `schema.ts` silent on this constraint; it is owned by `server/db/migrations/0001_cities_deferrable_unique.sql` (see ownership notice at `server/db/schema.ts:1-17`).

### Mutating `ReelState` to "save a render"

**What happens:** A new gesture event handler does `state.gestureDx += dx; return state;`.
**Why it's wrong:** Breaks React's referential-equality bailout, makes the machine impossible to unit-test (snapshots leak across cases), and is explicitly forbidden by the coding-style immutability rule.
**Do this instead:** `return { ...state, gestureDx: state.gestureDx + dx };` — every transition returns a new object (`src/gestures/stateMachine.ts:153-185`).

### Pre-checking handle availability with a SELECT before UPDATE

**What happens:** A "polite" change adds `SELECT ... WHERE handle = ?` before the UPDATE in `meRouter.post('/handle')`.
**Why it's wrong:** It races. Another request can claim the handle between SELECT and UPDATE.
**Do this instead:** Let the UNIQUE constraint be the source of truth; catch PG `23505` and translate to 409 `taken` (`server/routes/me.ts:66-71`).

## Error Handling

- **Frontend:** `RequireAuth` redirects on `!isAuthenticated`; `HandlePickerGate` swallows `AbortError` only and otherwise shows the picker UI; modal maps server status codes (200/409/422/other) to user-facing copy.
- **Backend:** Zod validates env on startup and `process.exit(1)`s on miss (`server/env.ts:23-28`). JWT failures collapse to 401 with `process.stderr.write`. Handle validation failures return 422 with a discriminated `reason`. Unique-violation maps to 409. Anything else is rethrown to Hono's default 500.
- **Logging:** `process.stdout` / `process.stderr` only — no `console.log` in production paths (typescript/coding-style.md). `hono/logger` is mounted globally for request logs.

## Cross-Cutting Concerns

- **Logging:** `hono/logger` (`server/index.ts:16`) for request lines; `process.stdout` / `process.stderr` for everything else.
- **Validation:** Zod on the env contract (`server/env.ts`) and a regex+reserved-set discriminated-union validator on handles (`server/handles/validate.ts`). No request-body schema layer yet — Phase 5 introduces one for cities.
- **Authentication:** Auth0 Universal Login + JWT bearer on the API; `useApi()` is the single place tokens leave the auth context.
- **State management:** No Redux / Zustand / Context. Gesture state lives in `useGestureMachine`; `/api/me` data lives in `HandlePickerGate` local state. Phase 5 is expected to introduce a data-fetching layer (TanStack Query is the likely default but not yet adopted).

## Things Not Yet in This Architecture

- City CRUD endpoints, reverse-geocoding client (Phase 5 — will live under `server/routes/cities.ts` and `src/routes/TripsRoute.tsx`).
- Photo upload pipeline (Phase 6).
- Public per-handle reel data fetch (Phase 7 — `HandleReelRoute` is currently a stub serving `SEEDED_CITIES`; `src/routes/HandleReelRoute.tsx:7`).
- Nginx + TLS reverse proxy (Phase 8).
- BullMQ + Puppeteer + FFmpeg MP4 pipeline (Phase 10).
- Notification polling UI (Phase 10).

---

*Architecture analysis: 2026-04-27*
