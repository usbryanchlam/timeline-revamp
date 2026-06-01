# Phase 9: Deploy part 2 + empty/error states — Context

**Gathered:** 2026-06-01
**Status:** Ready for research + planning
**Source:** /gsd-discuss-phase (4 areas discussed: scope, CI/CD architecture, pre-CI cleanup, error UX)

<domain>
## Phase Boundary

Two distinct subsystems wrapped in one phase:

1. **CI/CD pipeline** that ships everything that follows — tag-driven OCIR build + SSH-in deploy to the OCI VM, with auto-migration, tag-pin rollback, and production-grade error middleware.
2. **Empty + error state UX** on the live product — photo upload retries, MapTiler rate-limit fallback, /app onboarding card, /app/trips empty-state extension.

The phase also closes the last cross-phase followups from Phase 8 that block reliable auto-deploy: F1.1 nginx+certbot bootstrap (cloud-init pre-creates TLS template files) and F9 server-side `users.email` (Auth0 Action custom claim).

**Out of phase 9 scope** (deferred — see `<deferred>`): ERR-02 (MP4 notification — Phase 10 ships Redis/BullMQ first), MeRoute v2 build-out (Phase 12 launch polish), F4 Instance Principal switch (post-launch hardening), OIDC Identity Propagation Trust + TF workflow rename (its own micro-phase — likely 9.1 or 10.1).

</domain>

<decisions>
## Implementation Decisions

### Scope discipline

- **ERR-02 deferred to Phase 10.** MP4 notification card needs BullMQ + Redis + MP4 render lifecycle, none of which exist in Phase 9. Phase 8 D-08 already deferred Redis to Phase 10; ERR-02 follows.
- **MeRoute v2 deferred to Phase 12 (launch polish).** v1 minimal (Auth0 avatar/name/email/sign-out) is already shipped. Handle status, storage usage, account deletion are not deploy-critical.
- **F4 Instance Principal switch deferred to post-launch hardening backlog.** PEM UID-1001 chown step is already documented (see F4 in `08-deploy-part-1/.continue-here.md`); the code-level switch to `InstancePrincipalsAuthenticationDetailsProvider` eliminates PEM-in-container risk but is not CI-blocking. Captured in `<deferred>`.
- **/app/trips empty-state polish IN scope.** UAT-reported. Treated as an extension of ERR-04 onboarding (same design vocabulary).

### CI/CD architecture (DEPLOY-03 app-code, DEPLOY-04, DEPLOY-06)

- **Trigger model:** Tag-only deploy + main-push CI. PRs run lint/typecheck/test/build (no push). main-push runs the same plus pushes an image tagged `main-<sha>` and `latest` to OCIR (NOT deployed). A semver tag `v1.2.3` is the explicit deploy trigger — the only event that SSHes into the VM and flips images. Matches DEPLOY-04 wording ("tagged-release auto-deploy").
- **Build artifact:** OCIR (OCI Container Registry), ARM64-only (`linux/arm64`). Matches the Ampere A1 VM. Multi-arch deferred until a non-ARM target exists.
- **Registry auth:** OCIR auth token (Console-generated, stored as `secrets.OCIR_AUTH_TOKEN` + `vars.OCIR_USER`). NOT OIDC — see "OIDC trust deferral" below.
- **Deploy mechanism:** GHA SSHes into the VM via `appleboy/ssh-action`, runs `docker compose pull && docker compose up -d` with the tag pinned in an `.env` override file. SSH key stored as `secrets.DEPLOY_SSH_KEY`. Symmetric with the current manual runbook in `infra/DEPLOY.md` — CI extends, doesn't replace.
- **Migration handling:** Auto-run `db:migrate` BEFORE `up -d --build` via `docker compose run --rm api bun run db:migrate`. If migrate fails, deploy aborts (image not flipped, old container keeps serving). Schema-rollback is manual (rare); documented in DEPLOY.md.
- **Rollback strategy:** Tag-pin rollback via `workflow_dispatch` with a tag input. Re-running with `v1.2.2` redeploys the prior image (OCIR keeps history). Recovery target <5 min. No blue/green (out of architectural scope for a single VM).
- **Image tag scheme:** `vX.Y.Z` for deploys, `main-<sha>` for every main-push, `latest` mirrors the most recent main-push. Deploy step always reads the `vX.Y.Z` tag from the workflow trigger — never `latest`.

### Pre-CI infra cleanup

- **F1.1 nginx + certbot bootstrap chicken-egg:** Cloud-init pre-creates the two files that `ops/nginx/timeline.conf`'s TLS directives reference: `/etc/letsencrypt/options-ssl-nginx.conf` (copied from the `certbot_nginx` python package's `tls_configs/` dir) and `/etc/letsencrypt/ssl-dhparams.pem` (generated via `openssl dhparam -out ... 2048`). After this lands, `nginx -t` passes on first boot and `certbot --nginx` (not `--standalone`) works end-to-end. Cost: ~1–2 min extra cloud-init for dhparam.
- **F9 server-side `users.email` empty:** Auth0 Action injects email into access token custom claim. Auth0 Dashboard → Actions → Library → Custom → Login flow → `api.accessToken.setCustomClaim('https://timeline.bryanlam.dev/email', event.user.email)`. Server (`server/auth/lazyProvision.ts` or the JWT context plumbing) reads from the custom claim instead of the standard `email` claim (which Auth0 access tokens don't carry by default). One-off backfill SQL for the existing empty row.
- **OIDC Identity Propagation Trust:** DEFERRED to its own micro-phase. App CI uses OCIR auth token (not OIDC) so the provider-pin bump + schema discovery can happen in a focused spike. Per `.continue-here.md`: "Don't try to bump the OCI provider pin AND build the GHA workflow in the same plan — schema discovery is a research spike."

### Error / empty state UX (ERR-01, ERR-03, ERR-04, + /app/trips polish)

- **ERR-01 photo upload retry:** Inline tile with auto-retry + visible state + manual retry button. Failed tile: amber border + `Retrying in {N}s…` caption + spinner. Auto-retries 3 times with exponential backoff (2s, 4s, 8s — total ~14s before giving up). After 3 fails: tile shows `Upload failed. Tap to retry.` with manual retry button + dismiss (×). Backoff timing belongs in a `src/upload/retry.ts` const block, tunable.
- **ERR-03 MapTiler rate-limit + fallback:** Detect MapTiler 429 via MapLibre's `map.on('error', ...)` hook. On 429 from a MapTiler tile URL: swap to OSM raster (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) and surface a top-of-map dismissible amber banner: `Map service limited; some detail reduced.` Banner persists for the session (sessionStorage flag); dismissable but re-shows on next session if rate-limit recurs.
- **ERR-04 + /app/trips empty state:** Card with copy + amber CTA, no illustration. Authenticated surfaces — DESIGN.md *allows* illustrations here (the "no illustration on public surfaces" lock is for `/` and `/u/:handle`), but we skip them for visual consistency with the public reel.
  - `/app` reel empty state: centered card. Copy: `No trips yet.` + `Add your first city to start the camera flying.` + amber `Add a city` CTA → navigates to `/app/trips`.
  - `/app/trips` 0-city empty state: top-half map (existing layout), centered card overlaid on the map's lower half. Copy: `Tap the map to add your first stop.` + small amber arrow/pin glyph pointing at the map. No CTA button (the map IS the CTA).
- **DESIGN.md amber-accent rule:** All retry buttons, fallback banners, onboarding CTAs use the locked amber tokens. Single-accent rule preserved.

### DEPLOY-06 production middleware

- **Health endpoints:** Already shipped — `/health` (trivial) + `/api/health` (DB ping with 503-on-fail). No change.
- **Request logging:** `hono/logger` already wired in `server/index.ts:21`. Extend it to emit a request ID (`x-request-id` header; generate UUID if missing; include in log line).
- **Error middleware:** Add Hono `app.onError((err, c) => ...)` global handler.
  - Logs `err.stack` to `process.stderr` (matches the no-`console.log` rule from `coding-style.md`) with the request id.
  - Returns sanitized JSON: `{ error: 'internal_error', request_id }` (500) by default.
  - Honors `HTTPException` from Hono — uses its status + message verbatim (these are intentional, user-safe errors).
  - No stack traces in client response (security: no internal path leakage).
  - Request IDs propagated via `x-request-id` response header (generate if missing) — operator can correlate client-reported errors to server logs.

### Claude's Discretion

- Exact `appleboy/ssh-action` version pin, retry counts, job timeout values — pick conservative defaults; planner decides.
- Whether to gate the deploy job behind a GHA `environment: production` reviewer (similar to 8.1 TF). Default: yes, for symmetry with infra workflow; the tag itself is the deploy intent signal, the env-gate is a "safety brake" you can disable later if it adds friction.
- Test/lint commands invoked in CI: existing `bun test`, `bun run typecheck`, `bun run lint` (whatever the project already exposes — researcher confirms).
- Cloud-init dhparam bit size and timing — 2048 is the documented value in F1.1; planner can default to that.
- Exact Auth0 Action JS snippet — planner adapts from the F9 issue body.
- Retry tile UI styling details below the card level (border-radius, exact spacing) — design system already specifies.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 8 + 8.1 context (load-bearing for Phase 9)

- `.planning/phases/08-deploy-part-1/.continue-here.md` — F1–F8 + F9 findings; specifies the three fix paths for F1.1 (the chosen one is locked above), F4, F9; lists the "What Phase 9 should NOT do" guardrails.
- `.planning/phases/08-deploy-part-1/08-03-SUMMARY.md` — Cutover narrative, 10-gate smoke battery results, finding details for F1–F8.
- `.planning/phases/08.1-infra-terraform/08.1-HUMAN-UAT.md` — Where F4/F5/F1 are appended.
- `.github/workflows/terraform.yml.deferred` — The Phase 8.1 GHA OIDC reference workflow. Phase 9's app-code CI inherits its plan/apply env-gate pattern but uses OCIR auth token (not OIDC) for the registry push.

### Runbook + infrastructure

- `infra/DEPLOY.md` — Current manual runbook. Phase 9 EXTENDS this with a `## CI/CD` section; it does not replace any existing steps.
- `infra/cloud-init.yaml` — Edited by Phase 9 to pre-create `options-ssl-nginx.conf` + `ssl-dhparams.pem` (F1.1 fix).
- `infra/terraform/` — Read-only for Phase 9 unless cloud-init changes the runcmd hash and triggers a TF replace. No new resources.
- `docker-compose.yml` + `docker-compose.prod.yml` — Phase 9 deploy reads/edits these for the OCIR image tag pinning pattern.

### Server + app code

- `server/index.ts` — Site for the new `app.onError(...)` middleware + request-id propagation (DEPLOY-06).
- `server/auth/jwt.ts` + `server/auth/lazyProvision.ts` — Touched by F9: read the `https://timeline.bryanlam.dev/email` custom claim instead of the standard `email` claim.
- `server/routes/health.ts` — Existing; no change.
- `src/routes/TripsRoute.tsx` (line 106: `const empty = …`), `src/routes/AppReelRoute.tsx` (line 57: existing "Add your first city" copy) — sites for the ERR-04 + /app/trips empty-state extension.
- `src/upload/` (Phase 6 plumbing) — Site for the ERR-01 retry tile + backoff helper.
- `src/reel/MapCanvas.tsx` + the MapLibre style URL config — Site for ERR-03 MapTiler 429 handling + OSM raster fallback.

### Design system + product context

- `DESIGN.md` — Amber tokens at L85-87, "single amber accent" rule, "no empty-state illustrations on public surfaces" lock at L72 (note: `/app` is NOT public, so illustrations ARE allowed there — we voluntarily skip them for consistency).
- `CLAUDE.md` (repo root) — Locks the brand promise; relevant here because error/empty states must not undermine the cinematic motion story.

### Requirements

- `.planning/REQUIREMENTS.md` — DEPLOY-03, DEPLOY-04, DEPLOY-06, ERR-01..04 wording. DEPLOY-03 is marked complete (for TF infra); Phase 9 closes the app-code half.

### Auth0 (external — for F9)

- Auth0 Dashboard → Actions → Library → Custom → Login flow. The Action runs at access-token mint time and sets a custom claim under the `https://timeline.bryanlam.dev/email` namespace. The namespace must be allowed in the Auth0 tenant settings (Auth0 reserves un-namespaced claims).

</canonical_refs>

<specifics>
## Specific Ideas

### CI/CD specifics

- **GHA workflow file:** `.github/workflows/deploy.yml` (new). Mirror the structure of `.github/workflows/terraform.yml.deferred` for jobs / env / permissions where reasonable.
- **Image tag in compose:** `docker-compose.prod.yml` references `image: ${OCIR_IMAGE}:${IMAGE_TAG}` and the deploy step writes `IMAGE_TAG=v1.2.3` to `.env` on the VM before `docker compose up -d`.
- **SSH-action:** `appleboy/ssh-action@v1` (or v0.1.x stable line). Host = `64.181.252.226` (Reserved Public IP, won't change). User = `ubuntu`. Key from `secrets.DEPLOY_SSH_KEY`.
- **Smoke test post-deploy:** `curl -fsSL https://timeline.bryanlam.dev/api/health` from the GHA runner after `up -d` returns. Fails the job if non-200 — but does NOT auto-rollback (operator triggers tag-pin redeploy).

### Error middleware specifics

- Request ID generation: `crypto.randomUUID()` if `x-request-id` not present on inbound. Echo on response always.
- `process.stderr.write(...)` not `console.error` (project rule).
- `app.onError` runs after route handlers; intentional `c.json({...}, status)` returns from routes never hit `onError` (only thrown exceptions do).

### F1.1 cloud-init specifics

- Source of `options-ssl-nginx.conf`: `/usr/lib/python3/dist-packages/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf` (Ubuntu 22.04 default Python path; the certbot_nginx apt package places it here).
- dhparam: `openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048` — runs in cloud-init `runcmd` AFTER certbot/nginx apt install, BEFORE the first systemd-start of nginx.
- File mode: `0644` on `options-ssl-nginx.conf`, `0644` on `ssl-dhparams.pem`. Owner root:root.

### F9 Auth0 Action specifics

- Action name suggestion: `inject-email-into-access-token`.
- Code:
  ```js
  exports.onExecutePostLogin = async (event, api) => {
    api.accessToken.setCustomClaim('https://timeline.bryanlam.dev/email', event.user.email);
  };
  ```
- Server-side claim read: `c.var.auth0Email` source switches from `claims.email` to `claims['https://timeline.bryanlam.dev/email']` in the JWT context plumbing.
- Backfill: a single hand-written SQL for the existing bryan user. Documented in the SUMMARY.md, not automated.

### ERR-01 retry specifics

- Backoff: `[2000, 4000, 8000]` ms in `src/upload/retry.ts`. Total observation window ~14s before manual-retry mode.
- Distinguish transient (network, 5xx, 429) from terminal (4xx other than 429, 413 size). Terminal errors skip auto-retry and go straight to manual-retry tile with the specific error mode (`Photo too large` etc.).
- Manual retry resets the retry counter — operator gets fresh 3 auto-retries.

### ERR-03 OSM fallback specifics

- Tile URL: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Attribution: `© OpenStreetMap contributors`.
- Style URL swap: cleaner to maintain a parallel `osm-raster-style.json` in `src/reel/` than to mutate the live MapTiler style. Map re-init may be required (vector → raster is a different source type).
- sessionStorage key: `map-fallback-active`. Cleared on session end.

### Tag scheme + version source

- Version source: `package.json` `version` field is the canonical source. GHA tag check validates the tag matches `package.json` version (catch the "tagged but forgot to bump" bug class).
- Tag format: `v1.2.3` (semver, leading `v`). Pre-release suffixes (`v1.2.3-rc.1`) deploy to the same prod target — no separate staging in Phase 9. Staging is out of scope.

</specifics>

<deferred>
## Deferred Ideas

| Item | Reason | Target |
|---|---|---|
| ERR-02 MP4 render fail notification card | Backend (BullMQ + Redis + Puppeteer pipeline) doesn't exist yet — Phase 10 ships it | Phase 10 |
| MeRoute v2 build-out (handle status, storage usage, account deletion) | v1 minimal already live; not deploy-critical | Phase 12 launch polish |
| F4 switch `server/oci/parClient.ts` to `InstancePrincipalsAuthenticationDetailsProvider` | Security hardening — eliminates PEM-in-container risk; IAM dynamic group + policy already exist (Phase 8.1) — purely a code change | Post-launch hardening backlog |
| F5 Path B — mint short-TTL read PARs server-side | Photo bucket is `ObjectRead` (per `08.1/storage.tf` after F5 fix). UUID-named objects + no listing = Google-Photos-shared-album security model. Acceptable for v1. | Post-launch hardening |
| OIDC Identity Propagation Trust (bump `oracle/oci` provider pin + enable trust + rename `terraform.yml.deferred` → `.yml`) | Schema discovery is a research spike per `.continue-here.md`; don't bundle with deploy workflow | Phase 9.1 micro-phase (likely) |
| Multi-arch (amd64 + arm64) image builds | No non-ARM target yet; QEMU emulation doubles build time | When a non-ARM target appears |
| Blue/green deploy | Single VM architecture; ~2x memory cost; orchestration lift not worth it for portfolio scale | Out of v1; revisit if traffic warrants |
| Staging environment | No DNS, no second VM, no separate Auth0 tenant. Phase 9 ships straight to prod. | Out of v1 |
| Sentry integration | Stderr + `docker compose logs api` is enough for portfolio scale | Out of v1 |
| Instrumented iPhone Web Inspector FPS measurement (Phase 7 item 1) | Pre-launch QA — needs USB-tethered iPhone | Phase 12 |
| Cinematic motion tuning (FLY_DURATION_MS, ARRIVAL_CURVE, easing) | Brand-critical but a focused session; partial work done in Phase 8 cutover; CI/CD lets future tuning be a push-watch loop | Dedicated session post-Phase-9 |
| `<ReelView />` shared extraction across PublicReelRoute / HandleReelRoute / AppReelRoute | Code-quality housekeeping flagged during Phase 5 | Phase 9 lead-in nice-to-have OR Phase 12 |
| cities.test.ts split (945 → 3 files) | Past 800-line ceiling; not blocking | Ongoing housekeeping |

</deferred>

---

*Phase: 09-deploy-part-2-empty-error-states*
*Context gathered: 2026-06-01 via /gsd-discuss-phase*
