# timeline-revamp — Deployment Runbook (Phase 8)

> Operator-facing runbook for Phase 8 manual SSH-driven deploy to an OCI
> Ampere A1 VM. Phase 9 will automate this loop via GitHub Actions +
> OCI Container Registry; until then, the steps below are the canonical
> ship path.

## Overview

Phase 8 takes the working app off `localhost` and onto
`https://timeline.bryanlam.dev` for the first time. The host runs a single
OCI Ampere A1 Flex VM (arm64, free tier). The runtime is a Docker Compose
stack of two services — **api** (Bun + Hono + Vite-served-via-`serveStatic`)
and **postgres** (vanilla `postgres:16`). Nginx is **host-installed** (apt)
in front of the stack, and certbot provisions a Let's Encrypt cert via the
nginx plugin. The Vite SPA is baked into the api container image at build
time and served by Hono's `hono/bun` `serveStatic`; Nginx upstream-proxies
all non-API requests to the api and overlays cache headers on `/assets/*`.

Manual SSH for Wave 8 is intentional — the runbook below is the
"source of truth" the Phase 9 automation will mechanise. Every step must
be reproducible from scratch on a fresh VM.

08-01 lands the api + postgres stack on `127.0.0.1:8787`. 08-02 wires
Nginx + Let's Encrypt. 08-03 handles DNS cutover + the smoke battery.

## Prerequisites

- **OCI Ampere A1 VM** (≥ 2 OCPU, ≥ 8 GB RAM) running Ubuntu 22.04 or 24.04
  LTS. Shape `VM.Standard.A1.Flex`. arm64-native.
- **OCI Reserved Public IP** attached to the VM's primary VNIC. Required so
  the public IP survives stop/start cycles (would otherwise rotate, breaking
  DNS). If your tenancy lacks Reserved Public IP availability, document
  the dynamic-IP fallback and accept that DNS cutover must be re-run on
  every VM restart.
- **OCI VCN Security List** for the VM's subnet opens ingress on `tcp/80`
  and `tcp/443` to `0.0.0.0/0`. Double-layer firewall — `iptables` on the
  host handles the second layer; `infra/setup.sh` configures it.
- **DNS admin access** for `bryanlam.dev` (TTL lowered 24h ahead of cutover
  so propagation is fast on the day of go-live).
- **Auth0 tenant admin access** so the production callback URL can be set
  to `https://timeline.bryanlam.dev/app`.
- **Local `.env.local`** populated with production-ready values for all
  17 keys in `.env.example` (see Environment Variables table below).
- **OCI PEM** at `~/.oci/timeline-revamp.pem` on your local laptop, ready
  to scp to the VM.

## Initial VM Setup

Two equivalent invocation paths for `infra/setup.sh`:

**(a) curl-pipe form** — fastest:

```bash
ssh ubuntu@<vm-public-ip>
curl -fsSL https://raw.githubusercontent.com/usbryanchlam/timeline-revamp/main/infra/setup.sh | sudo bash
```

**(b) Manual git clone form** — easier to inspect before running:

```bash
ssh ubuntu@<vm-public-ip>
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/usbryanchlam/timeline-revamp.git /tmp/timeline-revamp
sudo bash /tmp/timeline-revamp/infra/setup.sh
```

Both paths run the same script and produce the same result: Docker +
Compose plugin + Nginx + certbot installed, `iptables` rules for 80/443
inserted above the OCI default deny rule, `/opt/timeline-revamp` cloned
with `ubuntu:ubuntu` ownership, `.oci/` created with `chmod 700`.

After the script completes, **log out and back in** so the `ubuntu` user
picks up its new `docker` group membership.

## Environment Variables

The Compose stack reads variables from a single `.env` file at
`/opt/timeline-revamp/.env`. The table below mirrors `.env.example`
row-for-row. Every key in `.env.example` MUST appear here exactly once.

| Variable | Required | Source | Notes |
|---|---|---|---|
| `AUTH0_AUDIENCE` | yes | Auth0 dashboard → APIs → your API → Identifier | URL string, e.g. `https://api.timeline.bryanlam.dev`. Read by `server/env.ts`. |
| `AUTH0_CLIENT_ID` | yes | Auth0 dashboard → Applications → SPA → Client ID | The SPA client id. |
| `AUTH0_DOMAIN` | yes | Auth0 dashboard → Applications → SPA → Domain | Bare hostname, e.g. `bryanlam.us.auth0.com` (no scheme). |
| `DATABASE_URL` | yes | derived | `postgres://timeline:${POSTGRES_PASSWORD}@postgres:5432/timeline`. In compose, `postgres` resolves via Docker's internal DNS. |
| `OCI_BUCKET_NAME` | yes | OCI Console → Object Storage → Bucket | Bucket name for photos (e.g. `timeline-photos`). |
| `OCI_FINGERPRINT` | yes | OCI Console → User → API Keys → fingerprint | Colon-separated hex string. |
| `OCI_NAMESPACE` | yes | OCI Console → Object Storage → Namespace | Tenancy-scoped namespace string. |
| `OCI_PRIVATE_KEY_PATH` | yes | container-side path | Set to `/app/.oci/timeline-revamp.pem` — the mount target of the `./.oci:/app/.oci:ro` bind in `docker-compose.prod.yml`. |
| `OCI_REGION` | yes | OCI Console region picker | e.g. `us-sanjose-1`, `us-phoenix-1`. |
| `OCI_TENANCY_OCID` | yes | OCI Console → Profile → Tenancy → OCID | `ocid1.tenancy.oc1..xxxx`. |
| `OCI_USER_OCID` | yes | OCI Console → Identity → Users → your user → OCID | `ocid1.user.oc1..xxxx`. |
| `PORT` | no | default `8787` | Hono listens on this port. Compose binds `127.0.0.1:8787:8787`. |
| `POSTGRES_PASSWORD` | yes | `openssl rand -hex 32` (D-14) | Generated once at first deploy; not rotated for v1. Postgres is on the internal Docker network only (D-11). |
| `VITE_AUTH0_AUDIENCE` | yes | mirror of `AUTH0_AUDIENCE` | VITE_* values are inlined into `dist/assets/*.js` at build time. Both unprefixed AND VITE_* copies are needed in this dual-runtime project. |
| `VITE_AUTH0_CLIENT_ID` | yes | mirror of `AUTH0_CLIENT_ID` | Inlined at build time. |
| `VITE_AUTH0_DOMAIN` | yes | mirror of `AUTH0_DOMAIN` | Inlined at build time. |
| `VITE_MAPTILER_KEY` | yes | maptiler.com → Account → Keys | MapTiler vector tile key (free tier: 100k req/mo). Inlined at build time. |

## First Deployment

Run from the VM after `infra/setup.sh` has completed and you have logged
out / back in.

1. **Change into the repo:**
   ```bash
   cd /opt/timeline-revamp
   ```

2. **scp `.env` and the OCI PEM from your laptop:**
   ```bash
   # FROM your laptop:
   scp .env.local ubuntu@<vm-ip>:/opt/timeline-revamp/.env
   scp ~/.oci/timeline-revamp.pem ubuntu@<vm-ip>:/opt/timeline-revamp/.oci/timeline-revamp.pem
   ```

3. **Lock down permissions on the VM:**
   ```bash
   chmod 600 .env .oci/timeline-revamp.pem
   ```

4. **Build and start the stack:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```
   Expect 3-5 min build time on 2-OCPU/8GB. Vite + Hono compile in the
   builder stage; the runtime image is small (~150 MB).

5. **Wait-for-healthy loop** (adopted from 08-RESEARCH Code Example 5):
   ```bash
   for i in {1..12}; do
     if curl -sf http://127.0.0.1:8787/api/health | grep -q '"db":"ok"'; then
       echo "healthy"
       break
     fi
     sleep 5
   done
   ```
   The loop tries 12 times at 5s intervals (60s total budget). If it
   never reports "healthy", inspect `docker compose logs -f api` for the
   `/api/health DB ping failed:` line and check Postgres logs.

6. **Run the one-time DB migration:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api bun run db:migrate
   ```
   Migrations are not auto-applied at container start in Phase 8 — manual
   execution lets the operator pause if anything looks wrong before
   schema changes hit production.

At this point the api stack is healthy on `127.0.0.1:8787` AND the api
container is already serving the Vite SPA at `GET /` (via Hono
`serveStatic` reading `/app/dist`). Phase 08-02 owns the Nginx + Let's
Encrypt setup that exposes this to the public internet; Phase 08-03 owns
DNS cutover and the smoke battery.

## Nginx + Let's Encrypt

After the API stack is healthy on `127.0.0.1:8787` (per First Deployment), wire up the reverse proxy.

### Prerequisites
- 08-01 stack is up and `curl -sf http://127.0.0.1:8787/api/health` returns `{"status":"ok","db":"ok"}`.
- 08-01 stack also serves the Vite bundle: `docker compose exec api wget -qO- http://localhost:8787/ | head -1` returns an HTML doctype line (Hono `serveStatic` mount working).
- tcp/80 and tcp/443 are reachable from the public internet (OCI VCN Security List + host iptables, both per `infra/setup.sh`).
- DNS A record for `timeline.bryanlam.dev` is NOT yet pointing at this VM. We verify TLS works via `curl --resolve` first (D-19 sequencing).

### Steps

1. Update the repo:
   ```bash
   cd /opt/timeline-revamp && git pull
   ```

2. Symlink the Nginx config (D-02):
   ```bash
   sudo ln -sf /opt/timeline-revamp/ops/nginx/timeline.conf /etc/nginx/conf.d/timeline.conf
   ls -l /etc/nginx/conf.d/timeline.conf
   ```

3. Disable the default site to prevent certbot picking the wrong server block:
   ```bash
   sudo rm -f /etc/nginx/sites-enabled/default
   ```

4. Validate + enable Nginx:
   ```bash
   sudo nginx -t
   sudo systemctl enable --now nginx
   ```

5. Run certbot --nginx (first-run, interactive):
   ```bash
   sudo certbot --nginx \
     -d timeline.bryanlam.dev \
     --email <your-email> \
     --agree-tos \
     --no-eff-email \
     --redirect
   ```
   The `--redirect` flag injects the HTTP->HTTPS 301 (D-06).

6. Verify cert + renewal (D-03):
   ```bash
   sudo certbot certificates
   sudo certbot renew --dry-run
   sudo systemctl is-active certbot.timer
   sudo systemctl is-enabled certbot.timer
   ```

7. Pre-DNS TLS smoke (D-19 — run from laptop, NOT the VM):
   ```bash
   curl --resolve timeline.bryanlam.dev:443:<vm-ip> -fI https://timeline.bryanlam.dev/api/health
   openssl s_client -connect <vm-ip>:443 -servername timeline.bryanlam.dev </dev/null \
     | openssl x509 -noout -dates -issuer
   ```
   Both must succeed BEFORE the DNS cutover in 08-03.

8. Pre-DNS /assets/ cache-header smoke (proves the Hono `serveStatic` + Nginx cache-overlay handshake works — see the `/assets/` location block in `ops/nginx/timeline.conf`):
   ```bash
   # On the VM, discover an asset filename:
   ASSET=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api \
     ls /app/dist/assets/ | grep -E 'index-.*\.js$' | head -1 | tr -d '\r')
   # On the laptop:
   curl --resolve timeline.bryanlam.dev:443:<vm-ip> -fI \
     https://timeline.bryanlam.dev/assets/$ASSET
   ```
   Expected headers (case-insensitive header names): `HTTP/2 200`,
   `cache-control: public, immutable`, `expires: <date ~1y out>`,
   `content-type: text/javascript` (or `application/javascript`).

9. Commit certbot's auto-injected lines back to the repo (Option A from 08-RESEARCH Pattern 4):
   ```bash
   cd /opt/timeline-revamp
   git diff ops/nginx/timeline.conf
   git add ops/nginx/timeline.conf
   git commit -m 'chore(infra): commit certbot --nginx auto-injected TLS directives'
   git push
   ```
   This keeps the repo as the source of truth. Re-deploying to a fresh VM would re-issue a fresh cert via `certbot --nginx` (the symlink + the pre-injected directives play nicely because certbot is idempotent on already-managed files).

### Troubleshooting

- **`nginx -t` reports duplicate server_name:** The default site is still enabled. Re-run step 3.
- **certbot reports "DNS problem: NXDOMAIN looking up A for timeline.bryanlam.dev":** This is the D-19 race — you flipped DNS too early, or it has not yet propagated. Wait (or run with `--manual` and the DNS-01 challenge if you must issue before DNS is ready, but HTTP-01 + the curl --resolve path is the recommended sequence).
- **certbot reports "Connection refused" during HTTP-01 challenge:** Either Nginx is not running (`sudo systemctl status nginx`), or tcp/80 is not reachable from the public internet. Check OCI VCN Security List AND host iptables. RESEARCH Pitfall 5 has the iptables verification recipe.
- **`curl --resolve` returns 502 Bad Gateway:** The Nginx upstream is correct (127.0.0.1:8787) but the API container is not running. `docker compose -f docker-compose.yml -f docker-compose.prod.yml ps` should show api as `(healthy)`.
- **`/assets/<hash>.js` returns 404:** The Hono `serveStatic` mount in `server/index.ts` did not land (08-01 regression). Verify on the VM: `docker compose exec api wget -qO- http://localhost:8787/assets/<hash>.js | head -1` should return JS bytes. If THAT 404s too, the Dockerfile did not COPY `/app/dist` correctly or the `serveStatic` import is broken — see 08-01 Task 1 Part C.
- **`/assets/<hash>.js` returns 200 but no `cache-control: public, immutable` header:** The /assets/ location block's `add_header ... always;` line is missing or malformed. Re-verify Task 1 of 08-02.
- **Subsequent git pull overwrites certbot's edits:** The repo is the source of truth post-commit-back; future `git pull` operations preserve the TLS block. If a future contributor edits `timeline.conf` and pushes WITHOUT the TLS block, the next `git pull` on the VM would remove it — run `sudo nginx -t` after every pull (per the standard symlink-update loop, D-02 / RESEARCH Pattern 5).

### Renewal Behavior

`certbot.timer` runs twice daily with jitter; if the cert is within 30 days of expiry, certbot renews and runs an `nginx -s reload` (the apt package's deploy-hook). No manual intervention needed for v1.

## Common Operations

**Ship a new version** (the canonical ship loop, per ROADMAP §"Phase 8"):
```bash
cd /opt/timeline-revamp
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**Tail api logs:**
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api
```

**Tail Postgres logs:**
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f postgres
```

**Open a psql session:**
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres psql -U timeline timeline
```

**Restart a single service:**
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart api
```

**Prune dangling images** (after a few rebuilds):
```bash
docker image prune -f
```

**Manual pg_dump backup** (per D-18 — automated backup deferred):
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres \
    pg_dump -U timeline timeline > backup-$(date +%F).sql
```

## Troubleshooting

### iptables rule ordering (D-04, adapted from mykb/docs/DEPLOYMENT.md)

If `curl` from outside the VM hangs while `curl` from inside `localhost`
works, your ACCEPT rule for `tcp/80` and `tcp/443` is below the OCI
Ubuntu base image's default deny-all rule. Verify with:

```bash
sudo iptables -L INPUT -n --line-numbers
```

The ACCEPT lines for `dpt:80` and `dpt:443` MUST appear at lower line
numbers than any `REJECT` or `DROP` line. Fix:

```bash
# Find the REJECT line position
sudo iptables -L INPUT -n --line-numbers | grep REJECT

# Re-insert ACCEPT rules ABOVE it (e.g. at position 5)
sudo iptables -I INPUT 5 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 5 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

`infra/setup.sh` uses `-I INPUT 6` — the position number may differ in
your tenancy. Re-check with `iptables -L INPUT -n --line-numbers` after
the script runs.

### Let's Encrypt certificate fails (adapted from mykb/docs/DEPLOYMENT.md:259-266)

Common modes:
- DNS not yet propagated — wait, then `dig +short timeline.bryanlam.dev`.
- `tcp/80` blocked by iptables OR OCI VCN Security List — verify both.
- Cloudflare proxy enabled — N/A here (we A-record directly to the VM).
- Let's Encrypt rate limit hit — wait 1h, or use `--dry-run` first.

### docker compose build OOMs the VM

Vite's tsc + bundle step can briefly peak above 2 GB. If the api service
falls over during a rebuild on a hot VM:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop api
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build api
```

Stopping the running container first frees RAM for the build.

### Bare `require()` is undefined in ESM (08-RESEARCH Pitfall 3)

The server is ESM (`"type": "module"` in `package.json`). Any bare
`require(...)` in `server/` will throw at runtime under Bun. The smoke
battery exercises the OCI photos route specifically because that's where
historical CJS interop has bitten us; if the route 500s, look for an
unguarded `require()` and convert to `import` (or
`createRequire(import.meta.url)` if a CJS shim is truly required).

### OCI Object Storage CORS (per memory `feedback_oci_cors_via_s3.md`)

OCI Console UI has no CORS tab, and `oci os bucket update --from-json`
silently drops CORS rules. Use the AWS CLI against OCI's S3-compat
endpoint to configure CORS — NOT the Native API, NOT the Console.

### Vite build args missing in production bundle (Pitfall 2 / `feedback_dual_runtime_env.md`)

`VITE_*` values are inlined at build time. If `.env.example` placeholders
still appear in the shipped JS, the build did not receive the args:

```bash
# Bundle should NOT contain placeholder text.
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api sh -c \
    "grep -l 'YOUR_MAPTILER_KEY_HERE' /app/dist/assets/*.js" \
    && echo "BAD: placeholder present" \
    || echo "OK"

# Bundle SHOULD contain the real Auth0 domain.
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api sh -c \
    "grep -l 'bryanlam.us.auth0.com' /app/dist/assets/*.js | head -1"
```

If a placeholder is still present, verify (a) the VM's `.env` has the
VITE_* keys populated with real values, (b) `docker-compose.prod.yml`
`build.args` lists them, (c) the Dockerfile declares the matching
`ARG VITE_*` and `ENV` lines in the builder stage. Dual-runtime projects
need BOTH the unprefixed runtime copies AND the VITE_* build-time copies.

## Security Notes

- **Defence in depth**: OCI VCN Security List + host iptables + Docker
  internal network isolation + Nginx (08-02) + Hono.
- `.env` and `.oci/*.pem` stay out of image layers (`.dockerignore`). The
  PEM arrives via a read-only bind mount; the `.env` arrives via
  Compose's `env_file:` directive (process env, not a `COPY` layer).
- `POSTGRES_PASSWORD` is generated once at first deploy and not rotated
  for v1 (D-14). Postgres has no host port publish in production (D-11),
  so the password protects only against intra-Docker-network access.
- `*.pem` file MUST be `chmod 600` after scp.
- No application-level rate limiting in Phase 8 — Nginx-level rate
  limiting is a Phase 9 polish item (CONTEXT.md "Claude's Discretion").
- The api container runs as non-root user `app` (uid 1001); the
  `dist/` is read-only from the app's perspective by accident — exactly
  what we want (T-08-21).

## Why no Redis in Phase 8

`ROADMAP.md` originally listed Phase 8 success criterion 1 as "API +
Postgres + Redis + Nginx". CONTEXT D-08 defers Redis to Phase 10
(alongside the MP4 BullMQ queue) — no app code talks to Redis in
Phases 1-9. The ROADMAP entry has been corrected as part of this plan
to read "API + Postgres + Nginx (Redis deferred to Phase 10 per
08-CONTEXT D-08)". This section is now a forward-looking note rather
than an active discrepancy.

When Phase 10 lands, `docker-compose.prod.yml` gains a `redis:` service
on the internal Docker network (no host port publish, same pattern as
Postgres). No Nginx changes are anticipated.

## Phase 9 — what changes from this runbook

Phase 9 automates the manual ship loop:
- GitHub Actions builds the image on `git push --tags vX.Y.Z`.
- The image is pushed to OCI Container Registry.
- A deploy hook on the VM pulls the new tag and runs
  `docker compose pull && docker compose up -d`.

When that lands, "Common Operations → Ship a new version" above changes
from manual `git pull && docker compose up -d --build` to "push a tag
and watch the actions tab".
