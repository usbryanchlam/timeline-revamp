# Phase 8: Deploy part 1 - Research

**Researched:** 2026-05-15
**Domain:** Manual first-deploy of containerized Hono+Vite+Postgres app to OCI Ampere A1 ARM VM, host Nginx + certbot TLS, DNS cutover, mobile smoke test
**Confidence:** HIGH (most areas verified against committed code and mykb reference; specific version pins MEDIUM)

## Summary

Phase 8 takes the working app off localhost onto `https://timeline.bryanlam.dev` via three plans: (1) OCI VM bootstrap + Docker Compose stack with a new Bun-based API container, (2) host-installed Nginx + certbot --nginx with the Phase-7 `timeline.conf` symlinked in, (3) reserved-IP attachment + DNS cutover + mobile UAT smoke. The reference implementation is `~/Workspaces/mykb/infra/setup.sh` + `docs/DEPLOYMENT.md`: same `/opt/<app>` + `ubuntu:ubuntu` ownership + iptables-persistent pattern, but the proxy swaps Caddy→Nginx (to preserve Phase 7's `proxy_cache`) and the runtime swaps PM2+Node→Docker Compose+Bun.

Two architectural decisions need planner attention but are NOT re-litigatable: (a) the API container will serve static Vite assets via `hono/serve-static` from `/app/dist` baked into the image (NOT host-Nginx-serves-dist) — this keeps the deploy loop atomic (one `docker compose up -d --build` rebuilds both client and server), avoids a host-volume-mount step in the runbook, and matches what `timeline.conf` already does (all `/u/:handle` and SPA fallback go through `proxy_pass` to `127.0.0.1:3000`); (b) Postgres port 5432 stays unpublished in production via a `docker-compose.prod.yml` override file (NOT profiles) because the dev `docker-compose.yml` already declares `ports:` and an override file is the idiomatic Compose v2 way to remove a port mapping with `ports: []`.

The single highest-risk landmine is the **certbot first-run port-80 collision**: Phase 7's `timeline.conf` declares `listen 80;` with `server_name timeline.bryanlam.dev`. certbot --nginx detects this server block, injects the ACME challenge location into it, edits the same file (via the symlink — verified-safe behavior) to add `listen 443 ssl;` plus cert paths plus the HTTP→HTTPS redirect. The runbook must (a) start Nginx with the bare HTTP config BEFORE running certbot, (b) ensure DNS is NOT yet pointed at the VM during the dry-run-first iteration, then (c) flip DNS once `curl --resolve` against the VM IP returns a valid LE chain.

**Primary recommendation:** Mirror mykb's structure (`infra/setup.sh` + `infra/DEPLOY.md`), swap pkgs, add a multi-stage `Dockerfile` at repo root that builds Vite + Hono in one image, use `docker-compose.prod.yml` override to strip the Postgres port, and add a `pg.query('SELECT 1')` ping to the existing `/api/health` handler.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TLS termination | Host OS (Nginx) | — | `certbot --nginx` plugin needs to edit Nginx config in place; reverse-proxy and cert management co-located |
| HTTP→HTTPS redirect | Host OS (Nginx) | — | certbot --nginx auto-injects; no app-layer concern |
| Public-reel response caching | Host OS (Nginx) | — | Phase 7 `proxy_cache` zone declared at `http{}`; lives in `/etc/nginx/conf.d/` |
| API request routing | Host OS (Nginx) | — | `proxy_pass http://timeline_api;` upstream block in `timeline.conf` |
| API request handling | API container (Bun) | — | Hono on Bun behind Nginx upstream |
| Static SPA serving (`/u/:handle` + `/index.html` fallback) | API container (Bun) | Host OS (Nginx) cache | Hono `serve-static` from `dist/`; Nginx caches under `public_reel` zone |
| Database | Postgres container | Named Docker volume `pgdata` | Internal Docker network only; port 5432 NOT published |
| Auth identity | Auth0 (external) | API container (JWT validate) | `jose` JWKS in API container; production callback URL on Auth0 dashboard |
| Photo storage | OCI Object Storage (external) | API container (PAR mint) | Phase 6 bucket; no Phase 8 change |
| Firewall | Host OS (iptables) | OCI VCN Security List | Double-layer per D-04/D-05 |
| Process supervision | Docker daemon | systemd (Nginx, certbot.timer) | `docker compose ... restart: unless-stopped`; host Nginx via systemd |

## Standard Stack

### Core (Phase 8 NEW infrastructure)

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Ubuntu 22.04 LTS or 24.04 LTS | OCI default | VM OS | OCI Ampere A1 default; mykb pattern |
| docker.io + docker-compose-plugin | apt-current | Container runtime + Compose v2 | mykb pattern uses apt; works on Ampere arm64 [VERIFIED: docker hub multi-arch manifest] |
| oven/bun:1-alpine | pin `1.2.x-alpine` at plan time | API runtime + build toolchain | [VERIFIED: hub.docker.com/r/oven/bun/tags shows active 1.x-alpine track; arm64 multi-arch available]. Matches `package.json` bun lockfile + dev workflow. Don't pin to `latest`. [ASSUMED] Pin to current 1.2.x stable; planner verifies exact tag at plan time |
| postgres:16 | `postgres:16` | Database | [VERIFIED: arm64v8/postgres multi-arch manifest covers postgres:16; OCI Ampere docs confirm Postgres deploys cleanly]. Same image used in dev `docker-compose.yml` |
| nginx | apt-current (1.24+) | Reverse proxy + cache + TLS | [CITED: mykb/infra/setup.sh — apt-installed nginx is the simplest path]. Phase 7 config already targets this version |
| certbot + python3-certbot-nginx | apt-current | TLS issuance + renewal | [CITED: certbot.eff.org/instructions?ws=nginx&os=ubuntufocal — official Ubuntu install path] |
| iptables-persistent | apt-current | Firewall persistence across reboots | [CITED: mykb/infra/setup.sh:26] |

### Supporting (apt deps + tools)

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `openssl` | `openssl rand -hex 32` for Postgres password | D-14 — one-time |
| `oci` CLI (optional) | Reserve public IP, attach to VNIC | 08-03; OCI Console UI also works |
| `dig` / `nslookup` | DNS propagation check | 08-03 smoke test |
| `curl --resolve` | TLS pre-flight before DNS cutover | 08-02/08-03 [VERIFIED: everything.curl.dev/usingcurl/connections/name.html — `--resolve` preserves SNI + cert verification] |
| `systemctl` | Nginx + certbot.timer status | runbook common ops |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| oven/bun:1-alpine | oven/bun:1-debian | Debian is larger (~120MB vs ~85MB) but avoids musl quirks. Alpine is fine for Bun (verified by community) [CITED: ykira.com/blog/container-images-guide]. Stick with alpine for size + dev parity |
| Host Nginx | Nginx-in-Docker | LOCKED OUT by D-01. Containerized Nginx would simplify the "one stack, one command" story but breaks the mykb proxy-rebuild pattern and complicates certbot integration |
| certbot --nginx | acme.sh / lego / manual webroot | certbot is the established LE client; --nginx plugin handles config injection automatically. mykb uses Caddy's built-in ACME — we can't because we need Phase 7's proxy_cache |
| docker-compose.prod.yml override | profiles | Both work [CITED: lours.me/posts/compose-tip-019-override-files/]. Override file is cleaner for "strip a port mapping" because `ports: []` overrides dev's `ports: ["5432:5432"]`. Profiles require splitting services into groups |
| Build on VM (D-10) | Cross-compile from laptop | LOCKED. Cross-compile via buildx-qemu is ~3x slower on x86 macOS for arm64 targets; building on the actual ARM VM is faster and avoids qemu-x86-to-arm64 native-module rebuild headaches (sharp, pg) |
| Single .env via SCP | docker secrets / vault | LOCKED by D-13. Vault is overkill for a portfolio project with one server |
| Named volume pgdata | bind mount /var/lib/postgresql | Named volume is portable across `docker compose down`/`up`; bind mount makes host-level snapshots easier. Named is the established dev pattern (`docker-compose.yml:11`); keep symmetry |

**Installation (target VM, post-ssh):**
```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx iptables-persistent git
sudo usermod -aG docker ubuntu
# logout/login required for docker group to take effect on the ubuntu user
```

**Version verification at plan time:**
```bash
# On laptop, before committing the Dockerfile pin:
docker pull oven/bun:1-alpine && docker image inspect oven/bun:1-alpine --format '{{.Architecture}} {{.Os}}'
# Look for a 1.2.x exact tag on docker hub for an explicit pin
```

## Architecture Patterns

### System Architecture Diagram

```
Internet (mobile + desktop)
  │  DNS A: timeline.bryanlam.dev → OCI Reserved Public IP
  ▼
[OCI VCN Security List]  ports 80, 443 OPEN ← double-layer
[host iptables]          ACCEPT 80, 443  ← BEFORE the OCI base REJECT rule (D-04)
  │
  ▼
[host Nginx :80, :443]  ← TLS termination by certbot, HTTP→HTTPS redirect
  │
  ├── proxy_cache zone "public_reel" (in /var/cache/nginx/public_reel)
  │     └─ caches GET /api/public/u/:handle (5m TTL) + GET /u/:handle (5m TTL)
  │
  ├── proxy_pass http://timeline_api  (upstream: 127.0.0.1:3000)
  │     │
  │     ▼
  │   [API container :3000]  ← oven/bun:1-alpine running `bun run server/index.ts`
  │     │     ├── /api/health  GET → SELECT 1 on Postgres → {status:'ok', db:'ok'}
  │     │     ├── /api/handles/check, /api/public/u/:handle  (no auth)
  │     │     ├── /api/me, /api/cities, /api/photos  (JWT via Auth0 JWKS)
  │     │     └── static /, /u/:handle fallback → serves dist/index.html
  │     │             (Vite-built React bundle baked into image at build time)
  │     │
  │     ▼  internal docker network: timeline-revamp_default
  │   [Postgres container :5432]  ← postgres:16, port NOT host-published
  │             │
  │             ▼
  │       [named volume pgdata]
  │
  └── /etc/letsencrypt/live/timeline.bryanlam.dev/{fullchain,privkey}.pem
        │
        ▼
      [certbot.timer (systemd)]  ← auto-renew, nightly, nginx -s reload on success

[External]
  ├── Auth0 tenant — JWKS fetched by API container on cold start
  ├── MapTiler CDN — vector tiles fetched by browser directly
  └── OCI Object Storage — photos fetched by browser via PAR URLs (CORS already set, Phase 6)
```

### Recommended Project Structure

```
timeline-revamp/
├── Dockerfile                          # NEW — multi-stage: bun build (Vite + Hono) → bun runtime
├── .dockerignore                       # NEW — exclude node_modules, .env, .git, .planning, .dev
├── docker-compose.yml                   # MODIFIED — adds `api` service; postgres unchanged
├── docker-compose.prod.yml              # NEW — production override: strips postgres ports, sets restart:always
├── ops/
│   └── nginx/
│       └── timeline.conf               # EXISTING — Phase 7, symlink into /etc/nginx/conf.d/
├── infra/                              # NEW directory — mykb pattern
│   ├── setup.sh                        # NEW — VM bootstrap (apt installs, /opt/timeline-revamp, iptables)
│   └── DEPLOY.md                       # NEW — runbook (Prerequisites, First Deploy, Common Ops, Troubleshooting)
├── server/
│   ├── index.ts                        # MODIFIED — /api/health gains pg SELECT 1 ping; add hono/serve-static for dist/
│   └── ...
└── (rest unchanged)
```

### Pattern 1: Multi-stage Dockerfile for Bun + Vite + Hono

**What:** One Dockerfile, three stages: `deps` (install all deps), `builder` (run `bun run build` to compile Vite client + typecheck server), `runtime` (oven/bun:1-alpine + copy `dist/` + copy `server/` + copy production deps).

**When to use:** Single-image deploy where the API serves both `/api/*` and the static SPA. Matches the locked decision (build on VM, single container).

**Example:**
```dockerfile
# Source: bun.com/docs/guides/ecosystem/docker + community best practices
# syntax=docker/dockerfile:1.7

# ---- Stage 1: install all deps (build needs vite, tsx, drizzle-kit, etc.) ----
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---- Stage 2: build the Vite client + verify TS typecheck ----
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# VITE_* must be available at build time (Vite inlines them).
# docker compose --env-file .env build … passes them via env_file
# (env_file on service is for runtime; for build use `build: { args: }` or `env_file` + ARG)
ARG VITE_MAPTILER_KEY
ARG VITE_AUTH0_DOMAIN
ARG VITE_AUTH0_CLIENT_ID
ARG VITE_AUTH0_AUDIENCE
ENV VITE_MAPTILER_KEY=$VITE_MAPTILER_KEY \
    VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN \
    VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID \
    VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE
RUN bun run build

# ---- Stage 3: runtime — slim image, non-root user, only what's needed ----
FROM oven/bun:1-alpine AS runtime
WORKDIR /app
# Create non-root user (Alpine uses addgroup/adduser)
RUN addgroup -g 1001 -S app && adduser -u 1001 -S app -G app
# Bring production deps only (avoid build-only tools)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./package.json
# tsconfig files needed because server/ runs through tsx (or `bun run` directly resolves TS)
COPY --from=builder /app/tsconfig*.json ./
USER app
EXPOSE 3000
# Bun executes TS natively — no tsx in production
CMD ["bun", "run", "server/index.ts"]
```

[VERIFIED: bun.com/docs/guides/ecosystem/docker pattern; oneuptime.com/blog/post/2026-01-16-docker-run-non-root-user/view for non-root Alpine pattern]

**Critical port note:** The Dockerfile EXPOSEs 3000. Phase 7's `timeline.conf` upstream targets `127.0.0.1:3000`. The production compose's API service MUST publish `3000:3000` (so host Nginx on `localhost:3000` reaches it), OR Nginx must reach via Docker's host-gateway. **Decision: publish `3000:3000` on the host loopback only** (`"127.0.0.1:3000:3000"`) — this keeps the public attack surface clean and matches what Phase 7's `timeline.conf` already declares. The `server/env.ts` schema defaults PORT to 8787; the production `.env` must set `PORT=3000` to match the upstream.

> ⚠️ This is a discrepancy planner must address: `server/env.ts` default 8787, `timeline.conf` upstream 3000. Pick ONE (D-08-derived recommendation: change the upstream to 8787 since the dev workflow + tests assume 8787 — Vite proxy already targets 8787 in `vite.config.ts:43`). Edit `ops/nginx/timeline.conf:36` to `server 127.0.0.1:8787;`. The Phase 7 author left a note: "Phase 8 may rewrite the address" — so this edit is in-scope and pre-blessed.

### Pattern 2: docker-compose.prod.yml override for the no-published-port rule

**What:** Base `docker-compose.yml` continues to publish 5432 for dev (psql/Drizzle Studio). Production deploy runs `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` which overrides `postgres.ports: []` and adds the `api` service.

**When to use:** Production-vs-dev environment differences. Override files are clearer than profiles for port stripping [CITED: docker.recipes/docs/compose-overrides].

**Example:**
```yaml
# docker-compose.prod.yml
services:
  postgres:
    ports: []                      # override the dev port mapping
    restart: always
  api:
    build:
      context: .
      args:
        VITE_MAPTILER_KEY: ${VITE_MAPTILER_KEY}
        VITE_AUTH0_DOMAIN: ${VITE_AUTH0_DOMAIN}
        VITE_AUTH0_CLIENT_ID: ${VITE_AUTH0_CLIENT_ID}
        VITE_AUTH0_AUDIENCE: ${VITE_AUTH0_AUDIENCE}
    env_file: .env
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://timeline:${POSTGRES_PASSWORD}@postgres:5432/timeline
      PORT: 8787
    ports:
      - "127.0.0.1:8787:8787"      # bind to loopback only — Nginx is the public entry
    depends_on:
      postgres:
        condition: service_healthy   # wait for postgres healthcheck to pass
    restart: always
```

[VERIFIED: docs.docker.com/compose/how-tos/startup-order/ — `service_healthy` is the right condition for "wait for postgres ready"; matches dev compose's existing healthcheck block]

### Pattern 3: certbot --nginx run against an existing `listen 80` block

**What:** Phase 7's `timeline.conf` already declares `listen 80; server_name timeline.bryanlam.dev;`. certbot --nginx detects this block by `server_name` match, injects ACME challenge handling, obtains the cert, edits the SAME file (through the symlink — verified safe) to add `listen 443 ssl;` + `ssl_certificate` + `ssl_certificate_key` + a `return 301 https://...` rewrite in the port-80 block.

**When to use:** First-time cert issuance.

**Sequence:**
```bash
# Pre-conditions:
# - DNS for timeline.bryanlam.dev resolves to the VM's reserved IP (DNS A propagated)
# - port 80 OPEN through OCI VCN + iptables (D-04, D-05)
# - /etc/nginx/conf.d/timeline.conf is a symlink to /opt/timeline-revamp/ops/nginx/timeline.conf
# - nginx -t passes; sudo systemctl reload nginx done

sudo certbot --nginx \
  -d timeline.bryanlam.dev \
  --non-interactive \
  --agree-tos \
  --email you@example.com \
  --redirect          # auto-inject HTTP→HTTPS redirect (D-06)

# Verify:
sudo nginx -t                                           # config still valid after certbot edits
curl -I https://timeline.bryanlam.dev                   # 200 + valid cert
sudo systemctl status certbot.timer                     # active (waiting)
sudo certbot renew --dry-run                            # exercises renewal path
```

[VERIFIED: certbot.eff.org/instructions; community.letsencrypt.org/t/certbot-will-not-modify-the-nginx-conf-file/204373 — certbot edits the actual file via symlinks correctly. The "expected to be a symlink" error from notepad.patheticcockroach.com refers to `/etc/letsencrypt/live/` internals, NOT user conf.d files.]

### Pattern 4: cert-edits-flow-back-to-repo decision

**What:** When certbot edits `/opt/timeline-revamp/ops/nginx/timeline.conf` through the conf.d symlink, the repo working tree is now dirty.

**Decision needed (planner picks, flagged in 08-CONTEXT.md):**

**Option A: Commit the certbot mutations.** Pros: repo stays source of truth; re-deploying to a fresh VM reuses the same TLS block. Cons: cert paths (`/etc/letsencrypt/live/timeline.bryanlam.dev/...`) are leaked into the repo, which is fine since those are public knowledge for the domain.

**Option B: Use a separate include file.** Make `timeline.conf` import `/etc/nginx/conf.d/timeline-tls.conf` (managed by certbot), keep the cert paths out of the repo. Cleaner separation. Requires extra setup.

**Recommendation: Option A** — simpler, fits the "manual SSH for W8" baseline. Commit the edits with a `chore(infra): commit certbot --nginx edits` message. Phase 9 can refactor to Option B if needed.

### Pattern 5: Symlink-update loop (proxy config edits)

**What:** `git pull` updates `ops/nginx/timeline.conf` (via the symlink, the change is visible at `/etc/nginx/conf.d/timeline.conf` instantly). Validate + reload.

**Example:**
```bash
# Standard proxy-config update loop:
cd /opt/timeline-revamp && git pull
sudo nginx -t                            # MANDATORY — catches bad edits before reload
sudo systemctl reload nginx              # graceful reload, zero-downtime
```

[CITED: D-02 in 08-CONTEXT.md — symlink + `nginx -t` validation is the locked pattern]

### Anti-Patterns to Avoid

- **`copy` ops/nginx/timeline.conf into /etc/nginx/conf.d/ instead of symlinking:** breaks D-02. Future proxy edits would need `cp` then `nginx -t` and the repo + filesystem drift.
- **`bun install` in CMD/ENTRYPOINT:** defeats the layer cache, slows every deploy. Install at image build, not run.
- **Skipping `nginx -t` before reload:** a bad edit takes the entire site down. `nginx -t` catches it; `systemctl reload nginx` only applies on `-t` pass when called via the official systemd unit, but skipping the explicit `-t` step makes debugging slower.
- **DNS cutover before certbot succeeds:** creates a "TLS not yet issued + DNS already pointing here" window where every visitor gets a 502/cert error. D-19 sequencing prevents this — verify with `curl --resolve` first.
- **Running docker compose without `--build` after a code change:** stale image stays running. The canonical ship loop is `git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`.
- **`bun install --frozen-lockfile` from inside the `runtime` stage:** redundant — `deps` stage already installed. Just `COPY --from=deps node_modules`. [VERIFIED: github.com/oven-sh/bun/issues/10371 — frozen-lockfile is slow in Docker, run it once in the deps stage with cache mounts if possible.]
- **Cross-origin photos hitting CORS:** Phase 6 set bucket CORS to allow `https://timeline.bryanlam.dev`. Verify it survived — if missing, the photo loads will silently fail in production even though dev works. See `feedback_oci_cors_via_s3.md` — re-apply via S3-compat API, NOT Console UI, NOT Native API.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TLS certificate issuance | Custom ACME client / manual openssl req | `certbot --nginx` | Battle-tested, handles renewal, ALPN-01 + HTTP-01 challenges, auto-edits Nginx |
| TLS certificate renewal | cron + curl + reload script | `certbot.timer` (systemd, installed by certbot's apt package) | Twice-daily timer, jitter, atomic reload on success [CITED: certbot.eff.org/docs/using.html] |
| HTTP→HTTPS redirect | Manual `return 301` rewrite | `certbot --nginx --redirect` flag | Plugin injects it correctly; survives renewals |
| Container ordering / wait-for-DB | Custom wait-for-it.sh entrypoint | `depends_on.condition: service_healthy` (Compose v2) | Native Compose feature; Postgres healthcheck already in compose |
| Static SPA fallback (`/u/:handle` → index.html) | Custom router | `hono/serve-static` + `try_files $uri /index.html` (already in timeline.conf:120) | Both layers handle it; Hono serves dist/, Nginx caches the response |
| Postgres password generation | `echo "password"` or weak gen | `openssl rand -hex 32` | Locked by D-14; 64 hex chars = 256 bits entropy |
| Reserved public IP | Manual IP-rotation handling on stop/start | OCI Reserved Public IP feature | One-time attach via Console or `oci network public-ip update` |
| iptables persistence across reboots | `/etc/rc.local` hack | `iptables-persistent` package + `netfilter-persistent save` | Locked by D-04; mykb-verified pattern |
| Production logs | Custom file appender | `docker compose logs` (default json-file driver) | OK for v1; D-defer-journald per Claude's discretion |
| Backup automation | Custom cron + S3 push | Manual `pg_dump` runbook recipe | Locked by D-18 — automation deferred to Phase 9+ |
| Health check retry loop | Custom polling script | Health check command with `for i in {1..12}; do curl -sf ... && break; sleep 5; done` in the runbook | mykb pattern (DEPLOYMENT.md "12 attempts, 5s apart") — adopt verbatim |

**Key insight:** This phase is almost entirely "wire existing battle-tested pieces together." The only NEW code is (1) the Dockerfile, (2) the `/api/health` DB ping, (3) the prod compose override, (4) the static-serve in Hono. Everything else is config + a bash runbook.

## Runtime State Inventory

> Phase 8 is a deploy, not a rename. This category-by-category check confirms nothing is being changed in a way that orphans existing runtime state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 8 introduces production Postgres for the first time. The dev DB on `OrbStack:postgres:5432` stays unchanged and unrelated. Phase 6's OCI Object Storage bucket stays unchanged (timeline-photos). | None — fresh production DB starts empty; seed users are out of scope |
| Live service config | Auth0 tenant: `Allowed Callback URLs` must add `https://timeline.bryanlam.dev/app` (currently only `http://localhost:5173/app` and the LAN HTTPS dev URL). Allowed Logout URLs and Allowed Web Origins similarly. This config lives in Auth0 dashboard, NOT git. | Runbook step in 08-03 BEFORE smoke test |
| Live service config | OCI Object Storage CORS rules (`timeline-photos` bucket): currently allows `http://localhost:5173` per Phase 6. Production domain `https://timeline.bryanlam.dev` may already be in the list (memory note suggests both were added). | Verify via `aws s3api get-bucket-cors --endpoint-url <oci-s3>` BEFORE smoke. Re-apply via S3-compat API if missing — DO NOT use OCI Native API or Console (silent drop) per `feedback_oci_cors_via_s3.md` |
| Live service config | DNS A record for `timeline.bryanlam.dev`: target unknown (need to check `bryanlam.dev` registrar). Common candidates: Cloudflare, Namecheap, GoDaddy. Lower TTL ahead of cutover. | Runbook step: `dig timeline.bryanlam.dev` pre-cutover to see if any record exists; lower TTL on `bryanlam.dev` zone to 300s the day before |
| OS-registered state | systemd: `nginx.service`, `certbot.timer`, `docker.service` will all be system-managed after `apt install`. No pre-existing state on a fresh OCI VM. | Verify post-install with `systemctl is-enabled nginx certbot.timer docker` |
| OS-registered state | iptables rules: OCI Ubuntu base image ships a default `REJECT` rule that blocks 80/443. `iptables -L INPUT -n --line-numbers` confirms the REJECT line; ACCEPT rules for 80+443 must be `-I`-inserted BEFORE it. | mykb-verified incantation in setup.sh; runbook MUST include `iptables -L INPUT -n --line-numbers` verification step |
| Secrets/env vars | `.env.local` (dev) → `.env` (prod) on the VM. New keys: production `POSTGRES_PASSWORD` (openssl rand -hex 32), production Auth0 callback URL is a dashboard change, NOT an env change. All `VITE_*` and server-side keys mirror `.env.local`. | SCP step in 08-01; verify dual-runtime env-var coverage per `feedback_dual_runtime_env.md` |
| Secrets/env vars | OCI Object Storage credentials (OCI_TENANCY_OCID, OCI_USER_OCID, OCI_FINGERPRINT, OCI_PRIVATE_KEY_PATH, OCI_PRIVATE_KEY_PASSPHRASE, OCI_REGION, OCI_NAMESPACE, OCI_BUCKET_NAME) — same values as dev. PEM file path is local on dev machine; on VM, copy the PEM to a path like `/opt/timeline-revamp/.oci/timeline-revamp.pem` and update OCI_PRIVATE_KEY_PATH. | SCP step; chmod 600 on the PEM |
| Build artifacts | None pre-existing on a fresh VM. First `docker compose build` will create the `timeline-revamp-api` image. | Document `docker image prune -f` in runbook for periodic cleanup |

**Nothing-found in category:** "Stored data" rows are confirmed empty because this is a first-time production deploy (verified via STATE.md: "Phase 8 prereq: OCI Ampere A1 VM provisioning — confirm 2 OCPU / 8 GB sizing" and "DNS for timeline.bryanlam.dev not yet pointed"). The dev DB on the laptop is separate runtime state that Phase 8 does not touch.

## Common Pitfalls

### Pitfall 1: Port 3000 vs 8787 discrepancy
**What goes wrong:** Phase 7's `timeline.conf:36` declares `upstream timeline_api { server 127.0.0.1:3000; }`. But the API listens on env-configured `PORT` (default 8787 per `server/env.ts:14`). If you set `PORT=3000` in `.env` and forget that Vite dev expects 8787 → dev breaks. If you leave PORT=8787 and forget to edit timeline.conf → production proxy returns 502.
**Why it happens:** Two different files declare the port, with no single source of truth.
**How to avoid:** **Standardize on 8787**. Edit `ops/nginx/timeline.conf:36` to `server 127.0.0.1:8787;` (Phase 7 author explicitly authorized this in the file comment). In production compose, publish `127.0.0.1:8787:8787`. Verify with `curl http://127.0.0.1:8787/api/health` from the VM shell after `docker compose up -d`.
**Warning signs:** 502 Bad Gateway on every request post-deploy; `docker compose logs api` shows the API listening on a different port than Nginx is trying to reach.

### Pitfall 2: VITE_* env vars baked at wrong time
**What goes wrong:** Vite inlines `import.meta.env.VITE_*` values at BUILD time, not runtime. If the `Dockerfile` doesn't receive them as `ARG`s and the build runs without them, the production bundle has the dev MapTiler key (or none), the dev Auth0 client_id, and points at the dev callback URL.
**Why it happens:** People put `VITE_*` in `env_file` thinking it'll be passed to the build — but `env_file` is runtime-only. Build args need `build.args` in compose + `ARG`+`ENV` in Dockerfile.
**How to avoid:** The Dockerfile template above declares ARGs for each VITE_*. The prod compose override declares `build.args: VITE_*: ${VITE_*}` reading from `.env`. Confirm by running `grep "VITE_" dist/assets/*.js` after build — values should be present, not literal `VITE_*` strings.
**Warning signs:** Frontend shows MapTiler "demotiles fallback" in prod; Auth0 login redirects to `http://localhost:5173/app`; `import.meta.env.VITE_MAPTILER_KEY` is undefined in browser console.
**Reference:** `feedback_dual_runtime_env.md` — verify both sides of every dual key pair.

### Pitfall 3: Bun ESM + bare require()
**What goes wrong:** Phase 6 found that `require()` in server-side ESM code throws `ReferenceError` at runtime even though TypeScript + tests pass. Bun's ESM mode is strict.
**Why it happens:** Type-only check + mocked-out test path can hide a CJS require() in production code.
**How to avoid:** `feedback_esm_require_in_tsx_watch.md` — grep `server/` for `\brequire\(` and verify each one is `createRequire(import.meta.url)`. The Phase 8 runbook should include a post-deploy live smoke test that exercises a real OCI PAR mint call (not just `/api/health`), since the OCI client is the historical offender.
**Warning signs:** 500 errors on photo-upload flow only; `/api/health` returns 200 but `/api/cities/:id/photos/upload-url` ReferenceErrors.

### Pitfall 4: certbot first-run port 80 collision with existing listen
**What goes wrong:** If you accidentally have two server blocks both listening on port 80 with the same `server_name`, certbot --nginx gets confused and may edit the wrong block.
**Why it happens:** Default `/etc/nginx/sites-enabled/default` ships with a `server_name _;` catch-all. Combined with our `timeline.conf` declaring `server_name timeline.bryanlam.dev;`, certbot's heuristic picks the right one — but if you previously created a stray `/etc/nginx/conf.d/foo.conf` with the same server_name, it'll fail.
**How to avoid:** Before running certbot, `sudo nginx -T 2>/dev/null | grep -E "^\s*(server_name|listen)"` and confirm only ONE block matches `timeline.bryanlam.dev`. Disable the default site if you don't need it: `sudo rm /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl reload nginx`.
**Warning signs:** certbot reports "no matching virtual host found" or edits a different file than the symlinked one.

### Pitfall 5: iptables ACCEPT rule comes AFTER REJECT rule
**What goes wrong:** OCI Ubuntu's default `iptables -L INPUT` has a `REJECT --reject-with icmp-host-prohibited` rule at some position N. If you `iptables -A INPUT -p tcp --dport 443 -j ACCEPT` (append, not insert), the rule lands AFTER position N — meaning all 443 traffic still gets rejected.
**Why it happens:** `-A` appends; `-I` inserts. Most tutorials use `-A`.
**How to avoid:** Use `-I INPUT 6` (or whatever line number is before the REJECT). mykb's setup.sh hard-codes position 6, which works on a fresh OCI Ubuntu image. Verify with `iptables -L INPUT -n --line-numbers` — ACCEPT for 80/443 MUST appear above any REJECT.
**Warning signs:** `curl https://timeline.bryanlam.dev` from outside hangs/times out; from `localhost` on the VM works fine. `tcpdump -i any port 443` shows packets arriving and getting dropped.
**Reference:** mykb/docs/DEPLOYMENT.md:268-280 — verbatim verification recipe.

### Pitfall 6: DNS A record points before TLS issued
**What goes wrong:** You update DNS first, then try to run certbot. certbot's HTTP-01 challenge succeeds (port 80 reachable), cert issues fine. BUT during the few minutes between "DNS pointed" and "certbot succeeded," every visitor gets a 502 (no TLS cert, no HTTPS listen block).
**Why it happens:** Eagerness — DNS is the "last step" mental model but the cert depends on DNS.
**How to avoid:** D-19 sequencing — verify TLS works against the VM IP first via `curl --resolve timeline.bryanlam.dev:443:<vm-ip> -v https://timeline.bryanlam.dev/api/health`. Only then update DNS.
**Warning signs:** Recruiter clicks the link in the 5-minute window, sees a cert warning, never comes back.

### Pitfall 7: Building on the VM exhausts RAM
**What goes wrong:** Multi-stage Bun + Vite build on a 2-OCPU / 8 GB ARM VM CAN spike to 4+ GB RAM during Vite's bundling step (esbuild + rollup + maplibre source). With Postgres also running, the VM swaps or OOM-kills.
**Why it happens:** Vite's prod build is memory-hungry; 8 GB is the minimum required.
**How to avoid:** Build with the API container's previous image still running (Postgres unaffected); BUT during the very first build, Postgres isn't up yet, so RAM is fully available. For subsequent rebuilds, monitor with `free -h` during build. If OOM happens, stop the API service before rebuild: `docker compose stop api && docker compose up -d --build api`.
**Warning signs:** `docker compose build` exits with no error message but the resulting image is missing files; `dmesg | tail` shows `Out of memory: Killed process`.

### Pitfall 8: Post-merge install missed inside Docker build
**What goes wrong:** `feedback_post_merge_install.md` — after `git pull` that touched `package.json`, you need to reinstall deps. With Docker, this is automatic IF the Dockerfile properly invalidates the deps layer cache. But if the COPY order is wrong (copy . then COPY package.json), the cache is wrong.
**Why it happens:** Dockerfile authoring mistake.
**How to avoid:** The template above does `COPY package.json bun.lock ./` BEFORE `COPY . .`. This ensures the deps layer is rebuilt only when package.json or bun.lock change. Verify by changing a single src/ file → rebuild should reuse the deps cache.
**Warning signs:** Build takes 3-5 min even for a single-line source change; or, conversely, a dep update doesn't reach the runtime image.

### Pitfall 9: Static assets served by Hono have no caching headers
**What goes wrong:** Without explicit `Cache-Control: max-age=...` on JS/CSS, browsers don't aggressively cache the Vite bundle, every reload re-downloads ~300KB.
**Why it happens:** `hono/serve-static` doesn't set Cache-Control by default.
**How to avoid:** Either (a) Nginx adds the headers in `location /` block via `expires 1y;` for hashed assets, or (b) Hono's `serveStatic` middleware accepts a header map. Vite emits hashed filenames (`index-abc123.js`), so 1-year cache is safe. Phase 7's `timeline.conf` does NOT currently set this — the `location /` block just does `try_files`. Planner consideration: add `expires 1y;` for `/assets/*` in timeline.conf, OR set in Hono.

## Code Examples

### Example 1: /api/health with Postgres ping (replaces `server/index.ts:25-26`)

```typescript
// Source: extension of existing handler; pg pattern verified against drizzle docs
import { Pool } from 'pg';

// Module-level pool reuse — Drizzle already exports one; reuse it.
// Hook into existing db client in server/db/client.ts (assumed to export pool).
import { db } from './db/client.js';  // or wherever the existing Pool lives

app.get('/api/health', async (c) => {
  try {
    // Drizzle's underlying pg client — `db.execute` runs raw SQL.
    await db.execute('SELECT 1');
    return c.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    // Log for the operator; never leak details.
    process.stderr.write(`/api/health DB ping failed: ${String(err)}\n`);
    return c.json({ status: 'error', db: 'unreachable' }, 503);
  }
});

// Keep the bare /health for direct-API probes that don't need DB visibility:
app.get('/health', (c) => c.json({ status: 'ok' }));
```

[ASSUMED] The exact import for `db` depends on existing code in `server/db/` — planner verifies. Drizzle's `db.execute(sql\`SELECT 1\`)` is the documented one-liner.

### Example 2: hono/serve-static for the Vite dist/

```typescript
// Source: hono.dev/docs/getting-started/nodejs#serve-static-files
import { serveStatic } from '@hono/node-server/serve-static';

// Mount AFTER all /api routes, BEFORE the SPA fallback.
app.use('/*', serveStatic({ root: './dist' }));

// SPA fallback — must come last so /api/* is matched first.
app.get('*', serveStatic({ path: './dist/index.html' }));
```

[ASSUMED] Exact `serve-static` API per `@hono/node-server` 2.x — planner verifies during plan-write.

**Note:** Nginx ALSO does `try_files $uri /index.html;` for `/` and `/u/:handle` (`timeline.conf:92,119`). The double layer is fine: Nginx serves cached responses; cache miss proxies through to Hono which serves from dist/. No duplication of bytes — Hono ships dist via the container, Nginx caches in `/var/cache/nginx/public_reel`.

### Example 3: docker-compose.prod.yml (the override file)

Already shown in Pattern 2 above. Re-cite key lines:
- `ports: []` strips the dev port mapping (D-11 satisfied)
- `condition: service_healthy` waits for Postgres readiness (no race)
- `restart: always` for prod, `restart: unless-stopped` in base = sane defaults
- `ports: ["127.0.0.1:8787:8787"]` binds to loopback only

### Example 4: infra/setup.sh (mykb-adapted)

```bash
#!/usr/bin/env bash
# Source: adapted from ~/Workspaces/mykb/infra/setup.sh
set -euo pipefail

echo "==> Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

echo "==> Installing Docker + Compose v2..."
sudo apt-get install -y docker.io docker-compose-plugin

echo "==> Installing Nginx + certbot + iptables-persistent + git..."
sudo apt-get install -y nginx certbot python3-certbot-nginx iptables-persistent git

echo "==> Adding ubuntu user to docker group..."
sudo usermod -aG docker ubuntu
echo "    NOTE: log out and back in for the group change to take effect."

echo "==> Opening firewall ports (80, 443) — BEFORE the REJECT-all rule..."
# mykb pattern (infra/setup.sh:27-29). The position-6 insert lands BEFORE the
# OCI Ubuntu default REJECT rule. Verify with:
#   sudo iptables -L INPUT -n --line-numbers
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

echo "==> Setting timezone to UTC..."
sudo timedatectl set-timezone UTC

echo "==> Creating app directory..."
sudo mkdir -p /opt/timeline-revamp
sudo chown ubuntu:ubuntu /opt/timeline-revamp

echo "==> Cloning repository..."
if [ ! -d /opt/timeline-revamp/.git ]; then
  git clone https://github.com/usbryanchlam/timeline-revamp.git /opt/timeline-revamp
else
  echo "    Repository already cloned, skipping."
fi

echo "==> Setup complete!"
echo ""
echo "Next steps (see infra/DEPLOY.md):"
echo "  1. SCP .env from local: scp .env ubuntu@<vm>:/opt/timeline-revamp/.env"
echo "  2. SCP OCI PEM: scp ~/.oci/timeline-revamp.pem ubuntu@<vm>:/opt/timeline-revamp/.oci/"
echo "  3. chmod 600 /opt/timeline-revamp/.oci/timeline-revamp.pem"
echo "  4. Symlink Nginx conf: sudo ln -s /opt/timeline-revamp/ops/nginx/timeline.conf /etc/nginx/conf.d/timeline.conf"
echo "  5. sudo nginx -t && sudo systemctl reload nginx"
echo "  6. Update Auth0 dashboard: add https://timeline.bryanlam.dev/app to Allowed Callback URLs"
echo "  7. cd /opt/timeline-revamp && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
echo "  8. Wait for healthy: docker compose ps; curl http://127.0.0.1:8787/api/health"
echo "  9. Run db:migrate inside the API container: docker compose exec api bun run db:migrate"
echo "  10. sudo certbot --nginx -d timeline.bryanlam.dev --non-interactive --agree-tos --email <you> --redirect"
echo "  11. Pre-DNS TLS test: curl --resolve timeline.bryanlam.dev:443:<vm-ip> -I https://timeline.bryanlam.dev/api/health"
echo "  12. Update DNS A record for timeline.bryanlam.dev → <vm-ip>"
echo "  13. Run smoke battery (see infra/DEPLOY.md § Smoke Test)"
```

### Example 5: Smoke-test retry loop (mykb pattern, adopted)

```bash
# Source: adapted from mykb/docs/DEPLOYMENT.md "12 attempts, 5s apart"
# Wait for /api/health to return 200 + {db:'ok'} after compose up.
for i in {1..12}; do
  echo "==> Health check attempt $i..."
  if curl -sf http://127.0.0.1:8787/api/health | grep -q '"db":"ok"'; then
    echo "    HEALTHY"
    break
  fi
  if [ "$i" -eq 12 ]; then
    echo "    TIMEOUT after 60s"; exit 1
  fi
  sleep 5
done
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `docker-compose` (Python v1) | `docker compose` (Go v2, plugin) | 2023 — Compose v2 GA | Use `docker compose` (no dash); compose v2 syntax — no `version:` top-line needed |
| Caddy 2 + automatic HTTPS | Nginx + certbot (here) OR Caddy | n/a — choice locked | Caddy would be simpler but lacks Phase 7's `proxy_cache` ergonomics. mykb uses Caddy; we don't |
| `wait-for-it.sh` / `dockerize -wait` | `depends_on.condition: service_healthy` | Compose v2 (2021+) | Native; healthcheck-driven; no extra script |
| cron + certbot renew | systemd `certbot.timer` | certbot 1.32+ on Ubuntu | Two-runs-per-day with jitter, atomic |
| Single-stage Dockerfile | Multi-stage Dockerfile | Docker 17.05+ | 60-80% smaller runtime images; required for prod |
| Append iptables rules | Insert before REJECT rule | OCI Ubuntu base image specifics | Required; mykb pattern |
| `latest` image tag | Pinned `1.2.x-alpine` tag | Always (best practice) | Reproducible deploys, no surprise base-image regressions |
| Manual cert renewal | `certbot.timer` + `nginx -s reload` on success | Default since certbot 1.x on systemd Ubuntu | Zero-touch renewal |

**Deprecated/outdated:**
- `version: '3.8'` at top of compose.yaml — ignored by Compose v2; can omit (or keep, it's no-op).
- `docker-compose` CLI — replaced by `docker compose` (no dash).
- `links:` in compose — replaced by Compose's automatic service-name DNS on the default network.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | oven/bun:1-alpine 1.2.x is the right pin at plan time | Standard Stack | Plan picks a tag that's missing arm64 manifest or a known regression. Mitigation: planner runs `docker pull oven/bun:1-alpine && docker image inspect ... --format '{{.Architecture}}'` to verify before committing |
| A2 | DNS provider for `bryanlam.dev` is accessible to user, supports A records, no Cloudflare proxy | Pitfall 6 / D-19 | If Cloudflare is in proxy mode, certbot HTTP-01 challenge can fail; if registrar has long TTL, cutover propagates slowly. Mitigation: include "lower TTL 24h ahead of cutover" runbook step |
| A3 | OCI Ampere A1 VM has 2 OCPU / 8 GB / Ubuntu 22.04 or 24.04 already provisioned per STATE.md "Phase 8 prereq" | Pitfall 7 | If VM is smaller, build OOMs; if it's CentOS/Oracle Linux, apt commands fail. Mitigation: runbook prerequisite check |
| A4 | The exact `db` import path for the SELECT 1 ping exists at `server/db/client.ts` (or similar) | Code Examples §1 | Planner discovers the path during plan write |
| A5 | Vite build output is `dist/` at repo root (Vite default, not customized) | Pattern 1 | Verified by reading vite.config.ts — no custom outDir set, so default applies. Confirmed |
| A6 | OCI Object Storage CORS rule for `https://timeline.bryanlam.dev` was added in Phase 6 OR will be re-applied via S3-compat in Phase 8 | Runtime State Inventory | If missing, photos return CORS errors. Mitigation: 08-03 smoke test step: load a photo in the deployed reel, confirm it renders |
| A7 | Auth0 production callback URL change can be made by user via dashboard (i.e., user has admin access to the tenant) | Runtime State Inventory | If not, login fails on production. Mitigation: documented as a manual prerequisite |
| A8 | The reserved-public-IP feature is already available on the OCI free tier account | OCI workflow | Reserved IPs are free on OCI's free tier; well-established. Low risk |
| A9 | The bare `/health` endpoint at `server/index.ts:25` is OK to leave as-is (no DB ping needed there) | Code Examples §1 | If the runbook's smoke test uses `/health` instead of `/api/health`, it won't catch DB-unreachable failures. Mitigation: smoke test uses `/api/health` explicitly |
| A10 | `bun run db:migrate` works inside the API container (tsx is in node_modules from `deps` stage) | Setup script step 9 | If tsx isn't available because of `--production` flag tightening, migration fails. Mitigation: Dockerfile keeps full node_modules from `deps` stage (not just prod deps); confirmed in template above |
| A11 | Phase 7's OCI bucket CORS for `https://timeline.bryanlam.dev` survived Phase 6's apply via S3-compat path | Runtime State Inventory | If CORS was applied for localhost only, prod photos break. Mitigation: explicit verification step in 08-03 smoke |

**If this table has entries:** All claims tagged `[ASSUMED]` should be re-verified by the planner during plan write OR called out in the planner's CONTEXT-validation step. The most operationally risky are A1 (Bun version), A4 (db import path), and A11 (CORS).

## Open Questions

1. **Should the production deploy run `db:migrate` automatically on each `up`?**
   - What we know: `bun run db:migrate` is the manual command; Drizzle migrations are file-based and idempotent.
   - What's unclear: Whether to invoke it via a one-shot Compose service (`profile: migrate`) or document it as a manual `docker compose exec api bun run db:migrate` step in the runbook.
   - Recommendation: Manual for Phase 8 (matches mykb's "node ace migration:run --force" manual step). Phase 9 can wire auto-migrate via a sidecar.

2. **Where does the OCI PEM file live on the VM?**
   - What we know: PEM file is gitignored; must be SCP'd from laptop.
   - What's unclear: Path. Candidates: `/opt/timeline-revamp/.oci/timeline-revamp.pem` (lives in the repo path, gets bind-mounted into container) OR `/home/ubuntu/.oci/timeline-revamp.pem` (host-only, accessed via Compose volume mount).
   - Recommendation: `/opt/timeline-revamp/.oci/` and add `.oci/` to .gitignore. Bind-mount via the API service's `volumes:` declaration so the container reads from a stable path. Plan documents `chmod 600` on the PEM after SCP.

3. **`www.timeline.bryanlam.dev` — 301 to bare host, or NXDOMAIN?**
   - What we know: D-deferred per Claude's discretion; current state is NXDOMAIN.
   - What's unclear: Whether the planner includes the 301 redirect server block.
   - Recommendation: Defer (NXDOMAIN is fine for portfolio). Add to Phase 9 polish list.

4. **Static asset caching headers — Nginx `expires 1y;` or Hono `serve-static` headers?**
   - What we know: Vite emits hashed filenames in `dist/assets/`, so 1-year cache is safe.
   - What's unclear: Whether Phase 7 already handles this (timeline.conf:119 — no, just `try_files`).
   - Recommendation: Add `expires 1y;` to a new `location /assets/` block in timeline.conf during 08-02. Cheap; meaningfully reduces repeat-visit bandwidth.

5. **Should `infra/setup.sh` be curl-piped-to-bash (mykb's pattern) or `git pull && bash infra/setup.sh`?**
   - What we know: mykb does curl-pipe (`curl ... | bash`). It works because the repo is cloned inside the script.
   - What's unclear: Whether this fits "manual SSH" — but really both are manual.
   - Recommendation: Both. Document both invocation methods in DEPLOY.md.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Ubuntu 22.04 / 24.04 on OCI Ampere A1 | All of Phase 8 | ✗ (to be verified per STATE.md prereq) | — | None — blocks Phase 8 entirely |
| Docker 24+ + Compose v2 | API + Postgres stack | ✓ (after `apt install docker.io docker-compose-plugin`) | apt-current on 24.04 ships docker.io 24.x [ASSUMED] | None |
| Nginx 1.24+ | Reverse proxy + TLS | ✓ (after apt install) | apt-current | None |
| certbot 2.x + python3-certbot-nginx | TLS issuance | ✓ (after apt install) | apt-current | None blocking; manual openssl + alternate ACME client is heavy fallback |
| iptables-persistent | Firewall persistence | ✓ (after apt install) | apt-current | None |
| oven/bun:1-alpine arm64 image | API container | ✓ [VERIFIED: docker hub multi-arch manifest] | 1.2.x-alpine pinned | oven/bun:1-debian if alpine has issues (larger image) |
| postgres:16 arm64 image | DB container | ✓ [VERIFIED: arm64v8/postgres multi-arch] | postgres:16 | None |
| OCI Reserved Public IP feature | Stable VM IP for DNS | ✓ [VERIFIED: OCI docs — free tier supports reserved IPs] | — | None |
| DNS provider for `bryanlam.dev` admin access | DNS cutover | ✗ (provider unknown — verify) | — | None — blocks 08-03 |
| Auth0 tenant admin access | Add prod callback URL | ✓ (user is the tenant owner per STATE.md) | — | None |
| OCI Object Storage bucket `timeline-photos` (existing) | Photos in prod reel | ✓ (Phase 6) | — | None |
| MapTiler API key | Vector tiles in prod | ✓ (existing in .env.local) | — | demotiles.maplibre.org fallback (degraded UX) |

**Missing dependencies with no fallback:**
- VM provisioning + sizing verification (STATE.md flagged as prereq)
- DNS provider identification for `bryanlam.dev`

**Missing dependencies with fallback:**
- None blocking; degraded fallbacks (demotiles) covered

## Validation Architecture

> No `.planning/config.json` exists; treating `nyquist_validation` as enabled per default.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 + @vitest/coverage-v8 ^4.1.5 |
| Config file | `vitest.config.ts` (verified exists) |
| Quick run command | `bun run test` (vitest run, full suite — currently ~3-5s) |
| Full suite command | `bun run test:coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-01 | OCI Ampere A1 VM hosts Docker Compose stack (API + Postgres) | manual-only | `ssh ubuntu@vm 'docker compose ps'` shows api + postgres healthy | N/A — infra |
| DEPLOY-01 | API container builds successfully on arm64 | integration | `docker compose -f docker-compose.yml -f docker-compose.prod.yml build` exits 0 | N/A — wave-0 if Dockerfile lint test added |
| DEPLOY-01 | `/api/health` returns 200 + `{status:'ok', db:'ok'}` | unit (DB-mocked) + manual (live) | unit: `pytest server/routes/health.test.ts` ❌ doesn't exist | ❌ Wave 0 — `server/routes/health.test.ts` |
| DEPLOY-02 | Nginx reverse proxy serves HTTPS with valid LE cert | manual-only | `curl -fI https://timeline.bryanlam.dev` shows HTTP/2 200 | N/A — runbook step |
| DEPLOY-02 | certbot auto-renew configured + dry-run succeeds | manual-only | `sudo certbot renew --dry-run` | N/A — runbook step |
| DEPLOY-02 | systemd certbot.timer active | manual-only | `sudo systemctl is-active certbot.timer` returns `active` | N/A — runbook step |
| DEPLOY-05 | DNS A record for timeline.bryanlam.dev resolves to VM IP | manual-only | `dig +short timeline.bryanlam.dev` returns VM IP | N/A — runbook step |
| (smoke) D-16 iPhone 60 FPS | iPhone Safari sustains 60 FPS on 1-city orbit 30s+ | manual UAT | Web Inspector → Timelines → Rendering Frames; bars below 16.67ms line | Mobile UAT — manual on iPhone 14 Pro |
| (smoke) D-16 globe iOS | GlobeReel renders 3D globe on iOS Safari | manual UAT | Visit `/u/<0-city-handle>`, confirm spherical projection | Mobile UAT — manual |
| (smoke) D-16 mixed-case | `/u/Bryan` resolves same as `/u/bryan` | manual UAT | Visit both URLs; verify same reel; check X-Cache-Status MISS→HIT | Mobile UAT — manual |

### Sampling Rate
- **Per task commit:** `bun run typecheck && bun run test` (existing baseline — ~5s)
- **Per wave merge:** `bun run test:coverage` (full suite + coverage)
- **Phase gate:** Full automated suite green + manual runbook smoke test (curl /api/health, openssl s_client cert chain, certbot renew --dry-run, 3 mobile UAT items) all pass before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `server/routes/health.test.ts` (NEW) — covers DEPLOY-01 health endpoint + DB ping; mock pg `db.execute` to return success / throw, assert 200/503
- [ ] `Dockerfile` (NEW) — no test framework for Dockerfile; lint via `hadolint Dockerfile` is optional and not currently in the project's tool set
- [ ] No new test framework install needed — vitest is already wired

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Defense in depth: OCI VCN + iptables + Nginx + Docker network isolation. Postgres NOT publicly reachable (D-11) |
| V2 Authentication | yes (carryover) | Auth0 Universal Login + JWT (Phase 4); production callback URL added |
| V3 Session Management | yes (carryover) | Auth0 manages tokens; SDK uses in-memory cache (Phase 5 D-saved) |
| V4 Access Control | yes (carryover) | Hono middleware + lazy provisioning (Phase 4) |
| V5 Input Validation | yes (carryover) | Zod on all routes (Phase 4-7) |
| V6 Cryptography | yes | TLS via Let's Encrypt (ECDSA or RSA per certbot default — RSA 2048); Postgres password 256-bit random hex |
| V7 Error Handling | yes | Hono error middleware ; Postgres `db:'unreachable'` returned without DB error details |
| V8 Data Protection | yes | TLS in flight; named Docker volume on host filesystem (root-only). No PII at rest beyond user handles + Auth0 sub |
| V9 Communications | yes | TLS-only public surface; HTTP→HTTPS redirect (D-06) |
| V10 Malicious Code | partial | Pin oven/bun + postgres image tags; no `latest`. Docker images from official sources only |
| V11 Business Logic | n/a (carryover from earlier phases) | — |
| V12 Files and Resources | partial | Docker non-root user in API container; PEM file `chmod 600` |
| V13 API and Web Service | yes (carryover) | JWT validation on private routes (Phase 4) |
| V14 Configuration | yes | `.env` gitignored, SCP'd; secrets not baked into image (env_file at runtime + ARG only for non-secret VITE_*); Postgres pw via openssl rand |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Postgres exposed to internet | Information Disclosure | D-11: no port publish in prod; Docker internal network only |
| TLS cert hijack via stale renewal | Tampering | certbot.timer + dry-run verification |
| iptables rule order incorrectly allows attacker before REJECT | Elevation of Privilege | mykb pattern: `-I INPUT 6 ... ACCEPT`; runbook verification step |
| Secret leak via image layer | Information Disclosure | env_file at runtime (NOT baked into image); .env stays out of image build context (.dockerignore) |
| Vite build args leak via image layer | Information Disclosure | VITE_* args are public-by-design (Auth0 client_id, MapTiler key, audience URL); they're baked into the JS bundle anyway. NOT a real leak — same data was always in the dev `.env.local` and visible to anyone with browser devtools |
| Stolen Auth0 callback URL allows phishing | Spoofing | Auth0 strictly validates callback URL whitelist; production callback added explicitly |
| Brute-force on API endpoints | DoS | NOT mitigated in Phase 8 (rate limiting deferred to Phase 9 polish per CONTEXT). Acceptable for v1 |
| Postgres password disclosure via process listing | Information Disclosure | Compose-managed env (POSTGRES_PASSWORD); not in `ps -ef` because Docker isolates the process namespace |
| Public-read OCI bucket leaks photos | Information Disclosure | By design (Phase 6 D-PUBLIC-READ); photos are intentionally public per requirement DATA-07. Not in scope to revisit |
| HSTS missing — downgrade to HTTP | Tampering | Deferred to Phase 9 polish per CONTEXT. certbot --redirect handles upgrade-on-first-visit |

## Sources

### Primary (HIGH confidence)
- **mykb reference implementation** (`/Users/bryanlam/Workspaces/mykb/infra/setup.sh`, `infra/Caddyfile`, `docs/DEPLOYMENT.md`) — exact host-install + iptables + /opt/<app> pattern; verified working on same OCI free tier
- **Phase 7 timeline.conf** (`ops/nginx/timeline.conf`) — committed; locked proxy + cache contract
- **Existing docker-compose.yml** — current Postgres-only definition, healthcheck pattern
- **Existing server/index.ts** — confirmed `/api/health` exists at line 26 (stub), needs DB ping
- **Existing server/env.ts** — confirms PORT default 8787, env schema, Auth0 keys
- **Existing vite.config.ts** — confirms Vite proxy at `localhost:8787`, manualChunks, dist/ default output
- **CONTEXT.md** — 19 locked decisions
- **REQUIREMENTS.md** — DEPLOY-01, 02, 05 explicit text
- **STATE.md** — Phase 8 prereqs (VM provisioning, DNS not yet pointed)
- **PROJECT.md** — 2 OCPU / 8 GB minimum constraint
- **Project memories** — feedback_dual_runtime_env, feedback_esm_require_in_tsx_watch, feedback_oci_cors_via_s3, feedback_post_merge_install

### Secondary (MEDIUM confidence — verified via official docs)
- [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/) — `service_healthy` condition syntax
- [Certbot Nginx instructions](https://certbot.eff.org/instructions?ws=nginx&os=ubuntufocal) — official install + run
- [Certbot User Guide](https://eff-certbot.readthedocs.io/en/stable/using.html) — http-01 challenge, --redirect flag, --nginx behavior
- [Bun Docker guide](https://bun.com/docs/guides/ecosystem/docker) — official multi-stage pattern
- [curl --resolve docs](https://everything.curl.dev/usingcurl/connections/name.html) — pre-DNS-cutover TLS verification (preserves SNI + cert check)
- [MapLibre Globe Projection](https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe-with-a-vector-map/) — `setProjection({type:'globe'})` GL JS 5.0+ (no iOS Safari restriction found; Safari supports WebGL)
- [WebKit Rendering Frames Timeline](https://webkit.org/blog/3996/introducing-the-rendering-frames-timeline/) — Safari Web Inspector FPS measurement
- [OCI Reserved Public IP docs](https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/reserved-public-ip-assign.htm) — Console + CLI workflows

### Tertiary (LOW confidence — single source, validate at plan time)
- Exact pinned tag of `oven/bun:1.2.x-alpine` at plan time — verify against Docker Hub
- Whether OCI Ubuntu 24.04 ships `docker.io` apt package with Compose v2 plugin bundled by default (vs requiring `docker-compose-plugin` explicitly) — verify on actual VM
- Whether Phase 6's OCI bucket CORS rule for `https://timeline.bryanlam.dev` was applied (memory suggests both localhost AND prod were in the initial apply, but verify with `aws s3api get-bucket-cors`)

## Project Constraints (from CLAUDE.md)

The repo CLAUDE.md does not impose deploy-specific constraints. Relevant inherited rules:
- **Skill routing:** This is a `/gsd-research-phase` invocation — no gstack skill applies; do not invoke gstack skills from this agent.
- **DESIGN.md as the visual law:** Phase 8 has no UI changes (deploy only), so DESIGN.md is non-binding for this phase. The smoke test exercises UI that already conforms.
- **Coding style (TypeScript globally):** Immutability (no mutation in the SELECT 1 ping handler), error handling (return 503 + log to stderr), no `console.log` (use `process.stderr.write` as already established).
- **Testing (TypeScript globally):** 80% coverage minimum; TDD for new code. The new `/api/health` DB-ping logic should have a vitest unit test alongside the existing `health.test.ts` (if it exists; new file otherwise).
- **Security (TypeScript globally):** No hardcoded secrets — `.env` via SCP + `env_file:` in compose. OCI PEM `chmod 600`. Postgres password via `openssl rand`.
- **Git workflow:** Conventional commits — `chore(deploy):`, `feat(deploy):`, `docs(deploy):` — matches recent commit history.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — mykb is a verified-working reference on the same infra; tag pins MEDIUM (need plan-time verification)
- Architecture: HIGH — Phase 7's `timeline.conf` already commits to the upstream+cache shape; we're wiring known pieces
- Pitfalls: HIGH — most pitfalls are documented either in mykb or in project memory feedback files; only Pitfall 4 (multi-server_name conflict) is hypothetical, included for safety
- certbot behavior: MEDIUM — community reports + official docs are consistent; symlink edits are confirmed safe but not exhaustively documented for our exact symlink topology (conf.d/timeline.conf → /opt/...)
- Mobile UAT: HIGH for FPS measurement workflow (WebKit official docs); MEDIUM for globe projection (no explicit "supported on iOS Safari" statement, but iOS Safari has WebGL2 + the MapLibre GL JS package is the same on all platforms — extremely likely to work)

**Research date:** 2026-05-15
**Valid until:** 2026-06-14 (30 days — stable infrastructure tooling; the only fast-moving piece is oven/bun version which the planner re-verifies at plan time)
