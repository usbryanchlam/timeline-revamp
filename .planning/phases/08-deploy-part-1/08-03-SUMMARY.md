---
phase: 08-deploy-part-1
plan: 03
subsystem: infra
tags:
  - phase-08
  - deploy
  - dns
  - uat
  - smoke-test
  - phase-07-uat-closure
  - launch

# Dependency graph
requires:
  - phase: 08-deploy-part-1
    provides: "08-01 Docker Compose API+postgres stack; 08-02 Nginx + Let's Encrypt config in repo"
  - phase: 08.1-infra-terraform
    provides: "Terraform-provisioned VM at 64.181.252.226 (Reserved Public IP) running cloud-init Ubuntu 22.04 ARM; photos bucket; IAM dynamic group + scoped policy"
provides:
  - "infra/DEPLOY.md ## DNS Cutover section (7 numbered steps, including Namecheap A-record edit, multi-resolver verification, Auth0 callback whitelist update)"
  - "infra/DEPLOY.md ## Smoke Test section (10 gates — 6 bare automated + 3 mobile UAT + 1 photo CORS smoke)"
  - ".planning/phases/07-public-urls-handle/07-HUMAN-UAT.md flipped from 1/4 passed to 4/4 (3 pass + 1 partial — gate 1 visual iPhone pass without instrumented FPS)"
  - "Production deployment at https://timeline.bryanlam.dev with Let's Encrypt YR1 cert (expires 2026-08-28)"
affects:
  - "Phase 9 (Deploy part 2 + CI/CD): inherits the manual deploy runbook; auto-deploy on tag-push is the next phase"
  - "Phase 12 (Launch polish): instrumented iPhone FPS measurement + motion tuning + HandlePicker UX both deferred here"
---

# 08-03 — DNS Cutover + Smoke Battery Summary

## Outcome

**v1 live at https://timeline.bryanlam.dev as of 2026-05-30.** All three Phase 8 success criteria from ROADMAP.md met:

1. ✅ OCI Ampere A1 VM (4 OCPU / 24 GB / 100 GB block, ARM64) running Docker Compose with API + Postgres + Nginx
2. ✅ https://timeline.bryanlam.dev resolves with valid Let's Encrypt cert (issuer YR1, valid through 2026-08-28)
3. ✅ `certbot renew --dry-run` succeeds; `certbot.timer` active + enabled

Phase 7's three deferred mobile UAT items are now closed (07-HUMAN-UAT.md `passed: 3, partial: 1, pending: 0`).

## Cutover timeline

| Time (UTC) | Event |
|---|---|
| 2026-05-27 | Phase 08.1 first `terraform apply` provisioned the VM (14/16 resources; CORS + OIDC trust deferred per separate UAT items) |
| 2026-05-30 ~16:00 | SSH access to VM verified; cloud-init failures detected (see Findings below) |
| 2026-05-30 ~16:30 | iptables ordering fixed; docker-compose-plugin installed; repo cloned manually |
| 2026-05-30 ~17:00 | 72 unpushed commits published to GitHub (Phase 7 + 8 + 8.1 + corrections) |
| 2026-05-30 ~17:15 | `.env` + OCI PEM SCP'd to VM (production `.env` distinct from dev `.env.local`) |
| 2026-05-30 ~17:30 | Docker Compose stack up; `db:migrate` ran (after switching tsx → bun for db:migrate script) |
| 2026-05-30 ~17:45 | Postgres exposure on `0.0.0.0:5432` discovered and fixed (rebind to 127.0.0.1; commit `d3b1976`) |
| 2026-05-30 ~18:00 | Nginx config + certbot --nginx → cert issued for timeline.bryanlam.dev |
| 2026-05-30 ~18:30 | DNS A record flipped from 54.151.5.199 (old AWS) → 64.181.252.226 (OCI VM); TTL 300; Namecheap |
| 2026-05-30 ~18:35 | Multi-resolver propagation confirmed (1.1.1.1, 8.8.8.8, 9.9.9.9 all returning new IP) |
| 2026-05-30 ~18:40 | Auth0 SPA Allowed Callback / Logout / Web Origins updated with https://timeline.bryanlam.dev/app |
| 2026-05-30 ~19:00 | iPhone UAT walked; surfaced PEM UID mismatch (EACCES on /finalize) + bucket access_type mismatch (404 on master fetch) |
| 2026-05-30 ~19:45 | Both fixed: PEM chown'd to UID 1001; bucket `access_type` → `ObjectRead` via targeted `terraform apply` |
| 2026-05-30 ~20:00 | Photo upload round-trip verified — full SPA + Auth + DB + photo pipeline live |
| 2026-05-30 ~20:15 | Gates 7/8/9 walked on iPhone (visual pass) + laptop curl (X-Cache-Status MISS→HIT confirmed) |

## 10-gate smoke battery results

| Gate | Test | Result | Detail |
|---|---|---|---|
| 1 | curl /api/health over HTTPS | ✅ pass | `{"status":"ok","db":"ok"}` |
| 2 | openssl TLS chain | ✅ pass | Let's Encrypt YR1 issuer, valid 2026-05-30 → 2026-08-28 (89 days) |
| 3 | certbot renew --dry-run | ✅ pass | "Congratulations, all simulated renewals succeeded" |
| 4 | certbot.timer active + enabled | ✅ pass | `active\nenabled` |
| 5 | HTTP→HTTPS 301 redirect | ✅ pass | `HTTP/1.1 301 Moved Permanently` on http://timeline.bryanlam.dev/* |
| 6 | Auth0 login round-trip | ✅ pass | Sign In on /app → Universal Login → callback to /app/* with valid session; HandlePickerModal flow worked |
| 7 | iPhone 60 FPS on 1-city OrbitReel | 🟡 partial | iPhone visual pass (smooth, no observed jank); instrumented Web Inspector FPS NOT performed (iPhone not USB-tethered); laptop Chrome held 120 FPS as floor signal |
| 8 | GlobeReel 3D projection on 0-city handle | ✅ pass | iPhone Safari at /u/bryan (0 cities) rendered globe as spherical with visible continent curvature and slow rotation |
| 9 | Mixed-case URL + X-Cache-Status MISS→HIT | ✅ pass | iPhone Safari at /u/Bryan and /u/bryan rendered identical content; curl from laptop showed `X-Cache-Status: EXPIRED` then `HIT` on subsequent requests (functionally equivalent to MISS→HIT — both demonstrate cache populate-and-serve through the per-URL key `$scheme$host$uri`) |
| 10 | Photos load on iPhone | ✅ pass | After bucket access_type → ObjectRead + PEM UID 1001 fix, full upload pipeline round-trip verified: POST /upload-url → PUT to PAR → POST /finalize → thumbnail visible in grid |

## Findings (problems surfaced during this plan)

These were not part of the planned scope of 08-03; they emerged during the live cutover and are captured here so the next phase can address them properly.

### F1 — cloud-init failed partway during first VM boot

Phase 08.1's `infra/cloud-init.yaml` had several issues that only surfaced when an operator actually SSH'd into the VM:

- `docker-compose-plugin` package isn't in Ubuntu 22.04 jammy default repos — needs Docker's official apt repo configured first, OR switch to the `docker-compose-v2` package from Ubuntu universe.
- iptables `ACCEPT tcp dpt:80` and `dpt:443` rules were appended (`-A INPUT`) after the catch-all `REJECT` rule, making 80/443 unreachable from the public internet despite being intended-open.
- The `git clone /opt/timeline-revamp` runcmd ran even though the prior `package_update_upgrade_install` errored; it produced an empty `/opt/timeline-revamp` directory with no `.git`.
- The nginx config in this repo references `proxy_cache_path /var/cache/nginx/public_reel`, but cloud-init didn't pre-create that directory; `nginx -t` failed on first attempt.

All four were fixed in place on the live VM (commits not against `infra/cloud-init.yaml`). Re-provisioning a fresh VM via `terraform taint + apply` today would hit the same bugs. **Captured as Phase 8.1.1 (or Phase 9 early scope) follow-up — see Followups section.**

### F2 — `docker-compose.yml` published Postgres on `0.0.0.0:5432`

The dev compose file at the repo root bound postgres to `0.0.0.0:5432`. The prod override (`docker-compose.prod.yml`) tried to clear this with `ports: []`, but Compose **concatenates** the `ports` list across overrides rather than replacing — so the dev publish leaked through into production.

Fixed in commit `d3b1976` by changing the base file's bind to `127.0.0.1:5432:5432` (loopback only). Dev tooling on the laptop still works (connects via localhost); production no longer exposes the database to the internet. D-11 honored.

### F3 — `db:migrate` script used `tsx`, which is incompatible with bun

`package.json`'s `db:migrate` script invoked `tsx server/db/migrate.ts`. Under bun, tsx's CJS shim resolution fails with `Cannot find module './cjs/index.cjs' from ''`. bun runs TypeScript natively without tsx.

Fixed in commit `d3b1976` by switching to `bun run server/db/migrate.ts`. `tsx` could be removed from devDependencies entirely (broader audit deferred).

### F4 — OCI PEM ownership mismatch (UID 1000 vs container UID 1001)

The Dockerfile creates the container's runtime user as UID **1001** (`addgroup -g 1001 -S app && adduser -u 1001 -S app -G app`). The operator-followed DEPLOY.md instructions create `/opt/timeline-revamp/.oci/timeline-revamp.pem` owned by `ubuntu` (UID **1000**) with mode `600`. The bind mount preserves host UIDs into the container; UID 1001 cannot read a file owned by UID 1000 with mode 600.

Symptom: `EACCES: permission denied, open '/app/.oci/timeline-revamp.pem'` from `getOciClient()` on the first photo upload attempt.

Fixed live by `sudo chown 1001:1001 ... && sudo chmod 400 ...`. **DEPLOY.md needs this chown step added to the Post-Provision SCP block.** Captured as a Followup. The longer-term fix is to switch `server/oci/parClient.ts` to Instance Principal authentication (the IAM dynamic group + policy were set up in Phase 08.1 and just need code to use them), at which point no PEM file is needed in the container at all.

### F5 — bucket access_type was NoPublicAccess; code assumed ObjectRead

Phase 08.1's `infra/terraform/storage.tf` declared the bucket with `access_type = "NoPublicAccess"` on the theory that PARs would be minted per-object for both reads and writes. But the actual code only mints **write** PARs:

- `server/oci/parClient.ts:getMasterBuffer` does an unauthenticated `fetch()` against `getPublicUrl(objectKey)` to read the just-uploaded master for thumbnail generation. Under NoPublicAccess this 404s, breaking `/api/photos/<id>/finalize`.
- `src/components/PhotoGrid.tsx` and `PhotoViewer.tsx` render `<img src={thumbUrl/masterUrl}>` directly using the same public URL pattern. Under NoPublicAccess every image would 404 in the browser.

Fixed in commit `de2a855` by switching to `access_type = "ObjectRead"` + targeted `terraform apply`. Security model is now equivalent to Google Photos shared-album-by-link semantics — UUID-named objects are unguessable (128 bits), no listing is allowed. **Path B (mint short-TTL read PARs server-side and pass PAR URLs to the client) is a future hardening pass.**

### F6 — `ops/nginx/timeline.conf` `location /` and `~ ^/u/[^/]+$` used `try_files`

The Phase 7 nginx config served the SPA shell and the /u/<handle> public-reel HTML via `try_files $uri /index.html`. That worked when `dist/` lived on the nginx host's filesystem (Phase 7 architecture). Phase 8 moved `dist/` **inside** the API container (Hono `serveStatic` mount; D-09 runtime image only). On the prod VM, `try_files` fell through to nginx's default root (`/var/www/html`) and served the "Welcome to nginx!" page for every SPA route.

The `/assets/` block already proxied and its inline comment explicitly called out this landmine — but the two SPA-shell blocks weren't updated in the Phase 8 architecture pass.

Fixed in commit `bf837ff` — both blocks now `proxy_pass http://timeline_api;`. `^/u/[^/]+$` retains the `public_reel` cache zone + case-preserving cache key; `location /` is uncached (authenticated /app surface).

### F7 — `.env.bak` and `.oci/` weren't gitignored

`.env.bak` (a backup created by `sed -i.bak` when fixing the URL-unsafe `POSTGRES_PASSWORD`) and `.oci/` (containing the OCI API PEM private key) were both untracked but **not gitignored**. A careless `git add -A` would have published secrets.

Hardened in commit `7dbca34` by broadening the env pattern to `.env.*` (with `.env.example` whitelisted) and adding `.oci/` + `*.pem` as defense-in-depth.

### F8 — UAT-surfaced UX feedback (not pre-launch blockers)

Three iPhone UAT observations beyond the formal smoke gates:

- **HandlePickerModal "Claim" button starts dimmed.** Disabled state at modal open because `check.state !== 'available'` (no input typed yet). On the iPhone, button "brightens" when the user types a valid handle in the input (effectively simultaneous with tapping the field). Not a bug; the right fix is to pre-populate the input with a sensible suggestion derived from Auth0 user identity. **Deferred to a polish session.**
- **City-to-city transition feels too fast.** OrbitReel's `flyTo` uses `FLY_DURATION_MS = 1800` and `ARRIVAL_CURVE = 1.6`. User wants a "plane travel" cinematic — longer duration, higher zoom-out arc, possibly a brief cruise plateau. **This is the brand promise per DESIGN.md / CLAUDE.md ("the memorable thing IS the motion … camera flies like a movie"). Deferred to a focused motion-tuning session with DESIGN.md and the live iPhone.**
- **/app/me page was a stub.** Showed only `<h1>Me</h1>`. **Fixed in commit `4aa9479`** — now displays Auth0 user avatar + name + email + a Sign Out button. Pending ship via VM `git pull && docker compose up -d --build`.

## Followups

These all flow into the Phase 9 / 8.1.1 / Phase 12 backlogs. See `.continue-here.md` in this phase folder for the structured handoff.

| Item | Severity | Target phase |
|---|---|---|
| Fix the four cloud-init bugs (F1) so a fresh `terraform taint + apply` produces a working VM | Medium | Phase 8.1.1 or Phase 9 early scope |
| Document the UID-1001 chown step in `infra/DEPLOY.md` Post-Provision SCP block | Low | Bundled with F1 |
| Switch `server/oci/parClient.ts` to Instance Principal auth (eliminates PEM-in-container risk) | Low | Future hardening |
| Mint read PARs server-side instead of relying on bucket `ObjectRead` (F5 Path B) | Low | Future hardening |
| Pre-fill HandlePickerModal with Auth0-derived suggestion + fire check on mount | Low | Polish session |
| Cinematic motion tuning (FLY_DURATION_MS + ARRIVAL_CURVE + easing) | Brand-critical | Dedicated session with DESIGN.md + live iPhone |
| Instrumented iPhone Web Inspector FPS measurement for 07-HUMAN-UAT item 1 | Low | Phase 12 pre-launch |
| Bump `oracle/oci` provider pin to enable OIDC Identity Propagation Trust (08.1 deferred item) | Low | Phase 8.1.1 |
| Build out `MeRoute` past the v1 minimal version (handle status, storage usage, account deletion) | Low | Phase 9 |
| Build out `/app/trips` empty-state polish | Low | Phase 9 |

## Phase 8 elapsed time

| Plan | Phase | Wall-clock |
|---|---|---|
| 08-01 | Docker Compose + Hono serveStatic | ~2h (2026-05-15 evening) |
| 08-02 | Nginx + Let's Encrypt config | ~1h (2026-05-15 evening) |
| 08.1-01..03 | Terraform IaC insert (3 plans, 3 waves) | ~6h spread across 2026-05-26..27 + 2026-05-28 docs |
| 08-03 | DNS cutover + smoke battery + UAT | ~5h (2026-05-30) — large fraction was triage of F1..F7 |
| **Total Phase 8** | **End-to-end** | **~14h** including the 8.1 insertion |

## Files modified by this plan

- `infra/DEPLOY.md` — DNS Cutover + Smoke Test sections appended (committed 2026-05-15 in `25835f5`, reconciled to current truth here)
- `.planning/phases/07-public-urls-handle/07-HUMAN-UAT.md` — items 1/2/3 flipped from pending to pass/partial; summary updated; followup logged
- `.planning/phases/08-deploy-part-1/08-03-SUMMARY.md` — this file
- `.planning/phases/08.1-infra-terraform/08.1-HUMAN-UAT.md` — F4 + F5 + F1 findings appended
- `.continue-here.md` — handoff for the next session
- `.planning/ROADMAP.md` — Phase 8 + 08-03 plan marked complete
- `.planning/STATE.md` — phase position advanced

Files modified during the cutover itself (already committed under their own commits):

- `infra/terraform/storage.tf` (`de2a855`) — bucket access_type ObjectRead
- `docker-compose.yml` + `package.json` (`d3b1976`) — postgres rebind, db:migrate via bun
- `ops/nginx/timeline.conf` + `.gitignore` (`7dbca34`) — certbot TLS directives + secret hardening
- `ops/nginx/timeline.conf` (`bf837ff`) — SPA proxy_pass instead of try_files
- `src/routes/MeRoute.tsx` (`4aa9479`) — minimal v1 profile page
