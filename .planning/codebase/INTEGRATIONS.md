# External Integrations

**Analysis Date:** 2026-04-27
**Phase:** W1 — frontend-only, no backend integrations live yet

## Active Integrations

**Map tiles:**
- MapLibre demotiles (`https://demotiles.maplibre.org/style.json`)
  - Used for: W1 prototype background only
  - Auth: none (public)
  - Limits: world-level vector data only — runs out of detail past zoom ~5
  - Replacement plan: MapTiler free tier in W2

**Web fonts:**
- Google Fonts — Inter Tight (500/700/800) + Inter (400/500/600/700)
  - Loaded via `<link rel="stylesheet">` in `index.html`
  - Preconnect hints to fonts.googleapis.com + fonts.gstatic.com (CORS)
  - Production plan (DESIGN.md): self-host from `/fonts/` to remove the third-party request and meet Lighthouse perf budget

## Planned Integrations (not yet wired)

**Map tiles (W2 swap):**
- MapTiler — vector tiles for cinematic city-zoom landings
- SDK: none, just a URL with `?key=$VITE_MAPTILER_KEY`
- Free tier: 100k requests/month
- Fallback (per plan): self-hosted `tileserver-gl` Docker container if rate-limited

**Reverse geocoding (W5):**
- BigDataCloud — convert (lat, lng) → city name on map-pick
- Free tier: 10k/day
- Called from frontend during city-add flow

**Authentication (W4b):**
- Auth0 Universal Login — primary identity
- SDKs: `@auth0/auth0-react` for frontend, JWT middleware in backend
- Tenants: existing personal Auth0 tenant (Bryan owns)
- JWT validation: Hono middleware checks signature against Auth0 JWKS

**Object Storage (W6):**
- OCI Object Storage (Oracle Cloud) — photo blobs + MP4 renders
- Auth: Pre-Authenticated Requests (PARs), NOT S3 signed URLs (OCI-native)
- Bucket layout (per plan): public-read prefix for photo thumbnails, time-limited PARs for MP4 downloads

**Job queue (W10):**
- BullMQ + Redis — MP4 render queue
- Concurrency: 1 (RAM math: Chromium + FFmpeg + Node + Postgres ≈ 3.3 GB at 8 GB VM)
- Per-user rate limit: 5 renders / 24h, DB-enforced

## Environment Variables

**Currently:** None used at runtime.

**Planned (W2 onward), with `VITE_` prefix for client-exposed values:**
- `VITE_MAPTILER_KEY` — map style URL signing
- `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` — Auth0 React SDK config (public)
- Backend (server-only, no `VITE_` prefix): `DATABASE_URL`, `AUTH0_AUDIENCE`, `OCI_*` credentials, `REDIS_URL`

## Data Storage

**Currently:** None — seed data is hardcoded in `src/data/seeded-cities.ts`.

**Planned:**
- Postgres 16 in Docker (local + prod) via Drizzle ORM
- Schema spec lives in `docs/plan.md` § "Data schema (v1, final)"
- Notable: `cities` table has `DEFERRABLE INITIALLY DEFERRED` unique constraint on `(user_id, order_index)` to support bulk reorder in a single transaction

## Third-Party Risk

- All planned external services have a documented fallback in `docs/plan.md` (MapTiler → self-hosted, MP4 server → MediaRecorder → GIF, Auth0 → none documented yet but tenant is owned).
- Demotiles is best-effort public infra — fine for W1, do not ship as the production tile source.
