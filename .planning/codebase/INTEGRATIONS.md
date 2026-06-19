# External Integrations

**Analysis Date:** 2026-06-19

## APIs & External Services

**Map tiles:**
- **MapTiler** — `https://api.maptiler.com/maps/hybrid/style.json?key=...`. Used by `src/reel/mapStyle.ts:10` as the canonical style URL for all reel surfaces.
  - SDK: none. Plain fetch by MapLibre GL via the style URL.
  - Auth: `VITE_MAPTILER_KEY` (frontend env, Vite-inlined at build time). Set as a `--build-arg` in `Dockerfile:35` and passed via `build-args:` in `.github/workflows/deploy.yml:152`.
  - Free tier: 100k tile requests/month.
  - Fallback: `https://demotiles.maplibre.org/style.json` when the key is unset — preserves dev experience without an account. A `console.warn` fires once at module load (`src/reel/mapStyle.ts:17`).

**Reverse geocoding:**
- **BigDataCloud** — `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=...&longitude=...&localityLanguage=en`. Used by `src/geocode/bigdatacloud.ts:27` when the city form is opened after a map-pick to pre-fill city/country.
  - SDK: none. Plain `fetch`.
  - Auth: keyless. Browser-only endpoint.
  - **Architectural constraint**: Per BigDataCloud Fair Use, server-side calls would pool every user's traffic under one egress IP and trigger HTTP 402. Enforced by the meta-test `server/auth/__no-bigdatacloud.test.ts` which fails the build if any file under `server/` contains the literal string "bigdatacloud".

**Authentication:**
- **Auth0 Universal Login** — `https://${AUTH0_DOMAIN}/`.
  - SDK (frontend): `@auth0/auth0-react 2.16.2`, mounted via `<Auth0Provider>` in `src/auth/AuthProvider.tsx`. `cacheLocation="memory"` (no localStorage), `scope: 'openid profile email'`, `redirect_uri: window.location.origin + '/app'`.
  - SDK (backend): `jose ^6.2.3` for JWKS-backed RS256 verification in `server/auth/jwt.ts`. `createRemoteJWKSet` with `cooldownDuration: 30_000`, `cacheMaxAge: 600_000`.
  - Backend validates: `issuer === https://${AUTH0_DOMAIN}/` (trailing slash REQUIRED — Auth0 emits the `iss` claim that way) and `audience === AUTH0_AUDIENCE`.
  - Auth: env vars (dual contract):
    - Server-side: `AUTH0_DOMAIN` (bare hostname like `bryanlam.us.auth0.com`, NOT a URL), `AUTH0_AUDIENCE` (API identifier URL).
    - Frontend: `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID` (the SPA client id), `VITE_AUTH0_AUDIENCE`.
  - **Tenant has 3 dashboard apps**. Per `feedback_auth0_actions_tenant_wide.md`, the post-login Action that injects the namespaced `email` claim MUST gate on `event.client.client_id` so it only fires for this app — otherwise custom claims leak into sibling apps' tokens.
  - **Namespaced email claim**: `https://timeline.bryanlam.dev/email` (`server/auth/jwt.ts:49`). Access tokens don't carry the standard `email` claim; the post-login Action sets it under this URL. Backend falls back to the standard `email` claim for pre-Phase-9 tokens, then to empty string (DATA-01 — `users.email` is NOT NULL, so the fallback writes `''` and the one-off F9 backfill UPDATE patches the historical row).
  - iPhone dev caveat: SDK enforces secure-origin client-side. Vite HTTPS via mkcert is the working path; tunnels don't help (`feedback_auth0_https_iphone_dev.md`).
  - SPA setup landmines (`feedback_auth0_spa_setup.md`): callback path must match `redirect_uri`; per-API authorization grant required on the Auth0 dashboard; dual env vars required.

## Data Storage

**Databases:**
- **PostgreSQL 16** — primary store. Schema lives in `server/db/schema.ts`. Tables: `users`, `cities`, `photos`, `notifications`.
  - Connection: `pg.Pool` with `connectionString: env.DATABASE_URL` (`server/db/client.ts:6`). Single shared pool reused via the Drizzle `db` export.
  - ORM: `drizzle-orm/node-postgres` with `{ schema }` so query helpers are typed.
  - Connection string format: `postgres://timeline:<pw>@<host>:5432/timeline`. Dev defaults to `localhost:5432`; prod resolves `postgres` (Docker DNS) inside the compose network.
  - Migrations: `server/db/migrations/` — `0000_panoramic_deathbird.sql` (initial), `0001_cities_deferrable_unique.sql` (hand-authored — Drizzle Kit cannot model DEFERRABLE unique constraints; see DATA-02 ownership notice in `schema.ts:1-17`), `0002_photos_v2.sql`. Applied via `bun run server/db/migrate.ts` (`db:migrate` script).
  - Drizzle error wrapping (`feedback_drizzle_pg_error_wrapping.md`): pg errors get wrapped in `DrizzleQueryError`; `err.code` is undefined but `err.cause.code` carries the SQLSTATE. `server/db/pgError.ts` unwraps this in one place.
  - Production: postgres service in `docker-compose.yml` (image `postgres:16`), data persisted via `pgdata` named volume, port publish stripped in `docker-compose.prod.yml` (`ports: []`).
  - Health: `/api/health` issues `SELECT 1` via `db.execute(sql\`select 1\`)` in `server/routes/health.ts:29`. 200 `{status: 'ok', db: 'ok'}` / 503 `{status: 'error', db: 'unreachable'}`. Errors logged to `process.stderr` (NOT in response body — T-08-05 anti-leak).

**File Storage:**
- **OCI Object Storage** — photo masters + thumbnails. Bucket `timeline-photos` with `access_type = "ObjectRead"` (anonymous GET on UUID-named objects, no listing) per `infra/terraform/storage.tf:31`.
  - SDK: `oci-objectstorage 2.131.1` + `oci-common 2.131.1` (CJS, loaded via `createRequire` in `server/oci/parClient.ts:54-55`).
  - Region: `us-sanjose-1` for the bucket. OCI hostname pattern: `https://objectstorage.${region}.oraclecloud.com/n/${namespace}/b/${bucket}/o/${objectKey}`.
  - **Upload flow** (PAR-based, `server/routes/photos.ts:47`):
    1. Client `POST /api/cities/:cityId/photos/upload-url` with `{contentType, sizeBytes}`.
    2. Server inserts `photos` row with placeholder masterKey, then mints a **5-minute write-scoped PAR** (`ObjectWrite` access type) via `createPreauthenticatedRequest`.
    3. `accessUri` is returned ONCE — client PUTs raw bytes to the returned `uploadUrl` directly to OCI (no proxy through API).
    4. Client `POST /api/photos/:id/finalize` — server downloads master via plain `fetch` (public URL), magic-byte sniffs MIME (`sniffImageMime` in `parClient.ts:148` — JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`), generates 400px thumb via sharp (EXIF stripped by default), `putObject` to thumb key, marks status=`ready`.
  - **Authentication**: `SimpleAuthenticationDetailsProvider` using PEM at `OCI_PRIVATE_KEY_PATH` (mounted via `./.oci:/app/.oci:ro` in `docker-compose.prod.yml:55-56`).
  - **CORS**: bucket-level CORS is NOT configured. Per `feedback_oci_cors_via_s3.md`, modern OCI Object Storage exposes no CORS API at any layer (Console / Native / S3-compat all fail). Bare `<img src=...>` reads don't need CORS; uploads use PARs which carry their own ACAO. `infra/terraform/storage.tf:55-61` documents that the TF `null_resource` path is deferred and `var.photos_cors_rules` is parked for future provider support.
  - Test seam: `__setOciClientForTest(mock)` in `parClient.ts:40`. Routes import via `getOciClient()` so tests inject a `FAKE_OCI` without OCI creds. Critical for CI: `feedback_we_dont_need_the_mock_is_usually_wrong.md` — even unrelated test files MUST inject the mock when the route's import graph touches `getOciClient()`.

**Container Registry:**
- **OCIR (Oracle Container Registry)** at `${OCIR_REGION_CODE}.ocir.io` — production registry for the built image. CI defaults `OCIR_REGION_CODE=sjc` (3-letter region code, not `us-sanjose-1`).
  - Repo: `${OCI_NAMESPACE}/timeline-revamp` (set via `vars.OCI_NAMESPACE` in `.github/workflows/deploy.yml:41`).
  - Login: `docker/login-action@v4` with `username: vars.OCIR_USER` and `password: secrets.OCIR_AUTH_TOKEN` (auth token, NOT OIDC — OIDC trust is deferred per `feedback_oci_oidc_trust_schema_drift.md`).
  - Username format: `<namespace>/<identity-domain>/<user>` (e.g. `axkyqw8tpzg0/Default/usbryanchlam@gmail.com`), NOT the legacy `<ns>/oracleidentitycloudservice/<email>` form (`feedback_ocir_username_format.md`).

**Caching:**
- **Nginx `proxy_cache`** on the VM for the public reel surface. Zone `public_reel` (10MB keys, 1GB max, 24h inactive) in `ops/nginx/timeline.conf:24`. Cache key: `$scheme$host$uri`.
  - `/u/:handle` SPA HTML: 5min TTL on 200, 1min on 404.
  - `/api/public/u/:handle` JSON: 5min TTL on 200, 1min on 404. Matches app-layer `Cache-Control` headers in `server/routes/publicReel.ts:53,121`.
  - `proxy_cache_lock on` + `proxy_cache_use_stale error timeout updating` for thundering-herd protection.
  - `proxy_cache_bypass $http_x_no_cache` ships now for future owner-active invalidation (v2 D-20).
  - `/api/*` (except `/api/public/u/`) is uncached pass-through — `Authorization` header is forwarded.
  - `/assets/*` (hash-fingerprinted Vite output) gets 1y immutable Cache-Control overlay; proxied to API container (which serves `dist/` via Hono `serveStatic`).

## Authentication & Identity

**Auth Provider:**
- **Auth0 Universal Login** — see APIs section above.
  - Frontend: `Auth0Provider` mounted ONLY in `AppLayout` route subtree (`src/routes/AppLayout.tsx`). Public reel routes (`/`, `/u/:handle`) do NOT import the SDK — keeps the auth chunk out of the public bundle.
  - Frontend access token usage: `src/auth/useApi.ts:11` returns a `fetch`-shaped function that calls `getAccessTokenSilently()` and attaches `Authorization: Bearer <token>` on every call.
  - Backend middleware order (`server/index.ts:74-89`): `requireJwt` THEN `lazyProvisionUser` — the second reads `c.var.auth0Sub` set by the first.
  - First-visit user provisioning: `server/auth/lazyProvision.ts:32` lazy-inserts a `users` row keyed by immutable `auth0_sub` claim on first authenticated `/api/me` hit. Race condition acknowledged but not mitigated (single-user-flow v1).
  - Handle picker gating: nullable `users.handle` column. After signup, frontend `HandlePickerGate` opens `<HandlePickerModal>` (native `<dialog>` via `showModal()`) until a handle is claimed. Server validates via `server/handles/validate.ts` (regex `^[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])?$`, reserved-words check). Shared frontend↔backend via `@server/handles/*` Vite alias (narrow-door; the only server-imported module allowed in the frontend bundle — see `vite.config.ts:21-30`).
  - Dialog quirk: `feedback_dialog_double_esc.md` — Chromium's close-watcher closes native dialogs on the second Esc; pair `cancel` preventDefault with a document-level keydown capture-phase handler.

## Monitoring & Observability

**Error Tracking:**
- None. No Sentry / Datadog / Honeycomb integration.

**Logs:**
- `process.stderr` / `process.stdout` only (no `console.log` per `coding-style.md` no-console rule).
- Custom Hono request logger in `server/index.ts:32-39` writes `[<requestId>] <method> <path> <status> <ms>ms` to stderr per request.
- Request IDs via `hono/request-id` (`server/index.ts:26`) — reads inbound `X-Request-Id` or generates `crypto.randomUUID()`, echoes on response.
- Errors thrown through `app.onError` (`server/index.ts:102-110`): `HTTPException` re-emitted verbatim; surprises log full stack to stderr with request id, return `{error: 'internal_error', request_id}` to the client (no path leakage).
- VM-side log access: `docker compose logs api` (single container, single stream).

## CI/CD & Deployment

**Hosting:**
- **OCI Ampere A1 Flex VM** at `timeline.bryanlam.dev` (https://timeline.bryanlam.dev/, live since Phase 9).
- VM provisioned by `infra/terraform/compute.tf` — 4 OCPU / 24GB RAM, Ubuntu 22.04 aarch64.
- Reserved public IP via `oci_core_public_ip` (`compute.tf:61`) — survives instance recreation.

**CI Pipeline:**
- **GitHub Actions** — single workflow at `.github/workflows/deploy.yml`. Triggers:
  - `pull_request` → verify only (typecheck + test, NO push).
  - `push: main` → verify + build-and-push image tagged `main-<sha>` and `:latest` to OCIR, NO deploy.
  - `push: tags v*` → verify + build-and-push `vX.Y.Z` tag + **deploy to VM**.
  - `workflow_dispatch` with `tag` input → deploy a previously-built `vX.Y.Z` (rollback path, skips verify).
- **Tag-match guard** (`deploy.yml:108`): `vX.Y.Z` must equal `v$(node -p "require('./package.json').version")` — catches "tagged but forgot to bump" mistakes.
- **CI Postgres service**: `postgres:16` sidecar (`deploy.yml:48`) so integration tests can hit a live DB (`bun run db:migrate` followed by `bun run test`).
- **Stub Auth0 env in CI**: `AUTH0_DOMAIN=test.example.auth0.com`, `AUTH0_AUDIENCE=https://api.test.example.com` set in `verify.env` — server `env.ts` Zod parse runs at module load time and would `process.exit(1)` otherwise (`feedback_module_load_env_validation_blocks_ci.md`).
- **Multi-arch build**: `docker/setup-qemu-action@v4` + `docker/setup-buildx-action@v4` target `linux/arm64` only (Ampere A1).
- **VM deploy**: `appleboy/scp-action@v1` syncs `docker-compose.yml,docker-compose.prod.yml` then `appleboy/ssh-action@v1` runs `compose pull api`, `run --rm api bun run db:migrate`, `compose up -d`, `image prune -f`, `docker logout`.
- **Environment gate**: `environment: production` triggers manual reviewer approval. `concurrency.group: deploy-prod` + `cancel-in-progress: false` queues deploys (never cancels mid-flight).
- **Smoke test**: `curl --retry 5 --retry-delay 5 -fsSL https://timeline.bryanlam.dev/api/health` (`deploy.yml:218`).

**Infrastructure-as-Code:**
- `infra/terraform/` — OCI VM, bucket, IAM dynamic group + policies, OIDC trust users (gha_deployer, gha_pr_reader). Provider `oracle/oci ~> 6.0`, terraform `~> 1.10.0`.
- OIDC trust resource (`oci_identity_domains_identity_propagation_trust`) is DEFERRED — provider v6.37.0 returns 400 with no detail; needs provider bump (`feedback_oci_oidc_trust_schema_drift.md`). Workflow file parked at `.github/workflows/terraform.yml.deferred`.
- CORS via Terraform NOT working — `storage.tf:55-61` documents the dead end; CORS must be set via OCI Console UI as a one-time operator step. **Update**: per `feedback_oci_cors_via_s3.md` this is also wrong — CORS is unconfigurable through any OCI surface right now. Bare `<img>` reads don't need it.

## Environment Configuration

**Required env vars:**
- **Build-time (CI/Dockerfile only)**: `VITE_MAPTILER_KEY`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` — Vite-inlined into `dist/assets/*.js`.
- **Server runtime**: `DATABASE_URL`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `PORT` (default 8787), `NODE_ENV`. Validated by `server/env.ts` Zod schema at module load.
- **OCI runtime (optional in env schema; required at upload-time)**: `OCI_TENANCY_OCID`, `OCI_USER_OCID`, `OCI_FINGERPRINT`, `OCI_PRIVATE_KEY_PATH`, optional `OCI_PRIVATE_KEY_PASSPHRASE`, `OCI_REGION` (full form, e.g. `us-sanjose-1`), `OCI_NAMESPACE`, `OCI_BUCKET_NAME`. The route handlers throw on first PAR call if any are missing.

**Secrets location:**
- Local dev: `.env.local` (gitignored). OCI PEM at `~/.oci/timeline-revamp.pem` (gitignored path, referenced by `OCI_PRIVATE_KEY_PATH`).
- Production VM: `/opt/timeline-revamp/.env` + `/opt/timeline-revamp/.oci/<file>.pem`. The .oci directory is bind-mounted read-only into the API container at `/app/.oci`.
- CI: GitHub Actions secrets + repo variables.
  - **Secrets**: `OCIR_AUTH_TOKEN`, `DEPLOY_HOST`, `DEPLOY_SSH_KEY`, `VITE_MAPTILER_KEY`.
  - **Vars** (non-secret config): `OCIR_REGION_CODE` (e.g. `sjc`), `OCIR_USER` (identity-domain form), `OCI_NAMESPACE`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`.
  - GHA gotcha: secrets are read at job-start, NOT step-start. Updating a secret mid-run has no effect until the next `gh run rerun --failed` (`feedback_gha_secrets_at_job_start.md`).

## Webhooks & Callbacks

**Incoming:**
- **Auth0 redirect callback**: `${origin}/app` — handled client-side by `Auth0Provider.onRedirectCallback` (`src/auth/AuthProvider.tsx:34`). Calls `navigate(returnTo, {replace: true})` with the `returnTo` lifted from `appState`.
- No server-side Auth0 webhooks. User provisioning is lazy on first authenticated request (`server/auth/lazyProvision.ts`) — explicitly chosen over a webhook to avoid the race + public-ingress requirements.

**Outgoing:**
- OCI Object Storage REST API (via SDK) — `createPreauthenticatedRequest`, `putObject` (thumb), plain `fetch` against the bucket public URL (master download for thumbnail generation).
- Auth0 JWKS — `https://${AUTH0_DOMAIN}/.well-known/jwks.json`, cached 10 min by `jose.createRemoteJWKSet`.
- MapTiler tiles — browser-side from MapLibre GL (not server-initiated).
- BigDataCloud — browser-side from `src/geocode/bigdatacloud.ts` (server-side calls forbidden + guarded by CI meta-test).

---

*Integration audit: 2026-06-19*
