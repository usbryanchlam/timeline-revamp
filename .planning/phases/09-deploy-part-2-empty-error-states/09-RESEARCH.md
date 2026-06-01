# Phase 9: Deploy part 2 + empty/error states — Research

**Researched:** 2026-06-01
**Domain:** Tag-driven CI/CD (GHA → OCIR → SSH-deploy), production middleware (Hono request-id + onError), error/empty-state UX (MapLibre 429 fallback, upload retry, onboarding cards), pre-CI infra cleanup (cloud-init dhparam, Auth0 email custom claim)
**Confidence:** HIGH on CI/CD mechanics, Hono error middleware, Auth0 custom claim. MEDIUM on MapLibre 429 detection (status surfaced via AJAXError but version 4.6.0 regression noted upstream — current 5.24.0 behavior confirmed via docs). MEDIUM on QEMU arm64 build time estimate (10–20 min range observed across community reports).

## Summary

Phase 9 has three orthogonal subsystems and one chain of pre-CI infra cleanup:

1. **Tag-driven CI/CD** — `git tag vX.Y.Z` triggers a GHA workflow that builds an ARM64 image via QEMU, pushes it to OCIR with both `vX.Y.Z` and `latest` tags, then `appleboy/ssh-action@v1` SSHes into the OCI VM to write an `IMAGE_TAG` overlay env, `docker compose pull`, run migrations via `docker compose run --rm api bun run db:migrate`, `docker compose up -d`, and curl-smoke `/api/health`. Rollback is a `workflow_dispatch` re-run with the prior tag.
2. **Production middleware** — Add `hono/request-id` middleware + a global `app.onError` handler in `server/index.ts`. Both ship in Hono 4.x out of the box; no hand-rolling.
3. **Empty/error state UX** — Three locked sites: ERR-01 photo upload retry tile + backoff helper in `src/photos/`; ERR-03 MapTiler 429 → OSM raster fallback in `src/reel/MapCanvas.tsx` (detect via `map.on('error')` + `AJAXError.status`); ERR-04 + /app/trips empty states (cards, amber CTAs, no illustrations per DESIGN.md).
4. **Pre-CI cleanup** — F1.1 cloud-init pre-creates `/etc/letsencrypt/options-ssl-nginx.conf` + `ssl-dhparams.pem` so `nginx -t` passes on first boot; F9 Auth0 post-login Action injects `event.user.email` as a namespaced custom claim (`https://timeline.bryanlam.dev/email`) on the access token, with server-side read switching from `claims.email` to `claims['https://timeline.bryanlam.dev/email']`.

**Primary recommendation:** Three plans (09-01 GHA + OCIR push, 09-02 SSH-deploy + migrate + smoke, 09-03 middleware + cloud-init + Auth0 + error states), with pre-CI cleanup (F1.1 cloud-init, F9 Auth0 claim) bundled into 09-03 rather than a separate plan — they unblock the deploy pipeline but are small surgical changes that share the "production polish" frame with error states. Single-amber-accent and "skip illustrations on /app for consistency" are LOCKED design constraints from CONTEXT.md and DESIGN.md.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Scope discipline:**
- ERR-02 deferred to Phase 10 — needs BullMQ + Redis + MP4 render lifecycle, none of which exist in Phase 9. Phase 8 D-08 already deferred Redis to Phase 10; ERR-02 follows.
- MeRoute v2 deferred to Phase 12 (launch polish). v1 minimal (Auth0 avatar/name/email/sign-out) already shipped. Handle status, storage usage, account deletion are not deploy-critical.
- F4 Instance Principal switch deferred to post-launch hardening backlog. PEM UID-1001 chown step is already documented (F4 in `08-deploy-part-1/.continue-here.md`); the code-level switch to `InstancePrincipalsAuthenticationDetailsProvider` eliminates PEM-in-container risk but is not CI-blocking.
- /app/trips empty-state polish IN scope. UAT-reported. Treated as an extension of ERR-04 onboarding (same design vocabulary).

**CI/CD architecture (DEPLOY-03 app-code, DEPLOY-04, DEPLOY-06):**
- **Trigger model:** Tag-only deploy + main-push CI. PRs run lint/typecheck/test/build (no push). main-push runs the same plus pushes an image tagged `main-<sha>` and `latest` to OCIR (NOT deployed). A semver tag `v1.2.3` is the explicit deploy trigger — the only event that SSHes into the VM and flips images. Matches DEPLOY-04 wording.
- **Build artifact:** OCIR, ARM64-only (`linux/arm64`). Matches the Ampere A1 VM. Multi-arch deferred until a non-ARM target exists.
- **Registry auth:** OCIR auth token (Console-generated, stored as `secrets.OCIR_AUTH_TOKEN` + `vars.OCIR_USER`). NOT OIDC.
- **Deploy mechanism:** GHA SSHes into the VM via `appleboy/ssh-action`, runs `docker compose pull && docker compose up -d` with the tag pinned in an `.env` override file. SSH key stored as `secrets.DEPLOY_SSH_KEY`.
- **Migration handling:** Auto-run `db:migrate` BEFORE `up -d --build` via `docker compose run --rm api bun run db:migrate`. If migrate fails, deploy aborts (image not flipped, old container keeps serving). Schema-rollback is manual.
- **Rollback strategy:** Tag-pin rollback via `workflow_dispatch` with a tag input. Re-running with `v1.2.2` redeploys the prior image (OCIR keeps history). Recovery target <5 min. No blue/green.
- **Image tag scheme:** `vX.Y.Z` for deploys, `main-<sha>` for every main-push, `latest` mirrors the most recent main-push. Deploy step always reads the `vX.Y.Z` tag from the workflow trigger — never `latest`.

**Pre-CI infra cleanup:**
- **F1.1 nginx + certbot bootstrap chicken-egg:** Cloud-init pre-creates the two files that `ops/nginx/timeline.conf`'s TLS directives reference: `/etc/letsencrypt/options-ssl-nginx.conf` (copied from the `certbot_nginx` python package's `tls_configs/` dir) and `/etc/letsencrypt/ssl-dhparams.pem` (generated via `openssl dhparam -out ... 2048`). After this lands, `nginx -t` passes on first boot and `certbot --nginx` (not `--standalone`) works end-to-end. Cost: ~1–2 min extra cloud-init for dhparam.
- **F9 server-side `users.email` empty:** Auth0 Action injects email into access token custom claim. Auth0 Dashboard → Actions → Library → Custom → Login flow → `api.accessToken.setCustomClaim('https://timeline.bryanlam.dev/email', event.user.email)`. Server reads from the custom claim instead of the standard `email` claim. One-off backfill SQL for the existing empty row.
- **OIDC Identity Propagation Trust:** DEFERRED to its own micro-phase. App CI uses OCIR auth token (not OIDC) so the provider-pin bump + schema discovery can happen in a focused spike.

**Error / empty state UX (ERR-01, ERR-03, ERR-04, + /app/trips polish):**
- **ERR-01:** Inline tile with auto-retry + visible state + manual retry button. Failed tile: amber border + `Retrying in {N}s…` caption + spinner. Auto-retries 3 times with exponential backoff (2s, 4s, 8s — total ~14s before giving up). After 3 fails: tile shows `Upload failed. Tap to retry.` with manual retry button + dismiss (×). Backoff timing belongs in a `src/photos/retry.ts` (NOTE: project uses `src/photos/`, not `src/upload/`) const block, tunable.
- **ERR-03:** Detect MapTiler 429 via MapLibre's `map.on('error', ...)` hook. On 429 from a MapTiler tile URL: swap to OSM raster (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) and surface a top-of-map dismissible amber banner: `Map service limited; some detail reduced.` Banner persists for the session (sessionStorage flag); dismissable but re-shows on next session if rate-limit recurs.
- **ERR-04 + /app/trips empty state:** Card with copy + amber CTA, no illustration. Authenticated surfaces — DESIGN.md *allows* illustrations here (the "no illustration on public surfaces" lock is for `/` and `/u/:handle`), but we skip them for visual consistency with the public reel.
  - `/app` reel empty state: centered card. Copy: `No trips yet.` + `Add your first city to start the camera flying.` + amber `Add a city` CTA → navigates to `/app/trips`. (Already roughly in place at `src/routes/AppReelRoute.tsx:51-68` — polish copy + verify amber tokens; existing CTA copy is "Your reel will appear here." + "Add a city" — adjust to CONTEXT-locked copy.)
  - `/app/trips` 0-city empty state: top-half map (existing layout), centered card overlaid on the map's lower half. Copy: `Tap the map to add your first stop.` + small amber arrow/pin glyph pointing at the map. No CTA button (the map IS the CTA). (Replaces existing minimal pill at `TripsRoute.tsx:125-129`: "Drop a pin on the map to start your reel".)
- **DESIGN.md amber-accent rule:** All retry buttons, fallback banners, onboarding CTAs use the locked amber tokens. Single-accent rule preserved.

**DEPLOY-06 production middleware:**
- **Health endpoints:** Already shipped — `/health` (trivial) + `/api/health` (DB ping with 503-on-fail). No change.
- **Request logging:** `hono/logger` already wired in `server/index.ts:21`. Extend it to emit a request ID (`x-request-id` header; generate UUID if missing; include in log line).
- **Error middleware:** Add Hono `app.onError((err, c) => ...)` global handler.
  - Logs `err.stack` to `process.stderr` (matches the no-`console.log` rule from `coding-style.md`) with the request id.
  - Returns sanitized JSON: `{ error: 'internal_error', request_id }` (500) by default.
  - Honors `HTTPException` from Hono — uses its status + message verbatim (these are intentional, user-safe errors).
  - No stack traces in client response.
  - Request IDs propagated via `x-request-id` response header.

### Claude's Discretion

- Exact `appleboy/ssh-action` version pin, retry counts, job timeout values — pick conservative defaults; planner decides.
- Whether to gate the deploy job behind a GHA `environment: production` reviewer (similar to 8.1 TF). Default: yes, for symmetry with infra workflow.
- Test/lint commands invoked in CI: existing `bun test`, `bun run typecheck` (no `lint` script — see Validation Architecture).
- Cloud-init dhparam bit size and timing — 2048 is the documented value.
- Exact Auth0 Action JS snippet — planner adapts.
- Retry tile UI styling details below the card level (border-radius, exact spacing) — design system already specifies.

### Deferred Ideas (OUT OF SCOPE)

| Item | Reason | Target |
|---|---|---|
| ERR-02 MP4 render fail notification card | Backend (BullMQ + Redis + Puppeteer pipeline) doesn't exist yet — Phase 10 ships it | Phase 10 |
| MeRoute v2 build-out | v1 minimal already live; not deploy-critical | Phase 12 launch polish |
| F4 switch parClient.ts to InstancePrincipalsAuthenticationDetailsProvider | Security hardening; not CI-blocking | Post-launch hardening |
| F5 Path B — server-mints read PARs | Bucket is `ObjectRead`; UUID-named objects + no listing = acceptable for v1 | Post-launch hardening |
| OIDC Identity Propagation Trust + TF workflow rename | Schema discovery is a research spike | Phase 9.1 micro-phase |
| Multi-arch (amd64 + arm64) image builds | No non-ARM target yet | When a non-ARM target appears |
| Blue/green deploy | Single VM, ~2x memory cost | Out of v1 |
| Staging environment | No DNS, no second VM, no separate Auth0 tenant | Out of v1 |
| Sentry integration | Stderr + `docker compose logs api` enough for portfolio scale | Out of v1 |
| `<ReelView />` shared extraction | Code-quality housekeeping | Phase 9 lead-in nice-to-have OR Phase 12 |
| cities.test.ts split (945 → 3 files) | Past 800-line ceiling | Ongoing housekeeping |
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEPLOY-03 | GitHub Actions CI builds + pushes to OCI Container Registry on tag | Standard Stack (docker buildx, OCIR auth-token login), Architecture Pattern 1 (GHA workflow shape) |
| DEPLOY-04 | Tagged-release auto-deploy to VM (manual SSH for W8, automated by W9) | Architecture Pattern 2 (`appleboy/ssh-action@v1` envs pattern), Architecture Pattern 3 (compose pull + migrate + up) |
| DEPLOY-06 | Production health endpoint + request logging + error middleware on Hono API | Architecture Pattern 4 (`hono/request-id` + `app.onError` + `HTTPException` re-raise) |
| ERR-01 | Photo upload fail shows inline retry with exponential backoff, max 3 retries | Architecture Pattern 5 (retry tile + backoff helper, extends existing `src/photos/uploadQueue.ts`) |
| ERR-02 | MP4 render fail shows notification card | **DEFERRED to Phase 10** (CONTEXT.md scope discipline; documented in Deferred Ideas) — no research needed |
| ERR-03 | MapTiler rate-limit triggers OSM raster fallback with banner | Architecture Pattern 6 (`map.on('error')` + `AJAXError.status === 429` + style swap + sessionStorage flag) |
| ERR-04 | Authenticated `/app` with 0 cities shows onboarding card "Add your first city" | Architecture Pattern 7 (extend existing `AppReelRoute` empty branch + parallel `/app/trips` empty card) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| GHA workflow trigger (tag push) | CI/CD (GHA runner) | — | Build + push happens on GHA; deploy step delegates to VM via SSH |
| Docker image build (arm64) | CI/CD (GHA runner via QEMU) | — | Cross-architecture build needed; Ampere A1 VM is the target |
| Image push to OCIR | CI/CD (GHA runner) | — | OCIR is the artifact registry; tag = vX.Y.Z |
| SSH-deploy on VM | CI/CD (GHA → SSH) | OCI VM (Ubuntu host) | Receiver of `docker compose pull && up -d` |
| DB migration | API container (`bun run db:migrate`) | VM (orchestrated by `docker compose run --rm api`) | Migrations are app code, run inside the API image via Drizzle's migrator |
| Health endpoint | API / Backend (Hono `server/index.ts:31-32`) | — | Already shipped; deploy smoke curls it from GHA runner |
| Request ID propagation | API / Backend (`hono/request-id` middleware) | — | Server generates + echoes; client could send `x-request-id` for correlation |
| Error logging + sanitized response | API / Backend (`app.onError` in Hono) | — | Stderr per coding-style.md; sanitized JSON to client |
| Photo upload retry | Browser / Client (React component + `src/photos/retry.ts` helper) | — | Network resilience is a browser concern; existing `uploadQueue.ts` already has a `retry(id)` primitive |
| Map tile fallback (MapTiler → OSM) | Browser / Client (`MapCanvas.tsx` + new `osm-raster-style.json`) | — | Client-side detection (`map.on('error')`) and style swap |
| Empty-state cards (/app reel, /app/trips) | Browser / Client (route components) | — | Authenticated surfaces, no SSR concerns |
| Cloud-init dhparam + options-ssl-nginx.conf | OS / Infra (cloud-init runcmd) | — | Edited via `infra/cloud-init.yaml`; Terraform re-applies on `runcmd` hash change |
| Auth0 custom claim emit | External (Auth0 tenant — Actions library) | — | Configured in Auth0 dashboard, not in repo |
| Auth0 custom claim read | API / Backend (`server/auth/jwt.ts` Auth0Payload + `lazyProvision.ts`) | — | Server now reads `claims['https://timeline.bryanlam.dev/email']` |

## Standard Stack

### Core (CI/CD)

| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `actions/checkout` | `v4` | Source checkout in GHA | Standard first step; already used in `terraform.yml.deferred` |
| `docker/setup-qemu-action` | `v3` | Enable QEMU for arm64 cross-build on ubuntu-latest | Mandatory when the target arch differs from runner arch [VERIFIED: docker/buildx docs] |
| `docker/setup-buildx-action` | `v3` | Set up `docker buildx` builder | Mandatory for multi-platform builds + cache export [VERIFIED: docker docs] |
| `docker/login-action` | `v3` | OCIR registry login | Cleaner than raw `docker login` script step; respects masking [CITED: docker docs] |
| `docker/build-push-action` | `v6` | Build + push with cache | Wraps buildx; native cache-to/cache-from support [CITED: docker docs] |
| `appleboy/ssh-action` | `v1.2.0` (latest v1 line) | SSH from runner to OCI VM | De-facto standard for GHA SSH-deploy; `envs:` option passes specific env vars cleanly [CITED: github.com/appleboy/ssh-action README] |

**Verified versions (via npm registry + GHA marketplace, 2026-06-01):**
- Docker daemon on host: `29.4.0` (sufficient — buildx ships in 19.03+)
- `bun`: `1.3.12` (runtime + test runner — matches Dockerfile `oven/bun:1-alpine`)
- `gh`: `2.87.3` (for local diagnostics — not used in workflow)

### Core (Server — Hono ecosystem)

| Library | Version (current pin) | Verified npm latest (2026-06-01) | Purpose | Why Standard |
|---------|----------------------|-----------------------------------|---------|--------------|
| `hono` | `^4.12.18` | `4.12.23` | Web framework | Already in stack [VERIFIED: package.json]; built-in `request-id` middleware + `app.onError` API [CITED: hono.dev/docs] |
| `@hono/node-server` | `^2.0.1` | `2.0.4` | Node/Bun adapter | Already in stack |
| `hono/request-id` | bundled with `hono@4` | — | x-request-id middleware | Drop-in; `c.get('requestId')` exposes the ID for use in handlers and onError [CITED: hono.dev/docs/middleware/builtin/request-id] |
| `hono/http-exception` | bundled with `hono@4` | — | Re-throwable HTTP errors with status + message | Honored by `app.onError` via `err.getResponse()` [CITED: hono.dev/docs/api/exception] |

### Core (Client — MapLibre + photo retry)

| Library | Version (current pin) | Verified npm latest (2026-06-01) | Purpose | Why Standard |
|---------|----------------------|-----------------------------------|---------|--------------|
| `maplibre-gl` | `^5.0.0` | `5.24.0` | Map renderer | Already in stack [VERIFIED: package.json]; exposes `AJAXError` class with `status` + `statusText` on tile-load errors [CITED: maplibre.org/maplibre-gl-js/docs/API/classes/AJAXError/] |
| `p-limit` | `7.3.0` (pinned) | — | Concurrency semaphore inside uploadQueue.ts | Already in stack |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crypto.randomUUID()` | Web Standards (Node 19+, Bun 1+) | Request ID generation | When `x-request-id` header absent on inbound request |
| `openssl dhparam` | Ubuntu 22.04 default | Generate 2048-bit DH params for nginx TLS | Once at VM bootstrap (cloud-init runcmd) |
| `python3-certbot-nginx` apt pkg | Ubuntu 22.04 jammy | Ships `options-ssl-nginx.conf` template at `/usr/lib/python3/dist-packages/certbot_nginx/_internal/tls_configs/` | Source for cloud-init copy step |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `appleboy/ssh-action` | Self-managed SSH script via `ssh-agent` + raw `ssh ubuntu@vm '...'` | More transparent but more boilerplate; loses `envs:` masking convenience. Reject — community standard adopted. |
| QEMU arm64 cross-build on `ubuntu-latest` | Self-hosted Ampere A1 runner (native arm64) | Native runner = 5–10x faster build but adds infra to manage [CITED: blacksmith.sh blog]. Reject for v1 — QEMU build estimated 8–15 min on this app's bundle size; acceptable. Revisit in Phase 12 if iteration loop hurts. |
| `docker/build-push-action` | Raw `docker buildx build --push` script step | Action provides nicer cache abstractions + secret masking. Adopt action. |
| `hono/request-id` middleware | Hand-rolled UUID middleware | No reason to hand-roll — built-in does exactly what's needed [CITED: hono.dev/docs/middleware/builtin/request-id]. |
| Auth0 Action custom claim (F9) | Server-side `/userinfo` call on first provision | Custom claim is declarative + zero extra HTTP per request; `/userinfo` adds a network hop per first-login. Adopt custom claim per CONTEXT.md. |
| Hand-rolled MapTiler 429 fetch interception via `transformRequest` | `map.on('error')` + `e.error instanceof AJAXError && e.error.status === 429` | Cleaner — `transformRequest` only sees outbound; error event sees inbound status [VERIFIED: MapLibre API docs]. Adopt event listener. |

**Installation (CI/CD step — no new package.json deps for the workflow; all GHA actions are pulled by `uses:`).**

For the cloud-init copy, no install needed — the source file ships with the existing `python3-certbot-nginx` package already in `infra/cloud-init.yaml:50`.

**Version verification (npm registry, 2026-06-01):**
- `hono@4.12.23` (currently pinned `^4.12.18` — minor drift, safe)
- `@hono/node-server@2.0.4` (currently pinned `^2.0.1` — patch drift, safe)
- `maplibre-gl@5.24.0` (currently pinned `^5.0.0` — already 5.x; check existing render after `bun install` if upgrading)

## Architecture Patterns

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│  Developer Laptop                                                       │
│  $ git tag v0.x.0 && git push --tags                                    │
└────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│  GitHub Actions runner (ubuntu-latest, x86_64)                         │
│                                                                         │
│  Trigger: on.push.tags[v*]                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Job: verify  (PR + push: main + tag)                             │  │
│  │   bun install --frozen-lockfile                                  │  │
│  │   bun run typecheck                                              │  │
│  │   bun test                                                       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Job: build-and-push  (push: main + tag)                          │  │
│  │   - Tag-match guard: $REF_NAME === package.json.version          │  │
│  │   - QEMU setup → buildx setup → docker login OCIR                │  │
│  │   - buildx build --platform=linux/arm64 --push \                 │  │
│  │       --tag <region>.ocir.io/<ns>/timeline-revamp:vX.Y.Z         │  │
│  │       --build-arg VITE_MAPTILER_KEY=... (4 VITE_* args)          │  │
│  │       --cache-from / --cache-to type=gha                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Job: deploy  (tag only, environment: production reviewer-gate)   │  │
│  │   - appleboy/ssh-action@v1                                       │  │
│  │     envs: IMAGE_TAG (= $REF_NAME)                                │  │
│  │     script:                                                       │  │
│  │       set -euo pipefail                                          │  │
│  │       cd /opt/timeline-revamp                                    │  │
│  │       echo "IMAGE_TAG=$IMAGE_TAG" > /opt/timeline-revamp/.env.tag│  │
│  │       docker login <region>.ocir.io ...                          │  │
│  │       docker compose -f compose.yml -f compose.prod.yml \        │  │
│  │           --env-file .env --env-file .env.tag pull               │  │
│  │       docker compose ... run --rm api bun run db:migrate         │  │
│  │       docker compose ... up -d                                   │  │
│  │       docker image prune -f                                      │  │
│  │   - curl --retry 5 --retry-delay 5 -fsSL \                       │  │
│  │         https://timeline.bryanlam.dev/api/health                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼ SSH (port 22, key from secrets.DEPLOY_SSH_KEY)
┌────────────────────────────────────────────────────────────────────────┐
│  OCI Ampere A1 VM (64.181.252.226, Ubuntu 22.04 arm64)                 │
│                                                                         │
│  ┌────────────────────────────────────────┐                            │
│  │ nginx (host)                            │                            │
│  │   :443 → 127.0.0.1:8787 (api)          │                            │
│  └────────────────┬───────────────────────┘                            │
│                   ▼                                                     │
│  ┌────────────────────────────────────────┐                            │
│  │ docker compose stack                    │                            │
│  │   api:   pulled from OCIR :vX.Y.Z      │                            │
│  │           Hono + Vite dist/ + dh         │                            │
│  │           - hono/request-id mw          │                            │
│  │           - hono/logger (extended)      │                            │
│  │           - app.onError (DEPLOY-06)     │                            │
│  │           - reads Auth0 custom claim    │                            │
│  │             'https://timeline.bryanlam.dev/email' (F9)               │
│  │   postgres: persists pgdata vol          │                            │
│  └────────────────────────────────────────┘                            │
└────────────────────────────────────────────────────────────────────────┘
```

```
┌────────────────────────────────────────────────────────────────────────┐
│  Browser (iPhone Safari / Chrome — authenticated /app/ surfaces)        │
│                                                                         │
│  AppReelRoute (0 cities)  →  Empty card + "Add a city" amber CTA       │
│                                  ↓                                      │
│  TripsRoute (0 cities)    →  Map + overlaid "Tap to add" card          │
│                                                                         │
│  Photo upload (DATA-05)   →  uploadQueue.ts (Phase 6)                  │
│                              + new retry.ts ([2000, 4000, 8000] ms)    │
│                              auto-retry transient (network/5xx/429)    │
│                              terminal (4xx other) → manual retry tile  │
│                                                                         │
│  MapCanvas (any reel)     →  map.on('error', e => {                    │
│                                if (e.error instanceof AJAXError        │
│                                    && e.error.status === 429           │
│                                    && url.includes('maptiler')) {      │
│                                  map.setStyle(osmRasterStyle)          │
│                                  showFallbackBanner()                  │
│                                  sessionStorage.setItem(KEY, '1')      │
│                                }                                        │
│                              })                                         │
└────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
.github/
└── workflows/
    ├── deploy.yml                       # NEW — verify + build-push + deploy jobs
    └── terraform.yml.deferred            # untouched (separate micro-phase)

infra/
├── cloud-init.yaml                       # EDIT — add 4 runcmd steps (Pattern 8)
└── DEPLOY.md                             # EDIT — add ## CI/CD section (Pattern 9)

server/
├── index.ts                              # EDIT — add requestId + onError + extended logger
└── auth/
    ├── jwt.ts                            # EDIT — Auth0Payload reads custom-claim namespace
    └── lazyProvision.ts                  # EDIT — reads new c.var.auth0Email value

src/
├── photos/
│   ├── retry.ts                          # NEW — backoff schedule + transient/terminal classifier
│   ├── uploadQueue.ts                    # EDIT — wire retry helper into runOne wrapping
│   └── RetryTile.tsx                     # NEW — retry tile UI (or fold into existing UploadGrid)
├── reel/
│   ├── mapStyle.ts                       # EDIT — export both maptiler + osm style URLs/objects
│   ├── osmRasterStyle.ts                 # NEW — parallel raster-source style definition
│   └── MapCanvas.tsx                     # EDIT — map.on('error') handler + style swap + banner
├── routes/
│   ├── AppReelRoute.tsx                  # EDIT — empty-state copy per CONTEXT.md
│   └── TripsRoute.tsx                    # EDIT — 0-city overlay card (replaces existing pill)
└── components/
    └── MapFallbackBanner.tsx             # NEW — top-of-map dismissible amber banner

docker-compose.prod.yml                   # EDIT — image: line reads ${IMAGE_TAG}
```

### Pattern 1: GHA workflow shape (tag-driven)

**What:** Three-job workflow gated by `on.push.tags`, `on.push.branches: [main]`, `on.pull_request`, plus `workflow_dispatch` for rollback.
**When to use:** This is the canonical shape for tag-deploy + main-CI + PR-check, matching what the project already uses for `terraform.yml.deferred`.

```yaml
# Source: https://docs.github.com/en/actions/using-workflows/triggering-a-workflow
# Verified against terraform.yml.deferred pattern in this repo.
name: deploy
on:
  pull_request:
    paths-ignore: ['infra/terraform/**', 'docs/**', '.planning/**']
  push:
    branches: [main]
    paths-ignore: ['infra/terraform/**', 'docs/**', '.planning/**']
    tags: ['v*']
  workflow_dispatch:
    inputs:
      tag:
        description: 'Image tag to redeploy (e.g. v0.1.2)'
        required: true

permissions:
  contents: read

env:
  OCIR_REGISTRY: ${{ vars.OCI_REGION }}.ocir.io
  OCIR_REPO: ${{ vars.OCI_NAMESPACE }}/timeline-revamp
```

The tag-match guard prevents the "tagged v0.1.2 but forgot to bump `package.json.version`" bug class:

```yaml
# Inside build-push job, before docker build:
- name: Verify tag matches package.json version
  if: startsWith(github.ref, 'refs/tags/')
  run: |
    set -euo pipefail
    PKG_VERSION=v$(node -p "require('./package.json').version")
    if [ "$GITHUB_REF_NAME" != "$PKG_VERSION" ]; then
      echo "::error::Tag $GITHUB_REF_NAME does not match package.json version $PKG_VERSION"
      exit 1
    fi
```

### Pattern 2: appleboy/ssh-action `envs:` for env passing

**What:** Pass specific env vars from the GHA runner's `env:` block into the remote SSH session script via a comma-separated `envs:` input.
**When to use:** Whenever the deploy script needs build-time values (image tag, registry creds) on the VM. Avoids leaking via the script body which would log secrets.

```yaml
# Source: https://github.com/appleboy/ssh-action README
- name: Deploy to OCI VM
  uses: appleboy/ssh-action@v1
  env:
    IMAGE_TAG: ${{ github.event_name == 'workflow_dispatch' && inputs.tag || github.ref_name }}
    OCIR_REGISTRY: ${{ env.OCIR_REGISTRY }}
    OCIR_REPO: ${{ env.OCIR_REPO }}
    OCIR_USER: ${{ vars.OCIR_USER }}
    OCIR_AUTH_TOKEN: ${{ secrets.OCIR_AUTH_TOKEN }}
  with:
    host: ${{ secrets.DEPLOY_HOST }}
    username: ubuntu
    key: ${{ secrets.DEPLOY_SSH_KEY }}
    port: 22
    envs: IMAGE_TAG,OCIR_REGISTRY,OCIR_REPO,OCIR_USER,OCIR_AUTH_TOKEN
    script: |
      set -euo pipefail
      cd /opt/timeline-revamp
      echo "IMAGE_TAG=$IMAGE_TAG" > .env.tag
      echo "$OCIR_AUTH_TOKEN" | docker login "$OCIR_REGISTRY" -u "$OCIR_USER" --password-stdin
      docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env --env-file .env.tag pull api
      docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env --env-file .env.tag run --rm api bun run db:migrate
      docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env --env-file .env.tag up -d
      docker image prune -f
```

**Pitfall:** All values listed in `envs:` MUST be strings (no int/bool — per appleboy README). The `script:` block runs `set -euo pipefail` so any failed step aborts; `docker compose run` migration non-zero exit cancels the `up -d` step automatically.

### Pattern 3: docker buildx for arm64 cross-build with cache

**What:** `docker/build-push-action@v6` wrapping `docker buildx build --platform=linux/arm64 --push` with GHA cache backend.

```yaml
# Source: https://docs.docker.com/build/ci/github-actions/multi-platform/
- uses: docker/setup-qemu-action@v3
  with:
    platforms: linux/arm64

- uses: docker/setup-buildx-action@v3

- name: Login to OCIR
  uses: docker/login-action@v3
  with:
    registry: ${{ env.OCIR_REGISTRY }}
    username: ${{ vars.OCIR_USER }}
    password: ${{ secrets.OCIR_AUTH_TOKEN }}

- name: Build and push
  uses: docker/build-push-action@v6
  with:
    context: .
    platforms: linux/arm64
    push: true
    tags: |
      ${{ env.OCIR_REGISTRY }}/${{ env.OCIR_REPO }}:${{ steps.tag.outputs.tag }}
      ${{ env.OCIR_REGISTRY }}/${{ env.OCIR_REPO }}:latest
    build-args: |
      VITE_MAPTILER_KEY=${{ secrets.VITE_MAPTILER_KEY }}
      VITE_AUTH0_DOMAIN=${{ vars.VITE_AUTH0_DOMAIN }}
      VITE_AUTH0_CLIENT_ID=${{ vars.VITE_AUTH0_CLIENT_ID }}
      VITE_AUTH0_AUDIENCE=${{ vars.VITE_AUTH0_AUDIENCE }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

**Build time estimate (HIGH confidence based on multiple community reports):**
- QEMU arm64 cross-build of comparable Bun + Vite app on `ubuntu-latest` runner: **8–15 min** cold, **3–6 min** warm (cache hit) [CITED: zenn.dev/135yshr Escaping QEMU Hell, blacksmith.sh blog]. Native arm64 runner would drop to ~2–3 min but adds infra to manage.
- `bun install --frozen-lockfile` + `bun run build` (vite + tsc) on QEMU is the dominant cost. Vite's bundler is JS-on-Bun, so it benefits from layer caching once `bun.lock` stabilizes.

### Pattern 4: Hono request-id + onError middleware

**What:** Use built-in `hono/request-id` middleware; chain `app.onError` AFTER routes; honor `HTTPException` via `err.getResponse()`.

```typescript
// Source: https://hono.dev/docs/middleware/builtin/request-id
//         https://hono.dev/docs/api/exception
// Verified via Context7 query 2026-06-01.

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { HTTPException } from 'hono/http-exception';

export const app = new Hono();

// Request ID middleware MUST run before logger so the log line can include it.
// hono/request-id reads an inbound X-Request-Id (custom header name configurable)
// or generates one via crypto.randomUUID(). It sets c.var.requestId AND emits
// the same value on the response's X-Request-Id header.
app.use('*', requestId());

// Custom logger that includes the request id. Replaces the bare hono/logger.
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  process.stderr.write(
    `[${c.get('requestId')}] ${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms\n`,
  );
});

// ... route mounts ...

// Global error handler runs LAST (or rather: catches uncaught throws from any
// route or middleware). HTTPException is intentional — re-emit its response
// verbatim. Other Error types are surprise crashes — sanitize.
app.onError((err, c) => {
  const requestId = c.get('requestId');
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  // Unintended throw — log stack to stderr WITH request id for correlation.
  const stack = err instanceof Error && err.stack ? err.stack : String(err);
  process.stderr.write(`[${requestId}] ERROR ${stack}\n`);
  return c.json({ error: 'internal_error', request_id: requestId }, 500);
});
```

**Pitfalls:**
- `requestId()` middleware default header name is `X-Request-Id`. Confirm the test suite asserts that exact casing (case-insensitive header names per HTTP spec, but JS code may grep literal).
- `c.var.requestId` is a string. The `c.get('requestId')` form is the typed accessor.
- `app.onError` does NOT fire for explicit `c.json({...}, 4xx)` returns from handlers — only thrown exceptions and `throw new HTTPException(...)`. Intentional 4xx returns bypass the handler entirely.

### Pattern 5: ERR-01 photo upload retry with exponential backoff

**What:** Add a `retry.ts` helper that classifies errors as transient (network/5xx/429) vs terminal (4xx other than 429, 413), and a wrapper around `runOne` in `uploadQueue.ts` that re-schedules on transient with `[2000, 4000, 8000]` ms backoff.

```typescript
// src/photos/retry.ts
// Source: project memory + Phase 6 codebase patterns
// Locked timing per CONTEXT.md.
export const BACKOFF_MS = [2000, 4000, 8000] as const;
export const MAX_AUTO_RETRIES = BACKOFF_MS.length;

export type RetryClass = 'transient' | 'terminal-too-large' | 'terminal-other';

export function classifyError(err: unknown): RetryClass {
  if (!(err instanceof Error)) return 'terminal-other';
  const msg = err.message;
  // xhrUpload reject form: `HTTP 429`, `HTTP 503`, `Network error`
  if (msg === 'Network error') return 'transient';
  const m = msg.match(/^HTTP (\d{3})$/);
  if (!m) return 'terminal-other';
  const status = Number(m[1]);
  if (status === 413) return 'terminal-too-large';
  if (status === 429 || status >= 500) return 'transient';
  return 'terminal-other';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

```typescript
// src/photos/uploadQueue.ts — extend runOne wrapping in scheduleOne
// Pseudocode insertion point (existing runOne is opaque; wrap it in a retry loop):
//
// for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
//   try {
//     await runOne(item, abortFlag);
//     return; // success
//   } catch (err) {
//     const klass = classifyError(err);
//     if (klass !== 'transient' || attempt === MAX_AUTO_RETRIES) {
//       updateItem(item.id, { kind: 'failed', reason: ... });
//       return;
//     }
//     updateItem(item.id, { kind: 'queued' /* with retry-in countdown */ });
//     await sleep(BACKOFF_MS[attempt]);
//     if (abortFlag.aborted) return;
//   }
// }
```

**Pitfalls:**
- Existing `retry(id)` in `uploadQueue.ts:130-135` is a manual-retry primitive. Auto-retry must NOT call it (would reset progress); auto-retry is internal to `scheduleOne`.
- `abortFlag.aborted` is shared with `cancelAll()` — the retry loop must check between sleeps.
- UI state during backoff: extend `UploadStatus` with `{ kind: 'retrying'; nextAttemptAt: number; attempt: number }` so the tile can show `Retrying in {N}s…` countdown.

### Pattern 6: ERR-03 MapTiler 429 detection + OSM raster fallback

**What:** Listen on `map.on('error')`; check `e.error instanceof AJAXError && e.error.status === 429`; if URL contains `api.maptiler.com`, swap to an OSM raster style and emit a top-of-map amber banner. SessionStorage flag prevents re-trigger spam.

```typescript
// src/reel/MapCanvas.tsx (extension)
// Source: https://maplibre.org/maplibre-gl-js/docs/API/classes/AJAXError/
//         https://maplibre.org/maplibre-gl-js/docs/API/interfaces/ErrorEvent/
// MapLibre 5.x: AJAXError exposes status + statusText on ErrorEvent.error.
import { AJAXError } from 'maplibre-gl';

const FALLBACK_KEY = 'map-fallback-active';

map.on('error', (e) => {
  // ErrorEvent.error is an AJAXError for tile-load failures.
  if (!(e.error instanceof AJAXError)) return;
  if (e.error.status !== 429) return;
  // Only swap on a MapTiler 429 — OSM 429 is an OSM-tier issue we can't fall further.
  if (!e.error.url.includes('api.maptiler.com')) return;

  if (sessionStorage.getItem(FALLBACK_KEY)) return; // already swapped this session

  sessionStorage.setItem(FALLBACK_KEY, '1');
  map.setStyle(OSM_RASTER_STYLE, { diff: false });
  // Notify parent via callback or event so MapFallbackBanner renders.
  onFallbackActivated?.();
});
```

```typescript
// src/reel/osmRasterStyle.ts
// Source: https://wiki.openstreetmap.org/wiki/Tile_servers (tile.openstreetmap.org policy)
// Attribution: required per OSM policy.
export const OSM_RASTER_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'osm', type: 'raster', source: 'osm' },
  ],
} as const;
```

**Pitfalls:**
- MapLibre's vector → raster style switch via `map.setStyle(style, { diff: false })` requires `diff: false` because the source TYPE differs (vector vs raster) — diff mode would try to mutate the existing vector source and crash [VERIFIED: maplibre-gl-js docs].
- `e.error.url` is the requested URL; substring-match `api.maptiler.com` to distinguish MapTiler errors from MapLibre internal demotiles errors.
- OSM's tile-server fair-use policy forbids high-volume apps. For a portfolio site at trickle traffic, occasional fallback is fine; if traffic ever scales, switch to a self-hosted tileserver-gl (already in v2 backlog).
- `AJAXError` IS exported from `maplibre-gl` as a class [VERIFIED: maplibre-gl-js API docs]. Do not use `instanceof` checks on duck-typed Error objects.
- **Version regression note [MEDIUM confidence — surfaced in upstream issue maplibre/maplibre-gl-js#4613]:** in MapLibre 4.6.0, 404 errors stopped emitting on `map.on('error')`. Project pins `^5.0.0` (current 5.24.0); 429 emit behavior is reportedly intact in 5.x but verify with a single integration test that blocks the MapTiler URL and asserts the error event fires.

### Pattern 7: Empty-state cards (ERR-04 + /app/trips polish)

**What:** Centered card with copy + amber CTA in `AppReelRoute` for 0 cities; map-overlay card with copy + amber pin glyph in `TripsRoute` for 0 cities. No illustrations — DESIGN.md allows them on `/app` but CONTEXT.md locks "skip for visual consistency."

```tsx
// src/routes/AppReelRoute.tsx — empty branch (replaces existing 51-68 block)
// Existing copy: "Your reel will appear here." + "Add a city"
// CONTEXT-locked copy: "No trips yet." + "Add your first city to start the camera flying." + "Add a city"
if (cities.length === 0) {
  return (
    <div className="app-reel-host h-[100dvh] bg-bg flex items-center justify-center p-6">
      <div className="space-y-4 text-center max-w-sm">
        <h2 className="text-display text-2xl">No trips yet.</h2>
        <p className="text-ink-mute">Add your first city to start the camera flying.</p>
        <Link
          to="/app/trips"
          className="inline-block bg-amber-500 text-black px-4 py-2 rounded-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Add a city
        </Link>
      </div>
    </div>
  );
}
```

```tsx
// src/routes/TripsRoute.tsx — 0-city overlay (replaces existing 125-129 glass-pill)
{empty && (
  <div className="absolute inset-x-0 bottom-6 mx-auto w-max max-w-[90%]
                  bg-bg-elev border border-line rounded-2xl px-5 py-4 text-center
                  shadow-xl pointer-events-none">
    <p className="text-ink mb-1">Tap the map to add your first stop.</p>
    <span aria-hidden="true" className="inline-block text-amber-500 text-xl">↑</span>
  </div>
)}
```

**Pitfalls:**
- DESIGN.md line 238 explicitly permits a single Lucide line-icon on `/app` empty states; CONTEXT.md voluntarily skips even that for visual consistency. Don't re-introduce the line-icon.
- "Amber CTA" means `bg-amber-500 text-black` per DESIGN.md `--amber-500: #FFD470` token (the PRIMARY accent). `bg-amber-500` is already established in the existing AppReelRoute code (line 61) — reuse, don't fork.

### Pattern 8: Cloud-init F1.1 fix

**What:** Add 4 lines to `infra/cloud-init.yaml` runcmd that pre-create `options-ssl-nginx.conf` and `ssl-dhparams.pem` so `nginx -t` passes on first boot.

```yaml
# infra/cloud-init.yaml — append to runcmd after the existing nginx cache dir block
# Source: F1.1 workaround documented in .continue-here.md
# Source: certbot-nginx Ubuntu package ships template at this exact path (verified
#         in .continue-here.md F1.1 against Ubuntu 22.04 jammy).

  # --- Pre-create certbot TLS template files (F1.1 bootstrap chicken-egg) ---
  # ops/nginx/timeline.conf carries certbot's TLS directives committed back via
  # Option A (08-02 step 9). On a fresh VM these reference files that only exist
  # AFTER certbot has run — chicken-and-egg. Pre-create them here so `nginx -t`
  # passes on first boot and `certbot --nginx` works end-to-end without the
  # `--standalone` workaround.
  - install -d -m 0755 /etc/letsencrypt
  - cp /usr/lib/python3/dist-packages/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf /etc/letsencrypt/options-ssl-nginx.conf
  - chmod 0644 /etc/letsencrypt/options-ssl-nginx.conf
  # 2048-bit DH params, ~30–90s on Ampere A1 (arm64 OpenSSL is fast).
  - openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
  - chmod 0644 /etc/letsencrypt/ssl-dhparams.pem
```

**Idempotency:** `cp` overwrites; `openssl dhparam` overwrites. Re-running cloud-init (e.g. via `terraform taint`) produces the same files. The certbot_nginx package's template is identical across patch releases of certbot 1.x on jammy.

**Timing:**
- `apt-get install -y python3-certbot-nginx` runs in the `packages:` module (line 49–50) BEFORE `runcmd` starts. So the template path exists when `cp` runs.
- `openssl dhparam` runs synchronously; cloud-init blocks. On Ampere A1 (arm64), measured at ~30–90s for 2048-bit per `.continue-here.md` F1.1.
- nginx is NOT started by cloud-init (no `systemctl enable --now nginx` in current cloud-init.yaml) — the operator does this in DEPLOY.md step 4. So even if the template files aren't yet in place when nginx is enabled, the operator can re-run; but with this fix in place, the manual `certbot certonly --standalone` workaround in DEPLOY.md becomes unnecessary.

### Pattern 9: Auth0 post-login Action for email custom claim (F9)

**What:** Auth0 Dashboard → Actions → Library → Custom → "Login flow" Action. JS code injects `event.user.email` into the access token under a namespaced custom claim. Server reads from the namespace instead of `claims.email`.

```javascript
// Auth0 Action: inject-email-into-access-token
// Source: https://auth0.com/docs/customize/actions/triggers/post-login/event-object
//         https://auth0.com/docs/get-started/apis/scopes/sample-use-cases-scopes-and-claims
// Namespace MUST be a URL (Auth0 reserves un-namespaced claims).
exports.onExecutePostLogin = async (event, api) => {
  if (event.user.email) {
    api.accessToken.setCustomClaim(
      'https://timeline.bryanlam.dev/email',
      event.user.email,
    );
  }
};
```

```typescript
// server/auth/jwt.ts — extend Auth0Payload + extract from namespace
// Current code (line 44-47):
//   interface Auth0Payload extends JWTPayload {
//     sub?: string;
//     email?: string;
//   }
//   ...
//   c.set('auth0Email', p.email ?? '');
//
// New code:
const EMAIL_CLAIM = 'https://timeline.bryanlam.dev/email';

interface Auth0Payload extends JWTPayload {
  sub?: string;
  email?: string;                              // standard claim — kept for back-compat fallback
  [EMAIL_CLAIM]?: string;                      // index-signature can't reference computed; see below
}

// In requireJwt body, replace line 60:
const email = (payload as Record<string, unknown>)[EMAIL_CLAIM] as string | undefined
  ?? p.email
  ?? '';
c.set('auth0Email', email);
```

**Backfill SQL** (one-off, for the existing bryan test user with empty `email`):

```sql
-- Run via: docker compose ... exec postgres psql -U timeline timeline -c "..."
-- Replace <known-good-email> with the actual email from Auth0 dashboard for the user.
UPDATE users SET email = '<known-good-email>'
WHERE email = '' AND auth0_sub = '<the-bryan-test-sub>';
```

**Pitfalls:**
- Namespace MUST be a URL with a scheme (Auth0 rejects bare strings like `email`). `https://timeline.bryanlam.dev/email` is acceptable [CITED: auth0.com/docs/get-started/apis/scopes/sample-use-cases-scopes-and-claims].
- The Action must be attached to the Login flow in Auth0 Dashboard (drag onto the trigger pipeline) — creating the Action is not enough.
- Existing JWTs in flight at deploy time won't have the new claim until next login; the fallback `?? p.email` handles existing valid tokens for the brief migration window.
- DB column constraint: `users.email` is `NOT NULL`. CONTEXT.md leaves this constraint alone (relaxation to NULL is out of scope per `.continue-here.md` F9 last bullet). The Action's `if (event.user.email)` guard means we still insert empty string if the user has no email in their Auth0 profile — but no current user does.

### Anti-Patterns to Avoid

- **`docker login -p <token>` in plaintext script step:** logs the token. Use `--password-stdin` with `echo "$OCIR_AUTH_TOKEN" | docker login ... --password-stdin`. The `docker/login-action@v3` for the runner side, and `--password-stdin` form on the VM side.
- **Running `db:migrate` AFTER `up -d`:** Race condition — new container starts with old schema, fails, gets restarted by Docker. Always run migrations BEFORE `up -d`. The `docker compose run --rm api bun run db:migrate` form spins up a one-shot container, runs the script, exits; only on success does `up -d` flip the long-lived container.
- **Hand-rolling request-id middleware:** `hono/request-id` exists, handles UUID gen + header echo + custom-header-name + custom-generator. Don't duplicate.
- **Catching all errors in route handlers and returning sanitized JSON:** Skips `app.onError`. Throw `HTTPException(404, { message: 'Not found' })` for intentional errors; let unexpected throws bubble to `onError` for logging.
- **Running `bun install` on the VM during deploy:** Wastes time + breaks reproducibility. The image already contains `node_modules` from the deps stage. Deploy pulls the image; no install needed on VM.
- **Using `latest` tag in the deploy step:** Defeats rollback. Always pin to `$IMAGE_TAG=$REF_NAME` so rollback by re-running with an older tag works.
- **MapLibre style swap without `{ diff: false }`:** Vector → raster source-type mismatch crashes diff mode.
- **`certbot --nginx` on a config that references not-yet-existent TLS template files:** Hit by Phase 8 cutover; Pattern 8 fixes this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request ID generation + header echo | Custom UUID middleware | `hono/request-id` built-in | Already configurable (limitLength, headerName, custom generator); zero deps to add [CITED: hono.dev] |
| SSH-deploy from GHA | Raw ssh-agent + ssh script | `appleboy/ssh-action@v1` | Mature community action; clean `envs:` masking; trusted in production by thousands of projects |
| arm64 cross-build | Native arm64 runner setup | QEMU via `docker/setup-qemu-action` | Native runner has infra cost; QEMU acceptable for a single-arch portfolio app |
| Image cache between builds | Custom S3 cache | `cache-from / cache-to: type=gha` | Built-in GitHub-hosted cache; zero setup |
| MapLibre 429 detection via fetch interception | `transformRequest` patching | `map.on('error')` + `AJAXError.status` | Library already exposes the status code on error events |
| OSM tile policy compliance | Self-hosted nginx proxy | Direct tile.openstreetmap.org with attribution | Portfolio-scale traffic is well within OSM tile policy at the trickle level expected |
| Auth0 email lookup | `/userinfo` HTTP call on every first-provision | Post-login Action custom claim | Declarative; runs once at token mint; zero per-request latency |
| Exponential backoff timing | Custom random-jitter algorithm | Fixed `[2000, 4000, 8000]` ms (CONTEXT-locked) | Deterministic, easy to test, well-known good pattern |
| Health-check retry on GHA runner | Custom curl loop | `curl --retry 5 --retry-delay 5` | Built-in curl primitive |
| Empty-state illustrations | Lucide line-icon, SVG illustrations | Plain text + amber CTA | DESIGN.md + CONTEXT.md lock — single accent, brutalist photographic intent |

**Key insight:** Phase 9 is mostly gluing battle-tested community libraries together (Hono middleware, docker actions, MapLibre AJAXError, Auth0 Actions). The actual code count is small; what makes it hard is the integration discipline — every piece needs to be wired in the right order with the right secrets/env vars, and the smoke battery has to catch regressions.

## Runtime State Inventory

This is primarily a feature-add phase (CI/CD pipeline + middleware + error states), but **Pattern 9 (Auth0 email custom claim) is effectively a rename-style migration** of where the email claim lives. Capture explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `users.email` row for the bryan test user is empty string (`''`, not NULL — column is NOT NULL per DATA-01). | Data migration via one-off `UPDATE users SET email = '<known-good>' WHERE email = '' AND auth0_sub = '<sub>'` — documented as SUMMARY artifact per CONTEXT.md "F9 backfill" decision, NOT automated. |
| Live service config | **Auth0 tenant Actions library** stores the new "Login flow" Action in Auth0's dashboard, not in git. The Action object and its attachment to the Login flow pipeline must be created via UI. | Manual one-time setup. Document the steps in `infra/DEPLOY.md` Auth0 Setup section (or extend the F9 followup checklist). |
| OS-registered state | **None — verified by reviewing `infra/cloud-init.yaml`, `infra/terraform/`, and the OCI VM's services.** No Windows Task Scheduler / launchd / systemd unit name embeds the renamed Auth0 claim name. Cloud-init runcmd edits are additive (new files at known paths), not registered with any OS service. | No action. |
| Secrets/env vars | The Auth0 claim namespace `https://timeline.bryanlam.dev/email` is a code-level constant (NOT a secret, NOT an env var). The new CI/CD secrets are `OCIR_AUTH_TOKEN`, `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, and the `OCIR_USER` / `OCIR_REGISTRY` vars — these are NEW additions, not renames. | Add to GitHub repo secrets/vars before first deploy. Document in `infra/DEPLOY.md` GitHub Secrets table. |
| Build artifacts / installed packages | **None.** No installed pip/npm package embeds the Auth0 namespace string; no compiled binary; no Docker registry tag pattern needs purging. The `users.email` data update is a row-update, not a column-rename. | No action. |

**The canonical question:** *After every file in the repo is updated for the Auth0 namespace switch, what runtime systems still have the old "standard email claim" behavior?*

Answer: existing valid JWT tokens in flight. The `?? p.email` fallback in `jwt.ts` handles this for the brief migration window. New tokens minted after the Action attaches will carry the namespaced claim. Long-lived sessions (Auth0 default 24h) will eventually rotate.

## Common Pitfalls

### Pitfall 1: QEMU arm64 build time explosion
**What goes wrong:** Cold build on a fresh GHA runner takes 15+ min; iteration becomes painful.
**Why it happens:** QEMU instruction translation overhead is 5–20x; every `bun install` byte goes through the emulator.
**How to avoid:** Use `cache-from: type=gha` / `cache-to: type=gha,mode=max` to persist BuildKit layers across runs. The `deps` stage (which runs `bun install --frozen-lockfile`) caches as long as `bun.lock` is unchanged. Warm builds should drop to 3–6 min.
**Warning signs:** `Run docker build` step exceeds 10 min on a re-run with unchanged lockfile.

### Pitfall 2: `appleboy/ssh-action` script silently continues on individual command failure
**What goes wrong:** A migration error doesn't fail the deploy; old container stays serving but DB is half-migrated.
**Why it happens:** Default shell behavior is to continue on non-zero exit.
**How to avoid:** Always start the `script:` block with `set -euo pipefail`. Verified pattern in this repo's `terraform.yml.deferred` lines 61, 164 (uses the same `set -euo pipefail` discipline for OIDC token exchange).
**Warning signs:** Deploy job is green but `/api/health` returns 503 or returns 200 with stale data.

### Pitfall 3: Compose `--env-file` ordering surprises
**What goes wrong:** `IMAGE_TAG` from `.env.tag` is not picked up because `.env` is read first and Compose treats keys as last-wins.
**Why it happens:** Compose merges env files in the order given; later files OVERRIDE earlier ones. Confirm the order: `--env-file .env --env-file .env.tag` is correct (tag wins).
**How to avoid:** Always put the tag-overlay file LAST. Verify in a dry-run: `docker compose -f ... --env-file ... config` prints the resolved compose with the actual `image:` line.
**Warning signs:** `docker compose pull` pulls the wrong tag or `latest`.

### Pitfall 4: OCIR auth token expiration UX
**What goes wrong:** Auth token works for months, then a deploy fails with HTTP 401 because the operator rotated/revoked the token.
**Why it happens:** OCIR auth tokens persist until manually revoked, but operators sometimes rotate them and forget GHA.
**How to avoid:** Document rotation in `infra/DEPLOY.md` (modeled after the existing "Customer Secret Key Rotation" section, lines 642-660). Set a calendar reminder if quarterly rotation is desired.
**Warning signs:** First failed deploy with `denied: BasicAuth invalid` from `docker push`.

### Pitfall 5: `app.onError` shadows intentional `c.json(error, 4xx)` only if route THROWS
**What goes wrong:** Developer expects `app.onError` to catch a route that returns `c.json({ error: 'not_found' }, 404)`; logger doesn't fire.
**Why it happens:** `c.json({}, 4xx)` is a NORMAL response; onError only fires on uncaught throws (and `HTTPException`).
**How to avoid:** For consistency, throw `HTTPException(404, { message: 'not_found' })` from route handlers when you want sanitized JSON + a log entry. For explicit 4xx with custom shape, `c.json` is fine but skips logging.
**Warning signs:** Production logs show 500s but no 4xxs; investigators wonder if traffic is "too clean."

### Pitfall 6: MapLibre `setStyle` resets ALL map state
**What goes wrong:** After 429 fallback fires, the map center/zoom/bearing resets to the style's default rather than continuing from where the user/reel was.
**Why it happens:** `setStyle(s, { diff: false })` is a full re-init.
**How to avoid:** Capture `map.getCenter() / getZoom() / getBearing() / getPitch()` before the swap; `map.once('styledata', () => map.jumpTo({ center, zoom, ... }))` after.
**Warning signs:** After fallback banner appears, the reel jumps to (0, 0) at zoom 0.

### Pitfall 7: F1.1 dhparam runs every cloud-init re-apply (1–2 min)
**What goes wrong:** `terraform taint && apply` retries cost an extra 1–2 min wall clock each time.
**Why it happens:** `openssl dhparam` is non-idempotent in cost (the output file IS idempotent, but the work is redone).
**How to avoid:** Guard with `[ -f /etc/letsencrypt/ssl-dhparams.pem ] || openssl dhparam ...` — but this only helps on a re-apply that preserves the disk, which `terraform taint` does NOT (it replaces the instance). Acceptable cost for the rare full-rebuild path. Document, don't optimize.
**Warning signs:** Operator complaints about slow VM rebuild.

### Pitfall 8: Auth0 Action attached but not deployed
**What goes wrong:** Action shows up in dashboard but `event.user.email` doesn't appear in new tokens.
**Why it happens:** Auth0 Actions have a Draft / Deployed state. After creation, you must click "Deploy" AND then drag the Action into the Login flow pipeline. Two-step trap.
**How to avoid:** Verification: log in, copy the access token from browser devtools, paste into jwt.io, look for the namespaced claim. If absent, the Action is either undeployed or unattached.
**Warning signs:** New users still get empty `users.email` post-Phase-9-deploy.

### Pitfall 9: `bun.lock` cache invalidation cliff
**What goes wrong:** Every PR changes `bun.lock` slightly (transitive bumps); GHA cache invalidates; every PR build is cold.
**Why it happens:** GHA cache key includes the lockfile hash by default in `docker/build-push-action@v6`.
**How to avoid:** Accept the cost for v1. If iteration time becomes painful, layer cache via `--cache-to=type=registry,ref=...:buildcache` instead of GHA cache — survives across PRs.
**Warning signs:** "Why does every PR build take 12 min?"

## Code Examples

(Pattern blocks above include the verified code examples; not duplicated here. All examples cite source URLs and tool-verified Hono / MapLibre / Docker patterns.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-rolled JWT-correlated request IDs | `hono/request-id` middleware | Hono 4.4+ (early 2025) | Drop hand-rolled middleware [CITED: hono.dev changelog via Context7] |
| `docker build --platform=...` raw cli | `docker/build-push-action@v6` with `cache-to: type=gha,mode=max` | docker/build-push-action v6 (mid-2025) | Better cache semantics, smaller workflow YAML |
| OIDC for OCIR | Auth token | Decision: STAY on auth token (CONTEXT.md) | OIDC is a research spike (separate micro-phase per `.continue-here.md`) |
| `appleboy/ssh-action@v0.1.x` | `appleboy/ssh-action@v1` (current v1.2.0) | Action v1.0.0 released 2023; v1.x stable line | Use `@v1` tag for auto-track within the v1 series |
| Standard `email` claim on Auth0 access tokens | Namespaced custom claim via post-login Action | Auth0 platform direction (always; surfaced as F9 issue 2026-05-30) | Server reads `claims['https://timeline.bryanlam.dev/email']` instead of `claims.email` |
| `certbot --nginx` from scratch | Pre-create TLS template files in cloud-init, then `certbot --nginx` works first-try | F1.1 fix this phase | Eliminates the `certbot certonly --standalone` workaround documented post-Phase-8 |

**Deprecated/outdated:**
- `appleboy/ssh-action@master` — never pin to master; floats. `@v1` is the recommendation.
- `docker/login-action@v2` — bump to `@v3` for latest secret-handling improvements.

## Project Constraints (from CLAUDE.md + project rules)

- **DESIGN.md is sacred.** Amber-500 (`#FFD470`) is the ONLY accent color; no green/blue/red CTAs anywhere. Single-amber rule grep-verifiable in PR.
- **No `console.log` in production code** (typescript/coding-style.md). All logging is `process.stderr.write(...)` or `process.stdout.write(...)`. The existing codebase already enforces this; new `app.onError` must follow.
- **Immutability** (typescript/coding-style.md). Retry helper produces new `UploadStatus` objects via spread; never mutate in-place. Existing `uploadQueue.ts` already follows this.
- **Zod for input validation** at system boundaries. The Auth0 claim namespace is NOT user input but is a JWT-claim namespace — validation happens via `jose.jwtVerify` (jwt.ts:53-56) which checks issuer/audience. The new claim is read after verification; no additional Zod schema needed.
- **No emojis in code or docs.** Pattern code blocks use plain text.
- **gstack `/browse` skill for web browsing.** Researcher already used WebSearch/Context7/WebFetch which is allowed; no `mcp__claude-in-chrome__*` involvement.
- **Many small files > few large files.** Recommended structure separates `retry.ts`, `osmRasterStyle.ts`, `MapFallbackBanner.tsx` into their own files rather than appending to existing modules.
- **80% test coverage** (common/testing.md). Each new module (retry.ts, error middleware, MapCanvas changes) gets unit + integration tests. Tests written first (TDD per common/testing.md).
- **No hardcoded secrets.** All OCIR / SSH / Auth0 / Maptiler keys flow through GitHub Secrets and the VM's `.env` (already gitignored per F7 fix).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | QEMU arm64 build of this app's image takes 8–15 min cold, 3–6 min warm on `ubuntu-latest` | Pattern 3 build-time estimate | Slower iteration than expected; doesn't block functionality. Mitigation: switch to native arm64 runner later if painful. |
| A2 | MapLibre 5.x emits `map.on('error')` for HTTP 429 with `AJAXError.status === 429` (the 4.6.0 regression was for 404s only) | Pattern 6 | If 429s don't surface, must fall back to `transformRequest` interception which is more invasive. Mitigation: add an integration test that blocks the MapTiler URL and asserts the error fires. [MEDIUM confidence — version 5.x behavior not directly verified via repro] |
| A3 | OCIR auth token rotation cadence: operator's choice, not enforced. CONTEXT.md doesn't specify. | Pitfall 4 | Forgotten rotation could fail a deploy weeks/months out. Mitigation: document. |
| A4 | OCIR retention policy default is "keep all tags forever" unless an auto-cleanup rule is configured. Within rollback window (assume 30 days for v1), no purge risk. | CONTEXT.md image-tag scheme | If OCIR is configured with aggressive auto-cleanup, rollback could fail. Mitigation: confirm in OCI Console there's no auto-cleanup rule active on the registry before relying on tag-pin rollback. [MEDIUM confidence — verified Oracle docs mention auto-cleanup is opt-in, not default] |
| A5 | Cloud-init `openssl dhparam` on Ampere A1 arm64 completes in 30–90s. | Pattern 8 timing | If significantly longer (e.g. 5 min+), VM provisioning UX degrades. Mitigation: timing is documented in `.continue-here.md` F1.1 as observed; if measured longer in practice, accept the cost — it runs once per VM lifetime. |
| A6 | The certbot_nginx Ubuntu 22.04 jammy package's `options-ssl-nginx.conf` template at `/usr/lib/python3/dist-packages/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf` is identical across patch releases. | Pattern 8 cp step | If a future Ubuntu patch moves the file, cloud-init fails. Mitigation: use a defensive copy with `cp -n` and a fallback `find /usr/lib/python3 -name options-ssl-nginx.conf -path '*certbot*'`. |
| A7 | Auth0 namespace `https://timeline.bryanlam.dev/email` is acceptable (the auth0.com sample doc shows `https://my-app.example.com/...` format). | Pattern 9 | If Auth0 rejects this specific namespace, Action errors at deploy time, breaking new logins. Mitigation: test in Auth0's "Try" panel against a dev user first. |
| A8 | DEFERRED items from CONTEXT.md (Path B, F4, OIDC trust, blue/green, staging, Sentry) genuinely do not need RESEARCH coverage. | Deferred Ideas table | Low — explicit user decision. |

## Open Questions

1. **OCIR auto-cleanup policy default**
   - What we know: Oracle docs mention auto-cleanup is configurable (CITED above) but don't state whether it's on by default.
   - What's unclear: Does the existing `timeline-revamp` OCIR repo (if one exists yet — repo may be created fresh by Phase 9) have any retention policy?
   - Recommendation: Have the planner add a Wave 0 verification step: `oci artifacts container repository get --repository-id <ocid>` and check `is_immutable / cleanup-policy` fields. If anything other than "no auto-cleanup," document it and either disable or set rollback window expectations accordingly.

2. **Exact `appleboy/ssh-action` v1 patch version pin**
   - What we know: `@v1` is the floating major; `@v1.2.0` is the current stable per WebSearch.
   - What's unclear: Project convention — pin to floating major (auto-bump), exact patch (lockstep), or sha (paranoid).
   - Recommendation: Pin to `@v1` (floating major within v1 line). Matches `actions/checkout@v4` convention already used in `terraform.yml.deferred`.

3. **What if the operator deploys a tag whose `package.json.version` is wrong?**
   - What we know: Pattern 1 includes a tag-match guard.
   - What's unclear: How does the operator recover from a failed deploy when the tag was created on a branch with stale `package.json`?
   - Recommendation: Document the recovery: delete the tag (`git tag -d v0.x.0 && git push --delete origin v0.x.0`), bump `package.json.version`, re-tag, re-push. Add to `infra/DEPLOY.md` ## CI/CD section as a "When tag-match guard fails" runbook.

4. **Should the deploy step ALSO push `latest` on tag, or only `vX.Y.Z`?**
   - What we know: CONTEXT.md says `latest` mirrors most recent main-push, NOT most recent tag.
   - What's unclear: Whether a tag should ALSO update `latest` (defensive — last-known-good production image is also `latest` in OCIR).
   - Recommendation: Follow CONTEXT.md literally — tag only pushes `vX.Y.Z`, never updates `latest`. Operators reading "what's the latest production version" use git tags as source of truth, not OCIR.

5. **Server-side response code for 429 → fallback path**
   - What we know: MapTiler 429 is detected on the client. Server doesn't know about it.
   - What's unclear: Should the server emit anything for analytics?
   - Recommendation: No — out of scope for v1. CONTEXT.md doesn't request analytics. Banner is the only user signal.

## Environment Availability

| Dependency | Required By | Available (operator laptop) | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Local build verification (not the GHA build) | ✓ | 29.4.0 | — |
| Bun | Local test/typecheck before tagging | ✓ | 1.3.12 | Node 25.8.0 fallback for typecheck |
| `gh` CLI | Local PR/issue introspection | ✓ | 2.87.3 | Web UI |
| node | Tag-match guard `node -p` shell step | ✓ on runner | latest LTS on ubuntu-latest | — |
| OCI tenancy with OCIR enabled | OCIR push | (verified during Phase 8.1 — namespace exists) | — | — |
| GitHub repo secrets capacity | new secrets added | ✓ (unlimited) | — | — |
| Auth0 admin access | F9 Action creation | (operator has, per Phase 8 UAT) | — | — |
| OCI VM ssh access from new key | Deploy step | NEW — operator must add the deploy public key to `~ubuntu/.ssh/authorized_keys` on the VM | — | Reuse Phase 8 SSH key (less safe — couples CI to operator identity) |

**Missing dependencies with no fallback:**
- A dedicated GHA deploy SSH key (separate from operator personal key) — operator must generate `ssh-keygen -t ed25519 -f gha-deploy-key`, append `.pub` to VM authorized_keys, paste private to `secrets.DEPLOY_SSH_KEY`. This is a new operational step the planner must surface in `infra/DEPLOY.md`.
- An OCIR auth token tied to the OCIR_USER. New token via OCI Console → Profile → Auth Tokens → Generate token.

**Missing dependencies with fallback:**
- None — all primary deps are present.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest@4.1.5` (already installed); test runner is `bun test` (per package.json) — but project actually uses `vitest run` invoked via `bun run test` |
| Config file | `vitest.config.ts` (exists at repo root) |
| Quick run command | `bun run test` (= `vitest run`) |
| Full suite command | `bun run test && bun run typecheck` |
| Lint command | **None** — project has no `lint` script. Researcher should NOT fabricate one; planner can adopt eslint if desired, but it's not CONTEXT.md-locked. |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-03 | GHA workflow tag-match guard rejects mismatched tag | unit (workflow YAML lint via `actionlint`) | `actionlint .github/workflows/deploy.yml` | ❌ Wave 0 (install actionlint as dev dep or skip; lightweight integration) |
| DEPLOY-04 | `IMAGE_TAG` env propagates correctly through `appleboy/ssh-action` `envs:` | manual / smoke (cannot unit-test the SSH action mechanics) | smoke battery — see Sampling Rate | manual |
| DEPLOY-06 | `app.onError` returns sanitized JSON for thrown Error | unit | `bun run test -- server/index.error.test.ts -t onError` | ❌ Wave 0 — new test file |
| DEPLOY-06 | `app.onError` honors HTTPException via `err.getResponse()` | unit | `bun run test -- server/index.error.test.ts -t HTTPException` | ❌ Wave 0 |
| DEPLOY-06 | `requestId` middleware echoes inbound x-request-id, generates if absent | unit | `bun run test -- server/index.requestId.test.ts` | ❌ Wave 0 |
| DEPLOY-06 | `/api/health` returns 200 after `up -d` within 60s (smoke) | integration (post-deploy curl) | `curl --retry 5 --retry-delay 5 -fsSL https://timeline.bryanlam.dev/api/health` from GHA runner | manual / runs in CI |
| ERR-01 | 3 transient failures auto-retry with [2000, 4000, 8000]ms; 4th surfaces manual retry | unit | `bun run test -- src/photos/retry.test.ts` | ❌ Wave 0 |
| ERR-01 | Terminal (413, 400-non-429) errors skip auto-retry | unit | `bun run test -- src/photos/retry.test.ts -t terminal` | ❌ Wave 0 |
| ERR-01 | Manual retry resets the auto-retry counter | unit | `bun run test -- src/photos/uploadQueue.test.ts -t manualRetryResets` | ❌ Wave 0 |
| ERR-02 | **DEFERRED to Phase 10** | — | — | — |
| ERR-03 | MapLibre 429 on MapTiler URL triggers style swap + banner; sessionStorage flag set | unit (vitest + maplibre-gl mock) | `bun run test -- src/reel/MapCanvas.fallback.test.ts` | ❌ Wave 0 |
| ERR-03 | Style swap preserves map view (center/zoom/bearing/pitch) | unit | `bun run test -- src/reel/MapCanvas.fallback.test.ts -t preservesView` | ❌ Wave 0 |
| ERR-04 | `/app` reel with 0 cities renders the CONTEXT-locked empty card + amber CTA | unit (RTL render) | `bun run test -- src/routes/AppReelRoute.test.tsx -t emptyState` | ❌ Wave 0 — extend existing test file or add new |
| ERR-04 | `/app/trips` 0-city renders the overlay card on the map (not the existing pill) | unit (RTL render) | `bun run test -- src/routes/TripsRoute.test.tsx -t emptyState` | ❌ Wave 0 |
| F1.1 | Cloud-init produces `/etc/letsencrypt/ssl-dhparams.pem` and `options-ssl-nginx.conf` post-first-boot | manual smoke (run `terraform taint && apply`, ssh, `ls -la /etc/letsencrypt/`) | `gsd-verify-work` checklist | manual |
| F9 | New JWT with custom claim populates `c.var.auth0Email` correctly | unit (extend `server/auth/jwt.test.ts`) | `bun run test -- server/auth/jwt.test.ts -t customClaimEmail` | extend existing test file |
| F9 | Fallback to standard `email` claim when custom claim absent (back-compat) | unit | `bun run test -- server/auth/jwt.test.ts -t fallbackToStandardEmail` | ❌ Wave 0 (extend) |

### Sampling Rate
- **Per task commit:** `bun run test` (full vitest suite; ~30s currently per phase-7 SUMMARY — accept the full suite at this size).
- **Per wave merge:** `bun run test && bun run typecheck`.
- **Phase gate:** Full suite green + manual smoke battery after first auto-deploy (curl `/api/health`, log into `/app`, verify request ID echo, simulate 429 via blocked URL).

### Wave 0 Gaps
- [ ] `server/index.error.test.ts` — covers DEPLOY-06 onError + HTTPException
- [ ] `server/index.requestId.test.ts` — covers DEPLOY-06 request-id
- [ ] `src/photos/retry.test.ts` — covers ERR-01 backoff + classification
- [ ] `src/reel/MapCanvas.fallback.test.ts` — covers ERR-03 style swap (or extend existing if any)
- [ ] `src/routes/AppReelRoute.test.tsx` — covers ERR-04 empty state (may not exist — Phase 6 created `AppReelRoute.tsx` without a test)
- [ ] `src/routes/TripsRoute.test.tsx` — covers /app/trips empty state polish
- [ ] Extend `server/auth/jwt.test.ts` with custom-claim cases (F9)
- [ ] `actionlint` install (dev dep) — for DEPLOY-03 workflow lint, OR skip (judgment call; `actionlint` is in `infra/DEPLOY.md` as "optional but recommended" line 38).

*(All test files listed above are NEW or extensions; no existing test file blocks Wave 0 progress.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Auth0 Universal Login (already shipped Phase 4); F9 strengthens server-side email association via custom claim (no new auth path) |
| V3 Session Management | yes | Auth0 manages sessions; server is stateless; no change in Phase 9 |
| V4 Access Control | yes | `requireJwt` + `lazyProvisionUser` middlewares unchanged |
| V5 Input Validation | yes | New retry classification uses regex `^HTTP (\d{3})$` — safe (anchored, no catastrophic backtracking). No new user-input boundaries. |
| V6 Cryptography | yes | `openssl dhparam` for nginx TLS (cloud-init); `jose` for JWT verify (unchanged); `crypto.randomUUID()` for request IDs (Web Crypto API, secure) |
| V7 Error Handling and Logging | **yes — central Phase 9 concern** | `app.onError` sanitizes response (no stack to client), logs to stderr with request ID for correlation. **Never** echo back error.message or error.stack to client. HTTPException is the only path where server-message reaches the client. |
| V9 Communication | yes | TLS via Let's Encrypt (Phase 8); F1.1 closes the bootstrap chicken-egg so future VM rebuilds maintain TLS without manual intervention |
| V10 Malicious Code | yes | All new deps (`hono/request-id`, GHA actions, etc.) are already in the trusted set or community standard with high reputation |
| V11 Business Logic | n/a | No new business rules |
| V12 Files and Resources | partial | Compose pulls images by tag — image-name spoof is mitigated by the OCIR registry path being fully qualified (`<region>.ocir.io/<ns>/timeline-revamp`); pinning to `vX.Y.Z` (not `latest`) means downgrade attacks via "retag latest to malicious" are impossible. |
| V13 API and Web Service | yes | Request ID exposes `X-Request-Id` header — this is normal and safe |
| V14 Configuration | yes | Secrets management: `OCIR_AUTH_TOKEN`, `DEPLOY_SSH_KEY`, `DEPLOY_HOST` added to GitHub Secrets. `vars` for non-secret config. Never in code. |

### Known Threat Patterns for Phase 9 stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stack trace leakage via error response | Information disclosure | `app.onError` strips stack; only `{ error: 'internal_error', request_id }` to client. |
| SSH key reuse across operator + CI | Privilege escalation | New deploy-key separate from operator key. |
| OCIR auth token in plaintext logs | Credential disclosure | Use `--password-stdin` form and `docker/login-action@v3` (masks input). |
| Tag spoofing (re-tagging an old image as v1.2.3) | Tampering | OCIR enforces tag immutability if configured; verify the registry is set to immutable tags OR document that the operator never re-tags. |
| Migration ran against wrong DB | Tampering | Migration runs inside the api container against the in-compose postgres — the only DB reachable on the internal Docker network. Compromise requires breaching the VM. |
| Request-id forgery | Spoofing (minor) | The server accepts incoming `X-Request-Id` and echoes it. Legit use — correlates client-reported issues. No security boundary depends on the request id; safe to trust. |
| Auth0 Action injection via user-controlled profile data | Tampering | `event.user.email` is Auth0-validated (cannot be self-set); CONTEXT.md handle picker for Auth0 SPA already enforces email-from-provider semantics. |
| OSM tile fallback enabling exfiltration via attribution string | Information disclosure (minor) | Attribution is a fixed literal in `osmRasterStyle.ts`; no user input. |
| Cloud-init secrets in user-data | Credential disclosure | `infra/cloud-init.yaml` contains NO secrets — only public package names, repo URL (interpolated as `${repo_url}` from TF var), and shell commands. F9 backfill is a one-off operator command, not in cloud-init. |
| `set -euo pipefail` missing in ssh-action script | Tampering (silent partial deploys) | Mandatory in every script: block. Verified pattern from `terraform.yml.deferred`. |

## Sources

### Primary (HIGH confidence)
- **Context7 / `/websites/hono_dev`** — `app.onError`, `HTTPException.getResponse()`, `hono/request-id` middleware options + `c.get('requestId')` API. Verified 2026-06-01.
- **hono.dev/docs/middleware/builtin/request-id** — `requestId({ headerName, generator, limitLength })` options
- **hono.dev/docs/api/exception** — `app.onError((err, c) => { if (err instanceof HTTPException) return err.getResponse(); ... })`
- **package.json + npm registry (2026-06-01)** — `hono@4.12.23` latest, `@hono/node-server@2.0.4` latest, `maplibre-gl@5.24.0` latest, current pins safe.
- **.continue-here.md F1.1 / F9** — Operator-verified workaround paths, including the exact certbot_nginx template path on Ubuntu 22.04 jammy.
- **08-03-SUMMARY.md** — 10-gate smoke battery + cutover timeline + Phase 8 finding details.
- **infra/cloud-init.yaml** + **infra/DEPLOY.md** — Current operator-verified runbook. Phase 9 EXTENDS, does not replace.
- **github.com/appleboy/ssh-action README** — `envs:` parameter shape + script-step `set -euo pipefail` discipline.

### Secondary (MEDIUM confidence)
- **maplibre.org/maplibre-gl-js/docs/API/classes/AJAXError/** — `status`, `statusText`, `url` fields on `AJAXError` (current 5.x docs).
- **maplibre.org/maplibre-gl-js/docs/API/interfaces/ErrorEvent/** — `error: Error | AJAXError` on `ErrorEvent` shape.
- **github.com/maplibre/maplibre-gl-js/issues/4613** — Historical 404-emit regression in 4.6.0; not 429-specific. 5.x reportedly fixed; A2 flagged as MEDIUM.
- **auth0.com/docs/customize/actions/triggers/post-login/event-object** — `event.user.email`, `api.accessToken.setCustomClaim(namespace, value)` API.
- **auth0.com/docs/get-started/apis/scopes/sample-use-cases-scopes-and-claims** — Namespace requirement (URL form), sample with `https://my-app.example.com/...` shape.
- **docs.docker.com/build/ci/github-actions/multi-platform/** — `docker/setup-qemu-action@v3` + `docker/build-push-action@v6` + `linux/arm64` platform.
- **zenn.dev/135yshr/articles/366e686b56de0c (Escaping QEMU Hell)** + **blacksmith.sh/blog (Building Multi-Platform Docker Images for ARM64)** — QEMU build time estimates 10–20 min cold; cache-to gha advice.
- **docs.oracle.com/en-us/iaas/Content/Functions/Tasks/functionslogintoocir.htm** — OCIR docker login form: `<region>.ocir.io`, username = `<tenancy-namespace>/<user>`, password = auth token. Token retention until manual revoke.

### Tertiary (LOW confidence)
- **community.auth0.com threads** — Reinforce the Action attachment two-step trap (Pitfall 8) but not authoritative.
- **OneUptime + various blog posts on docker buildx multi-arch** — Cross-checked against official Docker docs.

## Metadata

**Confidence breakdown:**
- Standard stack (GHA + docker buildx + ssh-action + Hono + MapLibre): HIGH — verified against current Hono Context7 docs + Docker official docs + appleboy README + project codebase.
- Architecture (workflow shape, middleware pattern, retry pattern, fallback pattern): HIGH — derived from CONTEXT.md locked decisions + verified library APIs.
- MapLibre 429 detection specifics: MEDIUM — `AJAXError` class exists with `.status` (verified docs), but 4.6.0 had a regression for 404s; 5.x behavior for 429 not directly reproduced this session. Flagged as A2.
- QEMU build-time estimate: MEDIUM — community-reported 10–20 min range; actual will depend on this app's specific bundle complexity.
- Cloud-init F1.1: HIGH — workaround already operator-verified in Phase 8.1.1; Phase 9 just moves the manual steps into cloud-init.
- Auth0 Action mechanics: HIGH — extensively documented; the only unknown is the specific tenant's Action UI navigation, which is well-documented externally.
- Empty-state UX: HIGH — design + copy fully locked in CONTEXT.md; just implementation.

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 (30 days — most components are stable; MapLibre's behavior should be verified by test, not by re-research)

---

## RESEARCH COMPLETE

Phase 9 research delivers a HIGH-confidence integration plan: GHA tag-trigger → docker buildx arm64 → OCIR push → appleboy/ssh-action with `envs:` → docker compose pull + migrate + up → curl smoke; Hono `requestId` + `app.onError` middleware; ERR-01 backoff helper in `src/photos/retry.ts`; ERR-03 `AJAXError.status === 429` + OSM raster style swap; ERR-04 + /app/trips empty cards with amber CTAs; cloud-init F1.1 dhparam + options-ssl-nginx.conf pre-create; Auth0 post-login Action injecting `event.user.email` into a namespaced custom claim. ERR-02 deferred to Phase 10 per CONTEXT.md.
