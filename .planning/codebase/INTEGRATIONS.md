# External Integrations

**Analysis Date:** 2026-04-27
**Phase:** Phases 1–4 complete — backend, Auth0, and Postgres now wired

## Active Integrations

**Map tiles:**
- **MapTiler** — vector tiles for the cinematic reel
  - Env var: `VITE_MAPTILER_KEY` (frontend, read via `import.meta.env`)
  - Free tier: 100k tile requests/month (per `.env.example:2`)
  - Fallback: `https://demotiles.maplibre.org/` when no key is set — keeps offline-friendly dev unblocked (`.env.example:3-4`)
  - SDK: `maplibre-gl` ^5.0.0 (no MapTiler-specific client)

**Identity — Auth0** (existing personal tenant per `.planning/PROJECT.md:42`):
- **Frontend SDK:** `@auth0/auth0-react` ^2.16.2, mounted in `src/auth/AuthProvider.tsx`
  - Mounted ONLY inside `AppLayout` so the SDK chunk doesn't load on public reels (`src/auth/AuthProvider.tsx:7-10`)
  - Token cache: `memory` (no localStorage, refresh via silent re-auth) — `src/auth/AuthProvider.tsx:33`
  - Scopes: `openid profile email` (`src/auth/AuthProvider.tsx:31`)
  - Redirect URI: `${window.location.origin}/app` (`src/auth/AuthProvider.tsx:29`)
  - Throws synchronously if any `VITE_AUTH0_*` is missing — fail fast in dev + CI (`src/auth/AuthProvider.tsx:18-22`)
- **Server validation:** `jose` ^6.2.3 against JWKS at `https://${AUTH0_DOMAIN}/.well-known/jwks.json` (`server/auth/jwt.ts:21-30`)
  - Issuer claim: `https://${AUTH0_DOMAIN}/` — trailing slash REQUIRED, Auth0 emits it (`server/auth/jwt.ts:21`)
  - Audience claim: `AUTH0_AUDIENCE` (the API identifier, NOT the SPA client id; guarded against confusion in comments at `server/auth/jwt.ts:8-9`)
  - JWKS cache: 10-minute `cacheMaxAge`, 30-second `cooldownDuration` (`server/auth/jwt.ts:28-30`)
  - All jose error variants collapsed to `invalid_token` 401 to avoid leaking which check failed (`server/auth/jwt.ts:63-72`)
  - Test seam: `__setJwksGetterForTest()` swaps the JWKS getter for `createLocalJWKSet` bound to a generated keypair so `jwt.test.ts` can mint expired/wrong-audience tokens hermetically (`server/auth/jwt.ts:32-34`)

**Auth flow:**
1. Frontend `<AuthProvider>` wraps `/app/*` routes only
2. User obtains access token via Universal Login (`audience` set so token is for our API, not just OIDC)
3. Frontend sends `Authorization: Bearer <token>` to `/api/*`
4. Hono middleware order on `/api/me*` (`server/index.ts:32-34`):
   - `requireJwt` validates issuer + audience atomically via `jose.jwtVerify` (`server/auth/jwt.ts:53-56`)
   - `lazyProvisionUser` creates `users` row on first authenticated call (decision: simpler than Auth0 webhooks per `.planning/PROJECT.md:84`)
   - Reads `c.var.auth0Sub` set in step 1 — type-augmented via side-effect import `./auth/context.js` at `server/index.ts:8-12`

**Public surfaces (no auth):** `/health` and `/api/health` at `server/index.ts:21-22`. `/api/health` exists so the frontend can verify the Vite proxy end-to-end.

## Data Storage

**Postgres 16 in Docker:**
- Compose service: `postgres:16` image (`docker-compose.yml:2-3`)
- Defaults: user `timeline`, db `timeline`, password from `${POSTGRES_PASSWORD:-timeline_dev_pw}` (`docker-compose.yml:5-8`)
- Port 5432 host-published (`docker-compose.yml:9-10`)
- Volume `pgdata` for persistence across `docker compose down` (`docker-compose.yml:11-12,19-20`)
- Healthcheck: `pg_isready -U timeline -d timeline` every 5s (`docker-compose.yml:13-17`)
- Local container managed via OrbStack on macOS (per `.planning/PROJECT.md`)
- Connection: `DATABASE_URL` env var, URL-validated by Zod at process start (`server/env.ts:13`)
- ORM: Drizzle ORM ^0.45.2; schema at `server/db/schema.ts`, migrations at `server/db/migrations/` (`drizzle.config.ts:8-10`)
- Default URL fallback in drizzle config: `postgres://timeline:timeline_dev_pw@localhost:5432/timeline` (`drizzle.config.ts:13-14`)
- Migration runner: `bun run db:migrate` → `tsx server/db/migrate.ts`
- Studio: `bun run db:studio` → `drizzle-kit studio`
- Notable schema decision (per `.planning/PROJECT.md`): `cities` table will use `DEFERRABLE INITIALLY DEFERRED` unique constraint on `(user_id, order_index)` for bulk reorder

**File Storage (planned, not wired):**
- OCI Object Storage via Pre-Authenticated Requests (PARs) — locked in `.planning/PROJECT.md:62`
- Single public-read bucket prefix for photo thumbnails

**Caching:**
- None at runtime
- Build-time: Vite/Rollup cache for `maplibre-gl` chunk (`vite.config.ts:38-42`)
- JWKS keys: in-process cache via `jose.createRemoteJWKSet` (`server/auth/jwt.ts:27-30`)

## Monitoring & Observability

**Error Tracking:** Not detected.

**Logging:**
- Hono `logger()` middleware globally on `*` (`server/index.ts:16`)
- Diagnostics use `process.stdout.write` / `process.stderr.write` per coding-style.md no-`console.log` rule (`server/index.ts:40`, `server/auth/jwt.ts:70`, `server/env.ts:26`)
- Dev orchestration prefixes child output with `[web]` / `[api]` (`scripts/dev.ts:34`)

## CI/CD & Deployment

**Hosting:** OCI Ampere A1 VM (existing free tier, locked in `.planning/PROJECT.md`).

**CI Pipeline:** Not detected as of Phase 4.

**Deploy target (Phase 8):** Docker Compose on OCI; Nginx fronts static Vite build and proxies `/api/*` to the Hono container (mirrors dev proxy at `vite.config.ts:23-31`).

## Environment Configuration

**Dual env-var sets are intentional** — Vite only exposes vars prefixed with `VITE_` to the browser bundle, so Auth0 wiring duplicates the same logical values across server- and client-side (`.env.example:13-21`).

**Server-side (read by `server/env.ts` via dotenv, validated by Zod):**
- `DATABASE_URL` — Postgres connection string (URL-validated)
- `PORT` — defaults to 8787 (`server/env.ts:14`)
- `NODE_ENV` — `development` | `production` | `test`, default `development`
- `AUTH0_DOMAIN` — bare hostname (e.g., `bryanlam.us.auth0.com`), NOT a URL; the JWT middleware constructs `https://${AUTH0_DOMAIN}/` for issuer + JWKS URL (`server/env.ts:17-19`)
- `AUTH0_AUDIENCE` — API identifier (URL)
- `AUTH0_CLIENT_ID` — SPA client id (in `.env.example:16` for completeness)
- `POSTGRES_PASSWORD` — read by `docker-compose.yml:7` to seed dev DB

**Frontend (read via `import.meta.env` — `VITE_` prefix mandatory):**
- `VITE_MAPTILER_KEY` — optional; falls back to `demotiles.maplibre.org` when missing
- `VITE_AUTH0_DOMAIN` — same value as `AUTH0_DOMAIN`
- `VITE_AUTH0_CLIENT_ID` — same value as `AUTH0_CLIENT_ID`
- `VITE_AUTH0_AUDIENCE` — same value as `AUTH0_AUDIENCE`

**Loading order (server + drizzle-kit):**
1. `.env.local` (per-developer secrets, gitignored) — `server/env.ts:7`, `drizzle.config.ts:4`
2. `.env` (committed defaults if any)
3. Pre-existing `process.env` is NOT overwritten — Docker / CI env wins (`server/env.ts:6`)

**Secrets location:**
- `.env.local` (gitignored, per-developer)
- `.env.example` (committed template, no real values)
- Production: env vars on the OCI VM / Docker Compose (Phase 8, not wired)

## Webhooks & Callbacks

**Incoming:**
- Auth0 redirect callback handled client-side by `@auth0/auth0-react` and `onRedirectCallback` in `src/auth/AuthProvider.tsx:34-38` — pulls `appState.returnTo` (default `/app`) and `navigate(..., { replace: true })`. No server webhook endpoint.

**Outgoing:**
- Server → Auth0 JWKS (`https://${AUTH0_DOMAIN}/.well-known/jwks.json`) — read-only key fetch on cold-start and post-cooldown rotation (`server/auth/jwt.ts:22,27-30`)
- Frontend → MapTiler tile CDN — runtime tile requests from `maplibre-gl`

## Planned Integrations (not yet wired)

**Reverse geocoding (Phase 5):**
- BigDataCloud — convert (lat, lng) → city name on map-pick (10k/day free tier)

**Object Storage (Phase 6):**
- OCI Object Storage with PARs — photo thumbnails (public-read prefix) + MP4 renders (time-limited PARs)

**Job queue (Phase 10):**
- BullMQ + Redis — MP4 render queue, concurrency=1 (RAM math at `.planning/PROJECT.md:67`)
- Per-user rate limit: 5 renders / 24h, DB-enforced

## Third-Party Risk

- All planned externals have a documented fallback in `.planning/PROJECT.md`:
  - MapTiler → demotiles → self-hosted `tileserver-gl`
  - MP4 server → MediaRecorder client → GIF → cut
  - Auth0 → no documented fallback (tenant is owned)
- Demotiles is best-effort public infra — fine for offline dev, do not ship as production tile source.

---

*Integration audit: 2026-04-27*
