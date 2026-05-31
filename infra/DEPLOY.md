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

## Bootstrap (one-time)

The state bucket is a chicken-and-egg dependency: `terraform init` writes
state to it, but the bucket itself must exist before the first init.
Bootstrap it via OCI CLI before running anything Terraform-related.

### 1. Install Terraform, OCI CLI, AWS CLI on the operator laptop

```bash
brew install hashicorp/tap/terraform@1.10
brew install oci-cli && oci setup config
brew install awscli
brew install actionlint  # optional but recommended (lints .github/workflows/*.yml)
```

> **Pin TF to 1.10.x, NOT 1.11.x.** TF 1.11.2's S3 backend regression
> (`x-amz-content-sha256: STREAMING-UNSIGNED-PAYLOAD-TRAILER`) breaks
> `use_lockfile = true` against OCI's S3-compat endpoint per
> hashicorp/terraform#36742. Re-test on 1.11.3+ before pinning forward.

### 2. Create the Terraform state bucket on OCI

```bash
# Verify the Default Identity Domain exists (REQUIRED for Plan 03's OIDC trust;
# Pitfall 6 — legacy OCI tenancies pre-2023 may not have one provisioned).
# Modern tenancies (2023+) have a Default domain automatically.
oci iam domain list \
  --compartment-id "$OCI_TENANCY_OCID" \
  --query 'data[?"display-name" == `Default`]'
# If the returned array is empty, create a Default domain via the OCI Console:
#   Identity & Security → Domains → Create domain → Free license type.
# Plan 03's data.oci_identity_domains.default lookup will 404 otherwise.

# Namespace lookup (tenant-specific; needed for the S3-compat endpoint URL)
NAMESPACE=$(oci os ns get --query 'data' --raw-output)
echo "Namespace: $NAMESPACE"

# Create the state bucket with object-versioning enabled
oci os bucket create --name timeline-tfstate --compartment-id "$COMPARTMENT_OCID" --versioning Enabled

# Add a 90-day retention rule on deleted objects (D-10 — recover from
# accidental state delete or rogue apply within 90 days)
oci os retention-rule create --bucket-name timeline-tfstate --display-name "delete-recovery-90d" --duration '{"timeAmount": 90, "timeUnit": "DAYS"}'
```

### 3. Generate the Customer Secret Key for backend auth

```bash
oci iam customer-secret-key create --user-id "$USER_OCID" --display-name "terraform-state-backend"
# Output: { "data": { "id": "...", "key": "<SECRET — shown ONCE>", "value": "<ACCESS_KEY>" } }
#
# Copy the output IMMEDIATELY — the `key` field is shown ONCE:
#   `value` field → GHA Secret OCI_S3_ACCESS_KEY
#   `key` field   → GHA Secret OCI_S3_SECRET_KEY
```

### 4. Configure GitHub Secrets and Variables

Manual GitHub UI step — `Settings → Secrets and variables → Actions`:

| Type | Name | Value |
|------|------|-------|
| Secret | `OCI_S3_ACCESS_KEY` | Customer SK `value` field from step 3 |
| Secret | `OCI_S3_SECRET_KEY` | Customer SK `key` field from step 3 (shown ONCE) |
| Secret | `SSH_PUBLIC_KEY` | Contents of `~/.ssh/oci-timeline.pub` (the public key the TF compute resource attaches to the VM via `metadata.ssh_authorized_keys`). |
| Variable | `OCI_DOMAIN_URL` | `https://<domain-id>.identity.oraclecloud.com` (from `oci iam domain list`) |
| Variable | `OCI_REGION` | e.g., `us-sanjose-1` |
| Variable | `OCI_TENANCY_OCID` | `ocid1.tenancy.oc1..aaa...` |
| Variable | `OCI_COMPARTMENT_OCID` | `ocid1.compartment.oc1..aaa...` |
| Variable | `OCI_NAMESPACE` | Object Storage namespace for your tenancy. Obtain via `oci os ns get`. Used by the S3-compat endpoint URL in `backend.tf` and by the CORS `null_resource` in Plan 02. |

> **Fork PRs (Pitfall 10):** GitHub does not issue OIDC tokens to PRs from
> forks by default. Workflow runs originated from forks will fail at the
> `Authenticate to OCI via OIDC token exchange` step (no
> `ACTIONS_ID_TOKEN_REQUEST_TOKEN` issued). This is acceptable for a solo
> project. For future contributors, the workflow falls back to
> `terraform fmt -check` + `terraform validate` only (no plan diff against the
> live tenancy); maintainer approval via `Settings → Actions → General →
> Fork pull request workflows` is required to run full plans against forks.

### 5. Configure the GitHub `production` Environment

Manual GitHub UI step — `Settings → Environments → New environment`:

- Name: `production`
- Required reviewers: add `usbryanchlam`
- Deployment branches: `main` only

Plan 03's `apply` job is gated by this environment, so the required-reviewers
gate is what enforces "no untracked apply".

### 6. Generate the SSH key for VM access

```bash
ssh-keygen -t ed25519 -f ~/.ssh/oci-timeline -C "operator@laptop"
cat ~/.ssh/oci-timeline.pub  # paste into terraform.tfvars ssh_public_key
```

### 6a. Extract Phase 6 CORS rules (if importing — Option B below)

Only run this sub-step if you intend to choose Option B (`terraform import`)
in Section 7 below. Extracts the live Phase 6 bucket's CORS rules so
`terraform.tfvars` has the production-correct values BEFORE the first
`null_resource.photos_cors` re-applies them (otherwise the default in
`variables.tf` may overwrite production CORS).

If you intend Option A (delete-and-recreate), skip to Section 7 — the
`variables.tf` default rules apply on the fresh bucket.

```bash
export AWS_ACCESS_KEY_ID="$OCI_S3_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$OCI_S3_SECRET_KEY"
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

aws s3api get-bucket-cors \
  --endpoint-url "https://$NAMESPACE.compat.objectstorage.$REGION.oraclecloud.com" \
  --bucket timeline-photos \
  | jq '.CORSRules' \
  > /tmp/phase6-cors.json
```

If `/tmp/phase6-cors.json` is non-empty, paste its array contents into the
`photos_cors_rules = [...]` block of `terraform.tfvars` (NOT `.example`),
translating jq's JSON keys to HCL (quoted → bare, e.g., `"AllowedOrigins"` →
`AllowedOrigins`). If empty (no CORS set on the Phase 6 bucket — confirmed
during 08.1 bootstrap that the Phase 6 attempt silently dropped rules per
project memory `feedback_oci_cors_via_s3.md`), the `variables.tf` default
applies.

### 7. Phase 6 photos bucket disposition (D-13)

Pick ONE before the first `terraform apply` in Plan 02 (which declares
`oci_objectstorage_bucket.photos`):

- **Option A (recommended for throwaway test data):**
  ```bash
  oci os bucket delete --bucket-name timeline-photos --namespace "$NAMESPACE" --empty --force
  ```

- **Option B (zero data risk — import into TF state):** run Section 6a FIRST
  to capture the live Phase 6 CORS rules, THEN run the import AFTER Plan 02's
  `storage.tf` is on disk.
  ```bash
  cd infra/terraform && terraform import oci_objectstorage_bucket.photos "n/$NAMESPACE/b/timeline-photos"
  ```

## Prerequisites

- OCI tenancy with free-tier A1 quota; Customer Secret Key generated per Bootstrap step 3.
- **OCI VCN Security List** for the VM's subnet opens ingress on `tcp/80`
  and `tcp/443` to `0.0.0.0/0`. Double-layer firewall — `iptables` on the
  host handles the second layer; cloud-init configures both (replaces the
  deleted `infra/setup.sh`).
- **DNS admin access** for `bryanlam.dev` (TTL lowered 24h ahead of cutover
  so propagation is fast on the day of go-live).
- **Auth0 tenant admin access** so the production callback URL can be set
  to `https://timeline.bryanlam.dev/app`.
- **Local `.env.local`** populated with production-ready values for all
  17 keys in `.env.example` (see Environment Variables table below).
- **OCI PEM** at `~/.oci/timeline-revamp.pem` on your local laptop, ready
  to scp to the VM (optional once Instance Principal is in place via Plan 02 —
  SDK auto-detects via the instance metadata endpoint).

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

## Terraform Provisioning

Replaces the old manual SSH-and-run-setup.sh flow. Run from the operator
laptop after the Bootstrap section is complete.

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars   # fill in real OCIDs, region, ssh_public_key

# Init with backend config (region + namespace are tenant-specific — NOT in backend.tf)
export AWS_ACCESS_KEY_ID="<OCI_S3_ACCESS_KEY>"
export AWS_SECRET_ACCESS_KEY="<OCI_S3_SECRET_KEY>"
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required   # Pitfall 9 — OCI S3-compat rejects streaming checksums
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

terraform init \
  -backend-config="region=<REGION>" \
  -backend-config="endpoints={s3=\"https://<NAMESPACE>.compat.objectstorage.<REGION>.oraclecloud.com\"}"

terraform plan -out=tfplan
terraform apply tfplan

# Hand-off to DNS:
terraform output public_ip   # paste into your DNS provider's A-record for timeline.bryanlam.dev (Phase 8 Wave 3)
```

> **OCI Ampere A1 "Out of host capacity":** First `terraform apply` may
> fail with HTTP 500 `Out of host capacity` on `oci_core_instance.timeline`.
> OCI's free-tier A1 pool is contested. Mitigations: (a) re-run
> `terraform apply tfplan` (state is consistent on failure); (b) try a
> different AD by re-applying with the AD-index variable adjusted (see
> `main.tf`); (c) try at off-peak hours; (d) reduce shape to 2 OCPU / 12 GB
> temporarily. **Do NOT add a `null_resource` retry loop in TF** — it
> pollutes state and the retry shell escapes the declarative model
> (RESEARCH Pitfall 1).

### Post-Provision: SCP `.env` and OCI PEM

Terraform does not manage `.env` secrets (D-08 — TF + secrets-in-state is
an anti-pattern). After `terraform apply` succeeds, SCP `.env` AND the OCI
API PEM from the laptop to the VM:

```bash
VM_IP=$(cd infra/terraform && terraform output -raw public_ip)

# 1. SCP .env (your production-ready values — NOT .env.local; create a
#    separate .env.prod and rename on the VM).
scp .env.prod ubuntu@$VM_IP:/opt/timeline-revamp/.env

# 2. Create .oci/ dir on the VM and SCP the PEM. The container runs as
#    UID 1001 (Dockerfile's `app` user); the bind mount preserves host
#    UIDs, so the PEM MUST be readable by UID 1001 or the api container
#    crashes with EACCES on first OCI operation.
ssh ubuntu@$VM_IP 'mkdir -p /opt/timeline-revamp/.oci'
scp ~/.oci/timeline-revamp.pem ubuntu@$VM_IP:/opt/timeline-revamp/.oci/timeline-revamp.pem

# 3. Lock down permissions. Note the PEM chown to UID 1001 — this is
#    critical and was the cause of a Phase 8 Wave 3 EACCES bug. `ls`
#    will display the owner as the literal number `1001` because the
#    host has no user with that UID (it's the container's user, not the
#    host's). That's expected and correct.
ssh ubuntu@$VM_IP '
  chmod 600 /opt/timeline-revamp/.env
  sudo chown 1001:1001 /opt/timeline-revamp/.oci/timeline-revamp.pem
  sudo chmod 400 /opt/timeline-revamp/.oci/timeline-revamp.pem
'
```

**`.env` for production** — start from `.env.example` and override these
keys for prod:
- `POSTGRES_PASSWORD` — use a **URL-safe** value (`openssl rand -hex 32`,
  NOT `-base64`, because `/`, `+`, `=` break the DATABASE_URL constructed
  by interpolation in `docker-compose.prod.yml`).
- `OCI_PRIVATE_KEY_PATH=/app/.oci/timeline-revamp.pem` — container-side
  path, NOT your laptop path. The compose file bind-mounts `./.oci/` on
  the VM at `/app/.oci/` in the container (read-only).
- All Auth0 + OCI + VITE_* values can match dev unless you maintain
  separate prod tenants.

**Future hardening:** Once `server/oci/parClient.ts` is switched from
`SimpleAuthenticationDetailsProvider` to
`InstancePrincipalsAuthenticationDetailsProvider`, the PEM file is no
longer needed in the container at all — the VM authenticates by being
itself via the instance metadata endpoint. The IAM dynamic group + scoped
policy that enable Instance Principal already exist (Phase 08.1-02). See
`.planning/phases/08-deploy-part-1/.continue-here.md` followup F4.

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

## DNS Cutover

Pre-flight requirement: 08-02's `curl --resolve` smoke MUST return HTTP/2 200 BEFORE running these steps. If it does not, fix Nginx / certbot first -- this section assumes a valid cert is on the VM (D-19).

### Pre-cutover (24 hours ahead)

1. **Lower TTL** on the existing DNS zone for `bryanlam.dev` to 300 seconds. This ensures a botched cutover propagates back within ~5 minutes instead of hours. Skip if TTL is already 300s or lower. Verify with:
   ```bash
   dig +short timeline.bryanlam.dev @1.1.1.1
   dig +noall +answer timeline.bryanlam.dev @1.1.1.1
   ```

   **Cloudflare / proxied-DNS branch:** If the bryanlam.dev zone is hosted on Cloudflare (or any provider that offers an "orange cloud" proxy mode), ALSO set the `timeline` A record to **DNS only** (gray cloud). Proxied mode would re-terminate TLS at the provider's edge and break the Let's Encrypt chain that 08-02 issued on the VM.

### Cutover

2. **Verify the VM IP is a Reserved Public IP** (not a dynamic ephemeral IP). On the OCI Console: Networking -> Reserved Public IPs -> confirm the IP attached to the VM's VNIC has `Lifecycle State: Available` and is `Assigned` to the primary VNIC. CLI alternative:
   ```bash
   oci network public-ip get --public-ip-id <ocid> --query 'data.{state:"lifecycle-state",assigned:"assigned-entity-id"}'
   ```
   If the VM is on a dynamic IP, attach a reserved public IP NOW (free on OCI free tier) before continuing -- otherwise the IP changes on next stop/start and DNS breaks.

3. **Pre-flight TLS smoke from laptop** (last check before flipping DNS):
   ```bash
   VM_IP=<vm-ip>
   curl --resolve timeline.bryanlam.dev:443:$VM_IP -fI https://timeline.bryanlam.dev/api/health
   openssl s_client -connect $VM_IP:443 -servername timeline.bryanlam.dev </dev/null 2>/dev/null \
     | openssl x509 -noout -dates -issuer
   ```
   Expected: 200 + valid LE chain. If not, STOP -- 08-02 is not finished.

4. **Flip the DNS A record** at the bryanlam.dev DNS provider:
   - Type: `A`
   - Name: `timeline` (or `timeline.bryanlam.dev` depending on the provider's UI convention)
   - Value: the VM's reserved public IP
   - TTL: 300

5. **Wait for propagation + verify from multiple resolvers:**
   ```bash
   dig +short timeline.bryanlam.dev @1.1.1.1
   dig +short timeline.bryanlam.dev @8.8.8.8
   dig +short timeline.bryanlam.dev @9.9.9.9
   ```
   All three should return the VM IP. If one resolver lags, wait another 1-2 minutes (300s TTL means ~5 min max).

6. **Update Auth0 production callback URL** (per 08-RESEARCH Runtime State Inventory):
   - Auth0 dashboard -> Applications -> Timeline SPA -> Settings
   - Allowed Callback URLs: add `https://timeline.bryanlam.dev/app`
   - Allowed Logout URLs: add `https://timeline.bryanlam.dev`
   - Allowed Web Origins: add `https://timeline.bryanlam.dev`
   - Save changes.

7. **OCI Object Storage CORS — not applicable for this stack.** Skip any CORS verification at cutover. Modern OCI Object Storage exposes no bucket-level CORS at any layer (no Console UI control, no Native API field, S3-compat returns `NotImplemented`). This stack does not need it: browser uploads go through PARs (which carry their own `Access-Control-Allow-Origin` header automatically), and photo display uses bare `<img src=...>` tags without `crossOrigin` (which browsers do not subject to CORS enforcement). If a future feature adds canvas pixel reads or credentialed `fetch()` against bucket URLs, the workaround is to front the bucket with an OCI API Gateway. See memory `feedback_oci_cors_via_s3.md` for the full evidence trail.

## Smoke Test

Closes DEPLOY-05 + the 3 deferred Phase 7 mobile UAT items per D-16. After this section's gates pass, Phase 8 is done.

### Bare automated battery

Run from the laptop (NOT on the VM -- the public hostname must resolve via DNS):

1. **Health endpoint reachable via public hostname:**
   ```bash
   curl -fsS https://timeline.bryanlam.dev/api/health | jq
   ```
   Expected output:
   ```json
   {"status":"ok","db":"ok"}
   ```

2. **TLS chain valid + future expiry:**
   ```bash
   openssl s_client -connect timeline.bryanlam.dev:443 -servername timeline.bryanlam.dev </dev/null 2>/dev/null \
     | openssl x509 -noout -dates -issuer -subject
   ```
   Expected: `issuer=...Let's Encrypt...`, `notAfter=<date ~90 days out>`.

3. **Renewal still works post-DNS:**
   ```bash
   ssh ubuntu@<vm> 'sudo certbot renew --dry-run'
   ```
   Expected: exit 0 + "Congratulations, all simulated renewals succeeded".

4. **certbot.timer still active:**
   ```bash
   ssh ubuntu@<vm> 'systemctl is-active certbot.timer && systemctl is-enabled certbot.timer'
   ```
   Expected: `active\nenabled\n`.

5. **HTTP -> HTTPS redirect works:**
   ```bash
   curl -fI http://timeline.bryanlam.dev/api/health
   ```
   Expected: `HTTP/1.1 301 Moved Permanently`, `Location: https://timeline.bryanlam.dev/api/health`.

6. **First authenticated login round-trip succeeds:**
   Open `https://timeline.bryanlam.dev/app` in a browser. Click Sign In. Auth0 Universal Login renders. After login, the browser lands back on `https://timeline.bryanlam.dev/app` with a valid session. (If Auth0 redirects to an error page, the callback whitelist from DNS Cutover step 6 is missing or wrong.)

### Mobile UAT (real iPhone 14 Pro, iOS 17+, Safari)

These three items close Phase 7's UAT debt (`07-HUMAN-UAT.md`). Use a real iPhone -- the device-specific GPU + WebGL + globe-projection rendering paths cannot be simulated. Connect the phone to a Mac via USB for Web Inspector access.

7. **UAT-1: iPhone Safari sustains 60 FPS on 1-city OrbitReel for 30s+:**
   - Setup: stage a single-city test handle (e.g. `bryanlam-test-1city`) with exactly one city. If no such handle exists, sign in on the laptop, add one city, log out, and use that handle.
   - Visit `https://timeline.bryanlam.dev/u/<1-city-handle>` on iPhone Safari.
   - On Mac: Safari -> Develop -> <iPhone Name> -> select the page tab.
   - Open Web Inspector -> Timelines tab -> Rendering Frames -> Start.
   - Observe for 30+ seconds.
   - Pass criterion: all (or essentially all -- transient spikes during the very first second of orbit start are acceptable) bars stay BELOW the 16.67ms (60 FPS) target line.
   - Deviation note: if observed FPS dips on an older device than iPhone 14 Pro (e.g. an iPhone 12 or earlier), log the device model + observed FPS in the SUMMARY and flag for Phase 12 polish -- the 60 FPS expected criterion is "iPhone 14 Pro" specifically, not a blanket all-iOS guarantee.

8. **UAT-2: GlobeReel renders as an actual 3D globe on iOS Safari:**
   - Setup: stage a 0-city handle (no cities).
   - Visit `https://timeline.bryanlam.dev/u/<0-city-handle>` on iPhone Safari.
   - Pass criterion: visually confirm the globe is SPHERICAL -- continents curve toward the poles (not a flat mercator projection). The slow 10 deg/s rotation should be visible.

9. **UAT-3: Mixed-case URL `/u/Bryan` resolves same as `/u/bryan` + Nginx per-URL cache (Phase 7 D-21):**
   - Setup: use the existing handle (e.g. `bryan`).
   - Visit `https://timeline.bryanlam.dev/u/Bryan` on iPhone Safari -> same reel renders.
   - Visit `https://timeline.bryanlam.dev/u/bryan` on iPhone Safari -> same reel renders.
   - From laptop, verify Nginx per-URL caching:
     ```bash
     # First request -- expect cold cache:
     curl -sI https://timeline.bryanlam.dev/u/Bryan | grep -iE 'X-Cache-Status'
     # Wait 1-2 seconds, second request -- expect warm cache:
     curl -sI https://timeline.bryanlam.dev/u/Bryan | grep -iE 'X-Cache-Status'
     ```
     First should print `x-cache-status: MISS`; second `x-cache-status: HIT`. The intentional per-URL cache key (`$scheme$host$uri`) means `/u/Bryan` and `/u/bryan` are SEPARATE cache entries -- both should serve the same content, both should flip MISS -> HIT independently.
   - Pass criterion: both URLs render the same reel; X-Cache-Status flips MISS -> HIT on the second request to the same URL.

### Photos load over CORS

10. **Real photo load smoke** (catches the RESEARCH Pitfall 3 ESM/require regression + Pitfall 2 VITE_* env regression + OCI CORS regression):
    - Visit `https://timeline.bryanlam.dev/u/<handle-with-photos>` from iPhone Safari.
    - Scroll through the reel.
    - Pass criterion: photos appear in the chapter overlays (no broken-image icons; no CORS error entries in iPhone Safari Web Inspector -> Console).

After ALL TEN gates pass, Phase 8 is complete. Update `.planning/phases/07-public-urls-handle/07-HUMAN-UAT.md` to mark items 1/2/3 as `pass`.

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

### Customer Secret Key Rotation

The state-backend Customer SK is a long-lived credential. Rotate quarterly minimum.

```bash
# 1. Generate new SK
oci iam customer-secret-key create \
  --user-id "$USER_OCID" \
  --display-name "terraform-state-backend-$(date +%Y%m%d)"

# 2. Update GHA Secrets OCI_S3_ACCESS_KEY + OCI_S3_SECRET_KEY (GitHub UI)
#    Settings → Secrets and variables → Actions → update both secrets in place.

# 3. Verify the new key works via a no-op `terraform plan` run from CI
#    (re-run the latest workflow on main).

# 4. Delete the OLD SK ONLY after the no-op plan succeeds:
oci iam customer-secret-key delete \
  --user-id "$USER_OCID" \
  --customer-secret-key-id "<OLD_SK_ID>"
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
