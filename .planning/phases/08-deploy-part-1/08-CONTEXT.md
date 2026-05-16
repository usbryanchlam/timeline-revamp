# Phase 8: Deploy part 1 - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 takes the working app off localhost and onto `https://timeline.bryanlam.dev` for the first time, via manual SSH-driven bootstrap of an OCI Ampere A1 VM. Specifically:

1. **VM bootstrap + Docker Compose stack (DEPLOY-01)** — Provision OCI Ampere A1 VM (≥2 OCPU / ≥8 GB), install Docker + Compose, clone repo to `/opt/timeline-revamp`, bring up the production compose stack (API + Postgres, no Redis yet).
2. **Nginx reverse proxy + Let's Encrypt TLS (DEPLOY-02)** — Host-installed Nginx + certbot, symlink Phase 7's `ops/nginx/timeline.conf` into `/etc/nginx/conf.d/`, run `certbot --nginx` for the cert, verify systemd-timer auto-renew works.
3. **DNS cutover + smoke test (DEPLOY-05)** — Point `timeline.bryanlam.dev` A-record at the VM's reserved public IP, verify TLS chain, run the smoke battery (bare checks + 3 deferred Phase 7 mobile UAT items on real iPhone).

Phase 8 is **manual SSH for W8**. Repeatable runbook lives in the repo (mirrors mykb's `infra/setup.sh` pattern). Phase 9 owns CI/CD + container registry + tag-triggered auto-deploy.

**Locked by ROADMAP / PROJECT.md / earlier phases (do not re-litigate):**
- OCI Ampere A1 VM (existing free tier) — `PROJECT.md:42`
- Docker Compose on the VM is the runtime — `PROJECT.md:62`
- Phase 7's `ops/nginx/timeline.conf` is the proxy config — committed in Phase 7, Phase 8 just wires it in
- `git pull && docker compose up -d --build` is the canonical ship loop — ROADMAP §"Phase 8" success criterion 4
- Domain `timeline.bryanlam.dev`, single host (no www, no wildcard)
- No CI/CD, no container registry, no tag-trigger — those are Phase 9
- DNS A-record directly to VM IP (no Cloudflare proxy) — mykb pattern + ROADMAP

**Divergence from ROADMAP success criterion 1 (flagged for planner):**
- ROADMAP says "API + Postgres + Redis + Nginx". Discussion locked **Redis deferred to Phase 10** (no app code talks to Redis until MP4 queue lands). Planner should note this divergence in 08-01-PLAN.md or update ROADMAP. Acceptance criterion 1 is satisfied if "API + Postgres" runs in Compose and Nginx fronts it; Redis is added in 10-01.

</domain>

<decisions>
## Implementation Decisions

### Reverse proxy + TLS (D-01..D-07)

- **D-01:** **Host-installed Nginx** (apt-get) + **certbot --nginx plugin**, NOT Nginx-in-Docker, NOT Caddy. App stack (API + Postgres) lives in Docker Compose behind it. Closest adaptation of the mykb pattern (`/Users/bryanlam/Workspaces/mykb/infra/setup.sh:18-23`) while preserving Phase 7's `ops/nginx/timeline.conf` proxy_cache config.
- **D-02:** **Symlink** `ops/nginx/timeline.conf` → `/etc/nginx/conf.d/timeline.conf` (NOT copy). `git pull` then `sudo nginx -t && sudo nginx -s reload` is the proxy-update loop. Bad commits get caught by `nginx -t` before reload — REQUIRED step in the deploy runbook.
- **D-03:** **certbot systemd timer** (default in certbot 1.32+ on Ubuntu) for cert renewal. No cron entry needed. Verify with `systemctl status certbot.timer` and `certbot renew --dry-run`.
- **D-04:** **iptables + iptables-persistent** for the VM firewall (mykb pattern, `infra/setup.sh:25-29`). ACCEPT rules for 80/443 must be inserted BEFORE the OCI Ubuntu base image's REJECT-all rule — documented gotcha in `mykb/docs/DEPLOYMENT.md:268-280`. Runbook MUST include `iptables -L INPUT -n --line-numbers` verification step.
- **D-05:** **OCI VCN Security List ALSO opens 80/443** in addition to host-level iptables. Double-layer; cheap.
- **D-06:** HTTP → HTTPS redirect handled by `certbot --nginx`'s automatic config injection (the plugin asks during run; choose "Redirect"). No manual rewrite rule in `timeline.conf`.
- **D-07:** Single-host cert for `timeline.bryanlam.dev` only. No `www.` variant, no wildcard. Locked in PROJECT.md scope.

### Compose service set (D-08..D-11)

- **D-08:** **Redis deferred to Phase 10**. Phase 8 stack = API + Postgres only. ROADMAP's literal wording diverges from this; planner annotates the divergence in 08-01-PLAN.md. No app code touches Redis until MP4 queue work in Phase 10.
- **D-09:** **Bun runtime** for the production API container. Base image `oven/bun:1-alpine` (or current pinned tag). Matches dev orchestration; no tsx-in-production complication; no node + esbuild bundling step. Hono runs natively on Bun. Diverges from mykb's node + PM2 choice because mykb is AdonisJS (node-native) — different starting point.
- **D-10:** **Build on the VM** (`docker compose up -d --build`). ARM-native build matches the Ampere A1 arm64 runtime, no cross-compile/qemu pain. Build time on 2-OCPU/8GB ≈ 3-5 min for Vite + Hono — acceptable for manual deploys. Phase 9 swaps this for registry pull.
- **D-11:** **Postgres NOT publishing port 5432 in production compose**. Dev compose publishes it (for psql/Drizzle Studio); prod-only override (`docker-compose.prod.yml` or env-gated `ports` block) keeps Postgres on the internal Docker network only. Open question: single compose file with profiles, OR two compose files? — planner picks.

### Code & secrets pipeline (D-12..D-15)

- **D-12:** **Repo path** `/opt/timeline-revamp` owned by `ubuntu` user. mykb pattern (`docs/DEPLOYMENT.md:32`). `chown ubuntu:ubuntu` after mkdir; add `ubuntu` to `docker` group so `docker compose` doesn't need sudo.
- **D-13:** **Single `.env` file at repo root**, SCP'd from local. Compose reads via `env_file` directive on each service. Re-SCP whenever values change. `.env` is already in `.gitignore` from earlier phases. mykb's exact pattern but collapsed to one file since we don't have separate `apps/api/.env` and `apps/web/.env.local` (timeline-revamp is single-server-process, Vite bundles into static assets served by Nginx, not a separate Next.js process).
- **D-14:** **Postgres password generated once** via `openssl rand -hex 32`, pasted into `.env`, never rotated for v1. Postgres is on internal Docker network only (per D-11); no public exposure. Rotation is a v2/operational problem.
- **D-15:** **Auth0 / MapTiler / `VITE_*` env vars** copied from local `.env.example` and populated with the production tenant's values. `VITE_*` vars are baked into the Vite build (`docker compose build` consumes them), so re-SCP + rebuild on change. Auth0 production callback URL = `https://timeline.bryanlam.dev/app` (Auth0 dashboard config — runbook step).

### Smoke test & verification (D-16..D-19)

- **D-16:** **Smoke test in 08-03 = bare checks + the 3 deferred Phase 7 mobile UAT items.** This closes the Phase 7 UAT debt. Specifically:
  - Bare: `curl -sf https://timeline.bryanlam.dev/api/health` returns 200 with `{status:'ok', db:'ok'}`; `openssl s_client -connect timeline.bryanlam.dev:443` shows a valid Let's Encrypt chain; `sudo certbot renew --dry-run` succeeds.
  - Mobile UAT (from `07-HUMAN-UAT.md`):
    1. iPhone Safari sustained 60 FPS on the 1-city OrbitReel for 30s+ (visit a 1-city handle URL, observe via Web Inspector → Timeline → Rendering)
    2. GlobeReel renders as actual 3D globe on iOS (visit 0-city handle URL, confirm continents curve toward poles)
    3. Mixed-case URL `/u/Bryan` resolves to same reel as `/u/bryan` (case-insensitive LOWER lookup at app layer; Nginx X-Cache-Status MISS then HIT per-URL)
- **D-17:** **`/api/health` endpoint shape**: 200 + `{status: 'ok', db: 'ok'}`. Adds a Postgres `SELECT 1` ping inside the handler to catch the "API up but DB unreachable" failure mode. mykb's `/health` returns `{status:'ok'}` only; we extend with DB check since we have a real DB. Endpoint MUST exist before Phase 8 (currently doesn't — flag for planner; create in 08-01 alongside compose work, OR a new pre-08-01 sub-task).
- **D-18:** **Postgres data persistence** via **named Docker volume** (`pgdata:`, same name as dev). `docker compose down` doesn't lose data; `docker compose down -v` does. Accept loss-on-VM-rebuild for v1 launch. Runbook documents a manual `docker compose exec postgres pg_dump -U timeline timeline > backup-$(date +%F).sql` recipe. Automated backup deferred to Phase 9 or later.
- **D-19:** **DNS cutover order**: (1) Verify TLS works against the VM's IP directly via `curl --resolve timeline.bryanlam.dev:443:<vm-ip> https://timeline.bryanlam.dev` BEFORE flipping DNS. (2) Then update the A-record. (3) Wait for propagation (`dig +short timeline.bryanlam.dev`). (4) Run the full smoke battery. This sequencing prevents a window of "TLS not yet issued + DNS already cut over" 502s.

### Claude's Discretion

- Exact base image tag for `oven/bun:1-alpine` (pin to current LTS-equivalent at plan time).
- Whether to use a single `docker-compose.yml` with profiles (`compose --profile prod`) or two files (`docker-compose.yml` + `docker-compose.prod.yml`) to encode the "no published port" production override. Both are idiomatic; pick what reads cleaner in the deploy runbook.
- Whether the VM provisioning is a single `infra/setup.sh` (mykb pattern, curl-piped-to-bash) or a numbered runbook in `infra/DEPLOY.md`. Both work; mykb does both (script + DEPLOYMENT.md). Lean to both: `infra/setup.sh` for bootstrap, `infra/DEPLOY.md` for the ship-loop + smoke test.
- Production logging path: `docker compose logs -f` is fine for v1. journald integration via Compose's `logging: driver: journald` is nice-to-have; defer if it adds friction.
- Whether to also catch the `www.timeline.bryanlam.dev` variant as a 301 redirect to bare-host in Nginx, just in case someone types it. Cheap to add; defer if it complicates the certbot run.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §"Phase 8: Deploy part 1" — success criteria 1-4, plan breakdown (08-01 VM + Compose, 08-02 Nginx + LE, 08-03 DNS + smoke)
- `.planning/REQUIREMENTS.md` — DEPLOY-01, DEPLOY-02, DEPLOY-05
- `.planning/PROJECT.md` §"Constraints" lines 62-63 — "Docker Compose on OCI Ampere A1 VM" + "2 OCPU / 8GB minimum"

### Reference implementation — mykb (other personal project on the same OCI free tier)
- `/Users/bryanlam/Workspaces/mykb/infra/setup.sh` — VM bootstrap script template (apt-get nodejs/caddy/iptables, /opt/<app> ownership, firewall opens). **timeline-revamp adapts this: swap node→docker, swap caddy→nginx, keep iptables.**
- `/Users/bryanlam/Workspaces/mykb/infra/Caddyfile` — reference for the equivalent reverse-proxy config shape (timeline uses `ops/nginx/timeline.conf` instead)
- `/Users/bryanlam/Workspaces/mykb/docs/DEPLOYMENT.md` — full ops runbook template (env vars, first-deploy steps, troubleshooting). **Especially §"iptables rule ordering" lines 268-280 — the OCI Ubuntu REJECT-rule gotcha. Runbook MUST include this verification step.**
- `/Users/bryanlam/Workspaces/mykb/docs/DEPLOYMENT.md` §"Let's Encrypt certificate fails" lines 259-266 — common LE failure modes on OCI (DNS not propagated, iptables blocking, Cloudflare proxy)

### Phase 7 — proxy config (already shipped, MUST be reused verbatim)
- `ops/nginx/timeline.conf` — committed in Phase 7. Phase 8 symlinks this into `/etc/nginx/conf.d/`. Do NOT edit during Phase 8 unless cert paths need adjusting (certbot --nginx may auto-inject those).
- `.planning/phases/07-public-urls-handle/07-CONTEXT.md` §"Nginx cache" D-18..D-21 — the cache contract Phase 8 must preserve when wiring the conf

### Existing app surfaces that the smoke test exercises
- `server/index.ts` — Hono server entrypoint, currently no `/api/health` endpoint with DB ping. **Planner: this endpoint must be added in 08-01 before deploy.**
- `server/routes/publicReel.ts` — `/api/public/u/:handle` 5m-cache endpoint (smoke test step 6)
- `server/routes/handlesCheck.ts` — `/api/handles/check` no-store endpoint
- `src/routes/HandleReelRoute.tsx` — 0/1/many-cities branch (mobile UAT items 1 + 2 exercise this)
- `.planning/phases/07-public-urls-handle/07-HUMAN-UAT.md` — the 3 pending mobile UAT items that Phase 8 smoke test closes

### Memory landmines applicable to Phase 8
- `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/feedback_dual_runtime_env.md` — Vite VITE_-prefix vs server unprefixed needs both copies in `.env`. Verify .env.example enumeration.
- `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/feedback_post_merge_install.md` — `bun install` after git pull if package.json changed. Build-on-VM means this happens inside the image build; verify Dockerfile does it.
- `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/feedback_oci_cors_via_s3.md` — OCI bucket CORS uses S3-compat API. Not directly Phase 8 work but mentioned because photos cross-origin from `timeline.bryanlam.dev` → OCI Object Storage. Verify the CORS rule survived from Phase 6.
- `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/feedback_esm_require_in_tsx_watch.md` — server/ is ESM. Production Dockerfile MUST exercise the live runtime (not just typecheck + mocked tests). Bun handles ESM natively; this is mostly a "smoke-test the running container in 08-01" reminder.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`ops/nginx/timeline.conf`** — Phase 7 already wrote the production vhost. Symlink-only in Phase 8; no edits unless certbot --nginx auto-injects TLS lines (expected).
- **`docker-compose.yml`** — Currently has Postgres only (Phase 4 work). Phase 8 extends this to add the API service (Hono on Bun, port 8787). Dev-vs-prod split TBD (D-11).
- **`server/env.ts`** — Zod-validated env schema for the server side. Phase 8 must ensure all production values land in the SCP'd `.env`. mykb's pattern of an env-table-in-DEPLOYMENT.md (`docs/DEPLOYMENT.md:60-87`) is a good reference for what to document.
- **`scripts/dev.ts`** — Dev orchestration script. Production doesn't use this; production runs `bun run server/index.ts` directly (or whatever the Dockerfile CMD lands on). Reference only.

### Established Patterns

- **dual env-var sets (`feedback_dual_runtime_env.md`)** — `VITE_*` for client bundle, unprefixed for server. Single `.env` file at repo root must contain both. Compose `env_file: .env` on the API service gets the server-side ones; Vite reads `VITE_*` at build time inside the Dockerfile's RUN bun run build step.
- **mykb host-install + iptables firewall** — mykb's `infra/setup.sh:25-29` exact iptables incantation works on OCI Ubuntu. Reuse verbatim; the ACCEPT-before-REJECT ordering is the load-bearing detail.
- **mykb /opt/<app> + ubuntu:ubuntu ownership** — clean baseline; lets `docker compose` run without sudo once `ubuntu` is in the `docker` group.

### Integration Points

- **Nginx → Docker compose** — Nginx upstream is `proxy_pass http://localhost:8787` (the API's host-published port — or, if we don't publish, then via Docker's host-gateway). Phase 7's `timeline.conf` already has the upstream block; verify the port matches the production compose's API service.
- **certbot --nginx → ops/nginx/timeline.conf** — certbot edits the SAME file (via the symlink). On the VM, this means certbot mutates the file in `/opt/timeline-revamp/ops/nginx/timeline.conf` via the symlink. Two outcomes:
  - (a) commit the certbot mutations back into the repo (preferred — repo stays source of truth)
  - (b) keep the cert config in a separate include file referenced from `timeline.conf` (cleaner separation but more setup)
  - **Planner picks; flag for 08-02-PLAN.md.**
- **DNS A-record → VM** — One-time OCI Console action OR `oci network public-ip` CLI. Reserved Public IP required (mykb does this; otherwise the IP changes on VM stop/start). Runbook MUST verify the IP is reserved BEFORE pointing DNS.
- **Auth0 production callback URL** — Dashboard config change to add `https://timeline.bryanlam.dev/app` to Allowed Callback URLs. Out-of-band but in the runbook.

</code_context>

<specifics>
## Specific Ideas

- **mykb is the reference**: timeline-revamp's `infra/setup.sh` should structurally mirror `/Users/bryanlam/Workspaces/mykb/infra/setup.sh` — same shell prelude, same iptables incantation, same `/opt/<app>` layout, swapped pkg list (docker.io + docker-compose-plugin + nginx + certbot + python3-certbot-nginx instead of nodejs + pnpm + pm2 + caddy).
- **mykb's runbook is the template**: `infra/DEPLOY.md` mirrors `mykb/docs/DEPLOYMENT.md` structure — Prerequisites, Initial VM Setup, Environment Variables (table), First Deployment, Common Operations, Troubleshooting.
- **`/api/health` returns `{status:'ok', db:'ok'}`** — Postgres SELECT 1 ping in the handler. Failure path returns 503 with `{status:'error', db:'unreachable'}`.
- **Smoke test closes Phase 7 UAT debt**: D-16 lists the 3 items verbatim. After 08-03 passes, `07-HUMAN-UAT.md` summary updates from `1/4 passed, 3 pending` → `4/4 passed`.
- **Symlink not copy** for `ops/nginx/timeline.conf` — `git pull` updates the proxy config; `nginx -t && nginx -s reload` is the apply step.
- **Reserved Public IP required** — mykb does this; otherwise the OCI VM IP can change on stop/start and DNS breaks. One-time OCI Console action.
- **Postgres port NOT published in prod** — internal Docker network only; dev compose publishes 5432 for psql/Drizzle Studio. Encode the difference cleanly.

</specifics>

<deferred>
## Deferred Ideas

- **CI/CD + container registry + tag-trigger deploy** — Phase 9 owns this. Phase 8 explicitly ships the manual baseline.
- **Automated Postgres backups** — D-18 accepts manual `pg_dump` runbook for v1. Daily cron + retention is a Phase 9 add-on (or beyond). Could be a 09-XX task.
- **OCI block-volume snapshot strategy** — alternative to pg_dump for DB persistence. Heavier operational story; defer.
- **Redis service in compose** — explicitly deferred to Phase 10 (MP4 queue work). 10-01 adds redis:7-alpine + the queue wiring.
- **www. → bare host 301** — `www.timeline.bryanlam.dev` doesn't resolve currently; not adding the variant means typing `www.` returns NXDOMAIN. Cheap to add later if needed; defer until somebody asks.
- **journald log driver** — `docker logs` is fine for v1. journald integration is nice-to-have for systemd-native log aggregation; defer.
- **Production logging dashboard / alerting** — manual `docker compose logs -f` for v1. Grafana / Loki / Sentry stack is launch-week-or-later if at all.
- **Rate limiting at Nginx layer** — `feedback`-flagged in Phase 7 D-6 deferred section as a Phase 8 candidate. Re-evaluating: not blocking launch, defer to Phase 9 alongside the error-state polish.
- **HSTS / security headers beyond what certbot --nginx injects** — mykb's Caddyfile sets HSTS at the edge. Phase 8's Nginx config could add HSTS + CSP + X-Frame-Options. Some of these need careful tuning (CSP for MapLibre + Auth0 redirects); defer the polish to Phase 9 alongside other prod-hardening.
- **Auto-deploy hook on tag push** — Phase 9 (DEPLOY-04) owns. Phase 8's manual `git pull && docker compose up -d --build` is the manual baseline that the tag-trigger automates.

</deferred>

---

*Phase: 8-deploy-part-1*
*Context gathered: 2026-05-15*
