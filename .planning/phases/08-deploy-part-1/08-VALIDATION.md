---
phase: 08
slug: deploy-part-1
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Phase 08 is an infrastructure phase — most verifications are runbook-driven manual smoke tests, not automated. The single automatable surface is the `/api/health` endpoint's behavior; everything else (TLS cert chain, certbot renew dry-run, DNS resolution, mobile FPS) lives in the runbook.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.5 + @vitest/coverage-v8 ^4.1.5 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `bun run test` (~3–5s currently) |
| **Full suite command** | `bun run test:coverage` |
| **Estimated runtime** | ~5–15 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Run `bun run typecheck && bun run test`
- **After every plan wave:** Run `bun run test:coverage`
- **Before `/gsd-verify-work`:** Full automated suite green AND the manual runbook smoke battery (curl /api/health on live VM, openssl s_client TLS chain, `sudo certbot renew --dry-run`, dig DNS, plus 3 mobile UAT items on iPhone) MUST be checked off.
- **Max feedback latency:** ~5 seconds for automated layer; the manual runbook layer is inherently slower (estimated 20–40 min walkthrough) but only fires at the phase gate.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-W0-01 | 01 | 0 | DEPLOY-01 | — | Wave 0 stub for `/api/health` route + DB ping | unit | `bun run test server/routes/health.test.ts` | ❌ W0 — create `server/routes/health.test.ts` | ⬜ pending |
| 08-01-01 | 01 | 1 | DEPLOY-01 | — | Hono `/api/health` returns 200 + `{status:'ok', db:'ok'}` when DB ping succeeds | unit | `bun run test server/routes/health.test.ts -t "200 when db ping succeeds"` | depends on W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | DEPLOY-01 | — | Hono `/api/health` returns 503 + `{status:'error', db:'unreachable'}` when DB ping throws | unit | `bun run test server/routes/health.test.ts -t "503 when db ping throws"` | depends on W0 | ⬜ pending |
| 08-01-03 | 01 | 1 | DEPLOY-01 | — | Production Dockerfile builds successfully on arm64 (image artifact) | integration | `docker compose -f docker-compose.yml -f docker-compose.prod.yml build` exits 0 | N/A — Docker build, not a unit test | ⬜ pending |
| 08-01-04 | 01 | 1 | DEPLOY-01 | — | `docker compose -f compose.yml -f compose.prod.yml up -d` brings api + postgres to healthy state on the VM | manual | `ssh ubuntu@vm 'docker compose ps'` shows both services `(healthy)` | N/A — runbook step | ⬜ pending |
| 08-01-05 | 01 | 1 | DEPLOY-01 | — | Postgres NOT publishing 5432 in prod (loopback only) | manual | `ssh ubuntu@vm 'docker compose port postgres 5432'` returns nothing | N/A — runbook step | ⬜ pending |
| 08-02-01 | 02 | 2 | DEPLOY-02 | — | Host Nginx symlink to `ops/nginx/timeline.conf` validates clean | manual | `sudo nginx -t` on VM returns "syntax is ok / test is successful" | N/A — runbook step | ⬜ pending |
| 08-02-02 | 02 | 2 | DEPLOY-02 | — | Nginx upstream points to `127.0.0.1:8787` (matches API loopback port) | static | `grep -E 'proxy_pass http://127.0.0.1:8787' ops/nginx/timeline.conf` exits 0 | ✅ acceptance grep in plan | ⬜ pending |
| 08-02-03 | 02 | 2 | DEPLOY-02 | — | TLS cert issued for `timeline.bryanlam.dev` via certbot --nginx | manual | `sudo certbot certificates` lists the cert with future expiry | N/A — runbook step | ⬜ pending |
| 08-02-04 | 02 | 2 | DEPLOY-02 | — | `certbot renew --dry-run` succeeds | manual | `sudo certbot renew --dry-run` exits 0 | N/A — runbook step | ⬜ pending |
| 08-02-05 | 02 | 2 | DEPLOY-02 | — | `certbot.timer` is active and enabled (auto-renew configured) | manual | `sudo systemctl is-active certbot.timer && sudo systemctl is-enabled certbot.timer` both `active`/`enabled` | N/A — runbook step | ⬜ pending |
| 08-02-06 | 02 | 2 | DEPLOY-02 | — | certbot mutations to `timeline.conf` (auto-injected TLS lines) are committed back to repo | static | `git diff ops/nginx/timeline.conf` shows the SSL block; commit exists | N/A — runbook checklist | ⬜ pending |
| 08-03-01 | 03 | 3 | DEPLOY-05 | — | OCI Reserved Public IP attached to the VM (won't change on stop/start) | manual | OCI Console / `oci network public-ip get --public-ip-id <id>` shows `lifecycle-state: ASSIGNED` and `assigned-entity-type: PRIVATE_IP` | N/A — runbook step | ⬜ pending |
| 08-03-02 | 03 | 3 | DEPLOY-05 | — | TLS works against VM IP via `curl --resolve` BEFORE DNS flip | manual | `curl -fI --resolve timeline.bryanlam.dev:443:<vm-ip> https://timeline.bryanlam.dev/api/health` returns 200 | N/A — runbook step | ⬜ pending |
| 08-03-03 | 03 | 3 | DEPLOY-05 | — | DNS A record for `timeline.bryanlam.dev` resolves to VM IP | manual | `dig +short timeline.bryanlam.dev` returns VM IP | N/A — runbook step | ⬜ pending |
| 08-03-04 | 03 | 3 | DEPLOY-05 | — | Live HTTPS smoke: `/api/health` returns 200 + db:'ok' via public domain | manual | `curl -fsS https://timeline.bryanlam.dev/api/health` returns the JSON; `openssl s_client -connect timeline.bryanlam.dev:443` shows valid LE chain | N/A — runbook step | ⬜ pending |
| 08-03-05 | 03 | 3 | (smoke) D-16 | — | iPhone Safari sustains 60 FPS on 1-city OrbitReel for 30s+ | manual UAT | iPhone 14 Pro / iOS 17+ → Safari Web Inspector → Timelines → Rendering Frames; bars below 16.67ms line | N/A — manual on real device | ⬜ pending |
| 08-03-06 | 03 | 3 | (smoke) D-16 | — | GlobeReel renders as actual 3D globe on iOS Safari (not flat mercator) | manual UAT | Visit `/u/<0-city-handle>`; continents curve toward poles; rotation visible | N/A — manual on real device | ⬜ pending |
| 08-03-07 | 03 | 3 | (smoke) D-16 | — | Mixed-case URL `/u/Bryan` resolves same reel as `/u/bryan` | manual UAT | Open both URLs on iPhone Safari; same reel content; Nginx `X-Cache-Status: MISS` then `HIT` per-URL | N/A — manual; X-Cache headers via curl after | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/routes/health.test.ts` — NEW. Stubs for DEPLOY-01 health endpoint + DB ping. Mock `db.execute(sql\`select 1\`)` to return success / throw; assert 200/503 + correct JSON body. ~6-8 test cases (db_ok, db_throws, malformed_response, no_db_configured).
- [ ] Existing infrastructure (vitest + db.test seam patterns from Phase 4-6) covers the rest — no new framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| VM provisioned with ≥ 2 OCPU / 8 GB on OCI Ampere A1 | DEPLOY-01 | Infrastructure provisioning step; no automated assertion possible from inside the app repo | OCI Console → Compute → Instances; shape `VM.Standard.A1.Flex`, OCPU ≥ 2, memory ≥ 8 GB |
| Docker + Compose plugin installed on VM | DEPLOY-01 | One-time bootstrap; `infra/setup.sh` runbook executes apt-get install | After `setup.sh`: `ssh ubuntu@vm 'docker --version && docker compose version'` |
| iptables rules ordered correctly (ACCEPT 80/443 BEFORE REJECT) | DEPLOY-02 | OCI Ubuntu base image gotcha — documented in mykb DEPLOYMENT.md:268-280 | `ssh ubuntu@vm 'sudo iptables -L INPUT -n --line-numbers'` — verify ACCEPT lines for dport 80 and 443 appear BEFORE any REJECT line |
| Let's Encrypt cert issued and valid | DEPLOY-02 | Certbot ACME flow; one-time interactive step | `sudo certbot certificates` shows valid expiry > 60 days away; `openssl s_client -connect timeline.bryanlam.dev:443 -servername timeline.bryanlam.dev </dev/null` shows full chain |
| systemd certbot.timer survives reboot | DEPLOY-02 | Behavior emerges from systemd, not the app | `sudo systemctl is-enabled certbot.timer` returns `enabled`; reboot VM, re-verify (one-time check in runbook) |
| DNS cutover successful, propagation complete | DEPLOY-05 | Requires DNS provider action + propagation wait | Update A record at DNS provider; `dig @1.1.1.1 +short timeline.bryanlam.dev` and `dig @8.8.8.8 +short timeline.bryanlam.dev` both return VM IP |
| Auth0 production callback URL allowed | DEPLOY-02/05 | Out-of-band dashboard config; not in repo | Auth0 dashboard → Applications → Allowed Callback URLs includes `https://timeline.bryanlam.dev/app` |
| OCI Object Storage bucket CORS allows `timeline.bryanlam.dev` origin | DEPLOY-05 | Out-of-band OCI config; per `feedback_oci_cors_via_s3.md`, must be set via S3-compat API not OCI native | Use AWS CLI against OCI S3 endpoint to verify CORS rules permit the production domain |
| iPhone Safari 60 FPS sustained on 1-city OrbitReel | (smoke) D-16 | Real-device GPU performance only verifiable on the device | iPhone 14 Pro + iOS 17+ → Safari → Web Inspector via USB → Timelines tab → Rendering Frames; observe for 30s+ |
| GlobeReel renders 3D projection on iOS Safari | (smoke) D-16 | Real-device WebGL2 + MapLibre globe projection only verifiable on the device | Open `/u/<0-city-handle>` on iPhone Safari; visually confirm spherical Earth (continents curve toward poles) and slow rotation |
| Mixed-case URL resolves consistently with cache hit on second request | (smoke) D-16 | Crosses Nginx + app + DNS; Phase 7 D-21 cache key includes case in $uri (intentional 2x cache space) | Visit `/u/Bryan` and `/u/bryan` on iPhone; verify same content; on follow-up, `curl -I https://timeline.bryanlam.dev/u/Bryan` shows `X-Cache-Status: HIT` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify OR are explicitly Manual-Only with a runbook command
- [ ] Sampling continuity: the 1 automatable task (`/api/health` unit tests) gates the rest; no 3 consecutive automated tasks without verify because the phase has only 2 automated tasks total
- [ ] Wave 0 covers the single MISSING reference (`server/routes/health.test.ts`)
- [ ] No watch-mode flags used in commands
- [ ] Feedback latency < 5s for automated layer; manual layer fires once at phase gate
- [ ] `nyquist_compliant: true` set in frontmatter (after planner converts this draft)

**Approval:** pending
