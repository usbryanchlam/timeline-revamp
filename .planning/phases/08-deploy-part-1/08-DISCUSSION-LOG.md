# Phase 8: Deploy part 1 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 8-deploy-part-1
**Areas discussed:** Nginx topology, Compose service set, Code & secrets pipeline, Smoke test scope

---

## Pre-discussion: mykb reference

User asked Claude to reference how `/Users/bryanlam/Workspaces/mykb` (their other personal project on the same OCI free tier) does deploy. Claude read `mykb/infra/setup.sh`, `mykb/infra/Caddyfile`, `mykb/infra/ecosystem.config.cjs`, and `mykb/docs/DEPLOYMENT.md`. Key findings folded into the discussion:

- mykb uses **Caddy** (not Nginx) — host-installed, automatic Let's Encrypt
- mykb uses **PM2** (not Docker Compose) — host-installed, runs `node` directly
- mykb owns `/opt/mykb` as `ubuntu:ubuntu`
- mykb uses iptables + iptables-persistent (documented gotcha: ACCEPT before REJECT)
- mykb SCPs `.env` files manually after `setup.sh`
- mykb's DEPLOYMENT.md is the runbook template

**Tension surfaced**: timeline-revamp's PROJECT.md locks Docker Compose as the runtime, so we can't fully clone mykb's PM2+node approach. But the reverse-proxy/TLS layer (Caddy vs Nginx vs Nginx-in-Docker) is genuinely choosable.

---

## Nginx topology

### Q1: Where does Nginx run on the VM?

| Option | Description | Selected |
|--------|-------------|----------|
| Host Nginx + certbot --nginx | mykb pattern adapted (host-install + apt), preserves Phase 7's timeline.conf, certbot plugin auto-edits TLS lines | ✓ |
| Host Caddy (full mykb pattern) | Drop Nginx, install Caddy, throw away timeline.conf, automatic Let's Encrypt zero-config | |
| Nginx in Docker compose | Pinned image, certbot webroot mode, everything-in-compose | |

**User's choice:** Host Nginx + certbot --nginx (recommended)
**Notes:** Preserves Phase 7's `ops/nginx/timeline.conf` (proxy_cache_path, X-Cache-Status) work without rewriting in Caddy syntax. Closest mykb-spirit adaptation while honoring PROJECT.md's Docker-Compose-for-app-stack constraint.

### Q2: How does ops/nginx/timeline.conf land in /etc/nginx/conf.d/?

| Option | Description | Selected |
|--------|-------------|----------|
| Symlink from repo | `ln -sf /opt/timeline-revamp/ops/nginx/timeline.conf /etc/nginx/conf.d/timeline.conf` — git pull updates proxy config | ✓ |
| Copy on deploy | `cp` step in runbook; decouples Nginx state from repo state | |
| Caddy-style: app-managed only | Don't symlink; timeline.conf becomes reference doc; hand-write on VM | |

**User's choice:** Symlink from repo (recommended)
**Notes:** `git pull && sudo nginx -t && sudo nginx -s reload` is the proxy-update loop. `nginx -t` before reload is REQUIRED to catch bad commits.

### Q3: Cert renewal mechanism for Let's Encrypt?

| Option | Description | Selected |
|--------|-------------|----------|
| certbot systemd timer | Default in certbot 1.32+ on Ubuntu; twice-daily renew via /lib/systemd/system/certbot.timer | ✓ |
| Cron job | Older pattern; redundant with systemd timer | |
| Manual rotation | Run certbot renew before each 60-day expiry — site-503 risk | |

**User's choice:** certbot systemd timer (recommended)
**Notes:** Verified with `systemctl status certbot.timer` and `certbot renew --dry-run` in the smoke test.

### Q4: Firewall for ports 80/443?

| Option | Description | Selected |
|--------|-------------|----------|
| iptables + iptables-persistent | mykb's exact pattern (infra/setup.sh:25-29); ACCEPT-before-REJECT gotcha documented in mykb DEPLOYMENT.md | ✓ |
| ufw | Ubuntu's friendlier wrapper; conflicts with OCI Ampere base image's iptables REJECT rules | |
| OCI Security List only | Single layer; OCI defaults are decent; risk of local services binding 0.0.0.0 | |

**User's choice:** iptables + iptables-persistent (recommended)
**Notes:** mykb pattern; reuse the exact incantation. Runbook MUST include the `iptables -L INPUT -n --line-numbers` verification step before assuming 80/443 are open.

---

## Compose service set

### Q1: Include Redis in the Phase 8 docker-compose stack?

| Option | Description | Selected |
|--------|-------------|----------|
| Include now, idle | Add redis:7-alpine to compose; ROADMAP literally says "API + Postgres + Redis + Nginx" | |
| Defer to Phase 10 | Phase 8 = API + Postgres only; Redis lands when MP4 queue needs it | ✓ |
| Include + smoke health-check | Like option 1, plus /api/health pings Redis, forces wiring now | |

**User's choice:** Defer to Phase 10
**Notes:** Diverges from ROADMAP success criterion 1's literal wording. Planner annotates this in 08-01-PLAN.md or updates ROADMAP. Smaller Phase 8 surface for first-deploy debugging.

### Q2: Production runtime for the Hono API container?

| Option | Description | Selected |
|--------|-------------|----------|
| Bun | Matches dev orchestration; oven/bun:1-alpine base; single tool from dev to prod | ✓ |
| Node 22 + tsx | Matches mykb's node 22; tsx in production; heavier image | |
| Node 22 + esbuild bundle | Smallest runtime image; server-side bundling footguns (dynamic imports, .node addons) | |

**User's choice:** Bun (recommended)
**Notes:** Diverges from mykb's Node+PM2 because mykb is AdonisJS (node-native); Hono runs natively on Bun. No tsx-in-production complication.

### Q3: Image build location for Phase 8 (registry comes in Phase 9)?

| Option | Description | Selected |
|--------|-------------|----------|
| Build on the VM | git pull → docker compose up -d --build; ARM-native; 3-5 min build | ✓ |
| Build locally + docker save \| ssh \| docker load | Cross-compile via buildx + qemu; faster ship loop; two build paths to debug | |
| Build local + scp tar + load | Same as above but explicit intermediate file | |

**User's choice:** Build on the VM (recommended)
**Notes:** ARM build matches Ampere A1 runtime; no cross-compile pain. Phase 9 swaps this for registry pull.

---

## Code & secrets pipeline

### Q1: Where does the repo live on the VM and who owns it?

| Option | Description | Selected |
|--------|-------------|----------|
| /opt/timeline-revamp owned by ubuntu | mykb pattern; FHS-correct; docker group for socket access | ✓ |
| /home/ubuntu/timeline-revamp | Simpler permissions; less FHS-correct | |
| Dedicated deploy user + /opt/timeline-revamp | Better security boundary; overkill for solo | |

**User's choice:** /opt/timeline-revamp owned by ubuntu (recommended)
**Notes:** Direct mykb adaptation.

### Q2: How do .env files land on the VM?

| Option | Description | Selected |
|--------|-------------|----------|
| SCP single .env, gitignored | mykb pattern; create from .env.example locally, scp to /opt/timeline-revamp/.env, env_file in compose | ✓ |
| sops/age-encrypted .env in repo | Check in .env.enc; decrypt on VM with age key; survives VM rebuilds; CI-friendly | |
| 1Password CLI on the VM | Fetch secrets at compose-up via op inject; heavy for solo | |
| Manual edit via vim on VM | SSH in and edit; no local file; typo risk | |

**User's choice:** SCP single .env, gitignored (recommended)
**Notes:** Single .env at repo root (not split apps/api + apps/web like mykb) since timeline-revamp is single-server-process; Vite bundles client assets at build time.

### Q3: How is the Postgres password generated and rotated?

| Option | Description | Selected |
|--------|-------------|----------|
| openssl rand -hex 32 once, never rotate | Postgres on internal Docker network; no public exposure; rotation is v2 | ✓ |
| Rotate quarterly | Calendar reminder; modest operational discipline | |
| Per-environment password via vault | Pull from 1Password at deploy time; heavy for solo | |

**User's choice:** openssl rand -hex 32 once, never rotate (recommended)
**Notes:** Postgres port NOT published in prod compose (D-11); same risk profile as mykb's SQLite-on-disk approach.

---

## Smoke test scope

### Q1: What's the canonical post-deploy smoke check in 08-03?

| Option | Description | Selected |
|--------|-------------|----------|
| Bare + the 3 deferred Phase 7 mobile UAT items | TLS + /api/health + cert renew dry-run, PLUS the 3 mobile UAT items on real iPhone | ✓ |
| Bare only | TLS + /api/health + cert renew dry-run; leaves Phase 7 UAT debt open | |
| Bare + full owner-flow E2E | Above + Auth0 sign-in + city create + photo upload + reel verify; heavy 08-03 | |

**User's choice:** Bare + the 3 deferred Phase 7 mobile UAT items (recommended)
**Notes:** Closes the Phase 7 mobile UAT debt that was deferred because iPhone-on-local-dev was infeasible. After 08-03 passes, 07-HUMAN-UAT.md goes from `1/4 passed, 3 pending` → `4/4 passed`.

### Q2: Hono /api/health endpoint shape — what does it check?

| Option | Description | Selected |
|--------|-------------|----------|
| 200 + JSON {status: 'ok', db: 'ok'} | Adds Postgres SELECT 1 ping; catches "API up but DB unreachable" failure mode | ✓ |
| 200 + bare {status: 'ok'} | Mirrors mykb exactly; smallest endpoint; lies if DB is down | |
| 200 + full diagnostic | Kitchen-sink (status, db, redis, version, uptime); redis is moot; version leak | |

**User's choice:** 200 + JSON {status: 'ok', db: 'ok'} (recommended)
**Notes:** One step further than mykb because we have a real DB (not SQLite-on-disk). Endpoint doesn't exist yet — must be added in 08-01 or a pre-08-01 sub-task.

### Q3: Postgres data persistence + backup discipline?

| Option | Description | Selected |
|--------|-------------|----------|
| Named Docker volume, no automated backup | pgdata named volume; manual pg_dump in runbook; loss-on-VM-rebuild accepted | ✓ |
| Named volume + daily pg_dump cron | gzipped dumps to /opt/backups; retention 7 days; cheap insurance | |
| Bind mount + OCI block-volume snapshot | Decouples DB from Docker volume lifecycle; most operational overhead | |

**User's choice:** Named Docker volume, no automated backup (recommended)
**Notes:** Acceptable for v1 launch (no real data to protect yet). Manual pg_dump recipe documented in runbook. Automated backup deferred to Phase 9 or later.

---

## Claude's Discretion

- Exact `oven/bun:1-alpine` base image tag (pin at plan time)
- Single compose file with profiles vs `docker-compose.yml` + `docker-compose.prod.yml`
- `infra/setup.sh` script vs `infra/DEPLOY.md` runbook (probably both, like mykb)
- Production logging path (default `docker compose logs` vs journald driver)
- `www.timeline.bryanlam.dev` 301 redirect to bare host (cheap to add; defer until asked)

---

## Deferred Ideas

- CI/CD + container registry + tag-trigger auto-deploy → Phase 9 (DEPLOY-03/04)
- Automated Postgres backups → Phase 9 or beyond
- OCI block-volume snapshot strategy → not blocking launch
- Redis service in compose → Phase 10 (MP4 queue)
- `www.` variant 301 → defer until somebody asks
- journald log driver → defer
- Production logging dashboard / alerting → launch-week-or-later
- Rate limiting at Nginx layer → Phase 9 prod hardening
- HSTS / security headers beyond certbot --nginx defaults → Phase 9 polish (CSP needs careful tuning for MapLibre + Auth0)
- Auto-deploy hook on tag push → Phase 9 (DEPLOY-04)
