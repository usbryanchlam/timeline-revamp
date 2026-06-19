# Technology Stack

**Analysis Date:** 2026-06-19

## Languages

**Primary:**
- TypeScript 5.6+ — entire codebase (frontend `src/`, backend `server/`, scripts `scripts/`, drizzle config). Locked across all three tsconfigs.

**Secondary:**
- HCL (Terraform) — `infra/terraform/*.tf` files for OCI infrastructure (VM, bucket, IAM, OIDC trust).
- SQL — hand-authored migrations in `server/db/migrations/*.sql` (Drizzle-generated + one custom file `0001_cities_deferrable_unique.sql`).
- Bash — CI scripts inlined in `.github/workflows/deploy.yml`, plus `scripts/dev.ts` orchestrator (TS, not bash).

## Runtime

**Environment:**
- **Bun 1.3.12** — pinned runtime. Used in production Docker (`oven/bun:1-alpine` base in `Dockerfile`) and pinned in CI via `oven-sh/setup-bun@v2` with `bun-version: '1.3.12'` (`.github/workflows/deploy.yml:75`).
- **Node 22** — `@types/node: ^22.9.0` declared in `package.json`. Dev orchestrator (`scripts/dev.ts`) shells out to `bun x tsx` for the watch loop. The `tsx` dev path runs on Node-compatible APIs but is invoked through Bun.
- **Dual-runtime quirk** — `server/index.ts:130` gates `hono/bun`'s `serveStatic` behind a `typeof globalThis.Bun !== 'undefined'` check so dev (tsx-on-Node) and production (Bun) both work.

**Package Manager:**
- **Bun** — `bun.lock` (lockfile-v1) is the committed lockfile.
- CI uses `bun install --frozen-lockfile` (Dockerfile + GHA verify job).
- `db:migrate` script invokes `bun run server/db/migrate.ts` directly.

## Frameworks

**Frontend:**
- **React 19.0.0** — `src/main.tsx` mounts via `createRoot` + `<StrictMode>`.
- **Vite 7.0.0** — build tool. Config at `vite.config.ts` with `@vitejs/plugin-react ^5.0.0`.
- **React Router 7.15.0** (`react-router`, not the legacy `react-router-dom`) — `createBrowserRouter` in `src/App.tsx`.
- **Tailwind CSS 3.4.17** — config at `tailwind.config.ts`. Plugin: `@tailwindcss/container-queries ^0.1.1`. Custom theme tokens (amber palette, easings, fonts) live in the config — see DESIGN.md for the locked aesthetic.
- **MapLibre GL JS 5.0.0** — vector map renderer. Imported in `src/reel/MapCanvas.tsx`, `OrbitReel.tsx`, `GlobeReel.tsx`. Style sourced from MapTiler "hybrid" via `src/reel/mapStyle.ts`. CSS imported in `src/main.tsx` (NOT lazy — see `feedback_lazy_chunk_css.md`).
- **Framer Motion ^11** — chapter overlay, photo cycle, play/pause indicator animations.
- **Auth0 React SDK 2.16.2** (`@auth0/auth0-react`) — wired in `src/auth/AuthProvider.tsx`, mounted only inside `AppLayout` (lazy chunk gating).
- **@dnd-kit** (core 6.3.1, sortable 10.0.0, utilities 3.2.2) — sortable reorder of cities and photos in the editor.
- **heic-to 1.4.2** — client-side HEIC→JPEG conversion (WASM, lazy-loaded in `src/photos/heicToJpeg.ts`).
- **p-limit 7.3.0** — concurrency semaphore in `src/photos/uploadQueue.ts` (ESM-only — never `require()`).

**Backend:**
- **Hono ^4.12.18** — HTTP framework. `server/index.ts` is the app composition root. Built-in middlewares used: `hono/request-id`, `hono/http-exception`, `hono/bun` (runtime-gated).
- **@hono/node-server ^2.0.1** — Node-compatible server adapter; `serve({ fetch: app.fetch, port })` boots the listener.
- **jose ^6.2.3** — JWT verification + JWKS fetching in `server/auth/jwt.ts`. Chosen over `jsonwebtoken` for dual ESM/CJS publishing, `createRemoteJWKSet` key caching, and `SignJWT`/`generateKeyPair` test mintability.
- **Drizzle ORM 0.45.2** + **drizzle-kit 0.31.10** — schema in `server/db/schema.ts`, migrations in `server/db/migrations/`, drizzle config at `drizzle.config.ts` (`postgresql` dialect).
- **pg ^8.20.0** (node-postgres) — pool client in `server/db/client.ts`. Drizzle uses `drizzle-orm/node-postgres`.
- **zod ^4.4.3** — env validation (`server/env.ts`), request body schemas (`server/validation/photoInput.ts`), public-URL input validation in handlers.
- **sharp 0.34.5** — thumbnail generator. Dynamic-imported in `server/oci/parClient.ts:18` to avoid loading the native binary at module-eval time in tests.
- **oci-common 2.131.1** + **oci-objectstorage 2.131.1** — OCI SDK for PARs and putObject. CJS-only; loaded via `createRequire(import.meta.url)` in `server/oci/parClient.ts:10` because the server runs as ESM under `tsx watch` where bare `require` is undefined (`feedback_esm_require_in_tsx_watch.md`).

**Testing:**
- **Vitest 4.1.5** — runner. Config at `vitest.config.ts`. `@vitest/coverage-v8 ^4.1.5` for coverage.
- **jsdom ^29.1.1** — DOM environment, opt-in per-file via `@vitest-environment jsdom` annotation (default is `node`).
- **@testing-library/react 16.3.2** — component test harness.
- **@testing-library/jest-dom 6.9.1** — DOM assertion matchers.
- **@testing-library/user-event 14.6.1** — user-interaction simulation.
- No E2E framework wired up — Playwright is NOT installed. iPhone UAT is manual.

**Build/Dev:**
- **tsx ^4.21.0** — TypeScript runner for `scripts/dev.ts` orchestrator and `tsx watch server/index.ts` API dev loop.
- **typescript ^5.6.3** — compiler. Three tsconfigs: `tsconfig.app.json` (frontend, bundler resolution), `tsconfig.server.json` (NodeNext, server + scripts), `tsconfig.node.json` (build tooling), plus the root composite `tsconfig.json`.
- **autoprefixer ^10.4.20** + **postcss ^8.4.49** — CSS toolchain for Tailwind. `postcss.config.js` at repo root.
- **dotenv ^17.4.2** — loads `.env.local` then `.env` in `server/env.ts` and `drizzle.config.ts`. Existing `process.env` wins (Docker/CI env wins).

## Key Dependencies

**Critical:**
- `maplibre-gl 5.0.0` — the cinematic map runtime. Split into its own Rollup manualChunk in `vite.config.ts:53` so it's a stable cacheable file across deploys.
- `framer-motion ^11` — all chapter / photo / overlay motion. Locks: single amber accent, signature easings (defined in `src/reel/motion.ts` and `tailwind.config.ts` `transitionTimingFunction`).
- `@auth0/auth0-react 2.16.2` — SPA auth. Loaded only inside the `/app/*` route subtree (the `Auth0Provider` lives in `AppLayout`, not at root) so the public reel surface never imports it.
- `drizzle-orm 0.45.2` + `pg 8.20.0` — single-client DB stack. Pool created once in `server/db/client.ts`.
- `oci-objectstorage 2.131.1` + `oci-common 2.131.1` — photo storage. Test seam via `__setOciClientForTest` in `server/oci/parClient.ts:40` keeps integration tests OCI-credential-free.

**Infrastructure:**
- `hono ^4.12.18` — entire HTTP layer. Middleware chain mounted in `server/index.ts`.
- `jose ^6.2.3` — JWT validation against Auth0 JWKS (with key caching + auto-rotation).
- `sharp 0.34.5` — image thumbnailing, strips EXIF by default (no `.withMetadata()` call).
- `heic-to 1.4.2` — iPhone HEIC handling. Lazy-loaded WASM (~600KB).
- `p-limit 7.3.0` — bounded-concurrency upload queue.

## Configuration

**Environment:**
- `server/env.ts` — Zod-validated server env, frozen via `Object.freeze`. Throws and `process.exit(1)` on invalid env (NOTE: `feedback_module_load_env_validation_blocks_ci.md` — top-level Zod parse fires at test-import time; CI must stub `AUTH0_DOMAIN` + `AUTH0_AUDIENCE` + `DATABASE_URL` in workflow env).
- `.env.local` — per-developer secrets, gitignored. Loaded by `server/env.ts` and `drizzle.config.ts`.
- `.env` — committed shared defaults if any.
- `.env.example` — documents the contract.
- `.env.tag` — written by CI on the VM to inject `IMAGE_TAG=vX.Y.Z`, `OCIR_REGISTRY`, `OCIR_REPO` for `docker compose pull` resolution. Must come AFTER `.env` in `--env-file` order (later wins per `feedback_dual_runtime_env.md`).
- **Dual VITE_/server-side env contract** — Auth0 + MapTiler need both prefixed (Vite-inlined at build time) and unprefixed (server-side at runtime) copies. The Dockerfile declares `ARG VITE_*` build args so GHA can inject them at `docker build` time.

**Key configs required:**
- Frontend: `VITE_MAPTILER_KEY`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`.
- Backend: `DATABASE_URL`, `PORT` (default 8787), `NODE_ENV`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`.
- OCI (optional in env schema, required at runtime for photo routes): `OCI_TENANCY_OCID`, `OCI_USER_OCID`, `OCI_FINGERPRINT`, `OCI_PRIVATE_KEY_PATH`, optional `OCI_PRIVATE_KEY_PASSPHRASE`, `OCI_REGION`, `OCI_NAMESPACE`, `OCI_BUCKET_NAME`.

**Build:**
- `vite.config.ts` — React plugin, `@/` and `@server/` aliases, dev HTTPS via mkcert (auto-detected from `.dev/certs/`), `/api/*` proxy to `localhost:8787`, `maplibre` manualChunk.
- `Dockerfile` — three-stage Bun + Vite + Hono build. Stages: `deps` (frozen-lockfile install), `builder` (vite build with VITE_* args), `runtime` (non-root user 1001, ships `dist/`, `server/`, `node_modules`).
- `docker-compose.yml` — dev base (Postgres 16 service with healthcheck, `127.0.0.1:5432` bind).
- `docker-compose.prod.yml` — production overlay. `image: ${OCIR_REGISTRY}/${OCIR_REPO}:${IMAGE_TAG}`, strips Postgres port publish, mounts `./.oci:/app/.oci:ro`, loopback-only `127.0.0.1:8787:8787`.

## Platform Requirements

**Development:**
- macOS / Linux. Bun 1.3.12 must be installed.
- Docker Desktop for the Postgres dev DB (`bun run db:up`).
- Optional: mkcert + `.dev/certs/localhost+2.pem` + `.dev/certs/localhost+2-key.pem` for iPhone-on-LAN dev (Auth0 SPA SDK refuses non-secure non-localhost origins — `feedback_auth0_https_iphone_dev.md`).

**Production:**
- **OCI Ampere A1 Flex VM** — 4 OCPU, 24 GB RAM, Ubuntu 22.04 aarch64 (declared in `infra/terraform/compute.tf`).
- **Docker + Docker Compose** on the VM at `/opt/timeline-revamp/`.
- **Nginx (host-installed)** at `ops/nginx/timeline.conf`. Reverse-proxies to `127.0.0.1:8787` (Hono API container) with `proxy_cache` for the public reel surface (`/u/:handle`, `/api/public/u/:handle`).
- **Let's Encrypt via certbot** — TLS for `timeline.bryanlam.dev`. Certbot appends 443 listen + `ssl_certificate*` directives.
- **OCI Object Storage** for photo masters + thumbnails.
- **OCI Container Registry (OCIR)** at `sjc.ocir.io` (3-letter region code, NOT `us-sanjose-1` — `feedback_ocir_region_code_disambiguation.md`).
- **GitHub Actions** — tag-driven CI/CD via `.github/workflows/deploy.yml`. Multi-arch buildx targets `linux/arm64` only (Ampere A1).
- **Terraform 1.10.x** (`~> 1.10.0`, NOT `>= 1.10` — TF 1.11.2 breaks OCI S3-compat per `versions.tf:2`) with `oracle/oci ~> 6.0`.

---

*Stack analysis: 2026-06-19*
