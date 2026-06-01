---
phase: 9
slug: deploy-part-2-empty-error-states
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Populated by the planner during plan generation; finalized at Wave 0 of execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun test (server + unit) + vitest (Vite/React) |
| **Config file** | `vitest.config.ts` / `bunfig.toml` (confirm during Wave 0) |
| **Quick run command** | `bun run typecheck` |
| **Full suite command** | `bun test && bun run typecheck && bun run build` |
| **Estimated runtime** | ~60–120 seconds (quick), ~3–5 min (full) |

> Note: project has NO `lint` script (per RESEARCH.md L935, verified in package.json L6–21). Do NOT add `bun run lint` to any sampling step.

---

## Sampling Rate

- **After every task commit:** Run `bun run typecheck`
- **After every plan wave:** Run `bun test && bun run build`
- **Before `/gsd-verify-work`:** Full suite must be green AND deploy-job dry-run on a non-prod tag must complete to OCIR push
- **Max feedback latency:** 120 seconds (quick), 300 seconds (full)

---

## Per-Task Verification Map

> One row per task across all 3 plans. Automated commands pulled verbatim from each task's `<automated>` block.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-T1 | 09-01 | 1 | DEPLOY-03, DEPLOY-04 | T-09-01-01..04, T-09-01-06..08 | OCIR token via `--password-stdin`; tag-match guard; concurrency-safe deploy job | grep-gate | `test -f .github/workflows/deploy.yml && grep -q "appleboy/ssh-action@v1" ... && grep -q "set -euo pipefail" ... && grep -q "environment: production" ...` | ✅ (new file created by task) | ⬜ pending |
| 09-01-T2 | 09-01 | 1 | DEPLOY-03 | T-09-01-08 | Tag-pin (`image:` not `build:`); no `:latest` in deploy | grep-gate + YAML parse | `grep -q "image: \${OCIR_REGISTRY}/\${OCIR_REPO}:\${IMAGE_TAG}" docker-compose.prod.yml && ! grep -E "^[[:space:]]+build:" docker-compose.prod.yml` | ✅ (existing file modified) | ⬜ pending |
| 09-01-T3 | 09-01 | 1 | DEPLOY-04 | T-09-01-03, T-09-01-04 | Runbook: dedicated key, tag-match recovery, OCIR token rotation | grep-gate | `grep -q "^## CI/CD" infra/DEPLOY.md && ! grep -q "^## Phase 9 — what changes from this runbook" infra/DEPLOY.md && grep -q "appleboy/ssh-action" infra/DEPLOY.md` | ✅ (existing file modified) | ⬜ pending |
| 09-02-T1 | 09-02 | 1 | DEPLOY-06 | T-09-02-01, T-09-02-02, T-09-02-10 | Request-id correlator; sanitized 500; HTTPException re-emit | bun test + grep-gate (+ middleware-order grep per W1) | `bun run test -- server/index.requestId.test.ts server/index.error.test.ts && grep-checks on server/index.ts` | ✅ (test files NEW; production file MODIFIED) | ⬜ pending |
| 09-02-T2 | 09-02 | 1 | DEPLOY-06 (F9 cross-phase) | T-09-02-04, T-09-02-05 | Custom-claim read AFTER `jwtVerify`; fallback to standard claim | bun test + grep-gate | `bun run test -- server/auth/jwt.test.ts && grep -q "const EMAIL_CLAIM = 'https://timeline.bryanlam.dev/email'" server/auth/jwt.ts` | ✅ (existing file extended; test extended) | ⬜ pending |
| 09-02-T3 | 09-02 | 1 | DEPLOY-06 (F1.1 cross-phase) | T-09-02-07, T-09-02-08 | TLS template files pre-staged before nginx start | grep-gate + YAML parse | `grep -q "F1.1 bootstrap chicken-egg" infra/cloud-init.yaml && grep -q "openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048" infra/cloud-init.yaml && python3 -c "import yaml; yaml.safe_load(open('infra/cloud-init.yaml'))"` | ✅ (existing file extended) | ⬜ pending |
| 09-03-T1 | 09-03 | 2 | ERR-01 | T-09-03-01, T-09-03-02, T-09-03-10 | Anchored regex (`/^HTTP (\d{3})$/`); no catastrophic backtracking | bun test + grep-gate | `bun run test -- src/photos/retry.test.ts && grep -F '/^HTTP (\d{3})$/' src/photos/retry.ts` | ✅ (new files created) | ⬜ pending |
| 09-03-T2 | 09-03 | 2 | ERR-01 | T-09-03-01, T-09-03-03 | Immutable updateItem; React-text-content auto-escape; StrictMode-safe timers | bun test + grep-gate | `bun run test -- src/photos/uploadQueue.test.ts && grep-checks on uploadQueue.ts + PhotoUploader.tsx` | ✅ (production files extended; uploadQueue.test extended) | ⬜ pending |
| 09-03-T3 | 09-03 | 2 | ERR-03 | T-09-03-04, T-09-03-06, T-09-03-08 | sessionStorage flag set BEFORE setStyle (no infinite-loop); constant attribution | bun test + grep-gate | `bun run test -- src/reel/MapCanvas.fallback.test.ts && grep-checks on MapCanvas.tsx + MapFallbackBanner.tsx` | ✅ (new files + existing extension) | ⬜ pending |
| 09-03-T4 | 09-03 | 2 | ERR-04 | T-09-03-03 | CONTEXT-locked copy; no dangerouslySetInnerHTML | bun test + grep-gate | `bun run test -- src/routes/AppReelRoute.test.tsx src/routes/TripsRoute.test.tsx && grep-checks on AppReelRoute.tsx + TripsRoute.tsx` | ✅ (new test files; existing routes edited) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> All four candidates below are addressed in-plan (no MISSING references remain). Wave 0 acts as a checklist that must be satisfied before Plan 09-02 / 09-03 acceptance:

- [x] **Hono `hono/request-id` middleware import smoke** — covered by `server/index.requestId.test.ts` (Plan 09-02 Task 1). Confirms Hono 4.12+ ships `hono/request-id`. Test fails fast if the import does not resolve.
- [x] **MapLibre `AJAXError` integration-test harness** — covered by `src/reel/MapCanvas.fallback.test.ts` (Plan 09-03 Task 3) which mocks `maplibre-gl` and stubs `AJAXError` with status/url. The mock factory mirrors the production import surface (per W7).
- [x] **`appleboy/ssh-action@v1` reference comment** — `.github/workflows/deploy.yml` (Plan 09-01 Task 1) carries the version pin in plain text; verified by `grep -q "appleboy/ssh-action@v1"`.
- [x] **OCIR auto-cleanup smoke** — Plan 09-01 Task 3 documents the rollback runbook AND the threat model (T-09-01-08 — operator should enable OCIR tag immutability). The operator's first deploy run is the smoke verification that no auto-cleanup policy strips old tags.

*If none: "Existing infrastructure covers all phase requirements."* — Not applicable here; Wave 0 items above are all in-plan.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Auth0 Action deployed + attached to Login flow | F9 (cross-phase) | Auth0 Dashboard interaction; no CLI mirror | Auth0 Dashboard → Actions → Library → `inject-email-into-access-token` → Deploy → Flows → Login → Add → Save. Verify by `decodeJwt` of an access token containing `https://timeline.bryanlam.dev/email`. |
| OCIR rollback path | DEPLOY-04 | Tests live system; ~5 min wall-clock per round-trip | `gh workflow run deploy.yml -f tag=v0.0.PRIOR` → confirm container restarts with prior image; curl `/api/health` returns 200; verify in OCIR that the prior tag SHA matches. |
| Cloud-init dhparam regen on next VM rebuild | F1.1 | dhparam regen only happens during cloud-init on a fresh boot | After Phase 9 lands: `terraform taint` the compute resource (or rebuild via console), confirm `/etc/letsencrypt/ssl-dhparams.pem` exists and `nginx -t` passes on first boot, no manual `certbot certonly --standalone` step required. |
| MapTiler 429 in production | ERR-03 | Cannot synthesize a real MapTiler 429 in CI | Manual: open `/app/reel` on a fresh session, throttle MapTiler URL via DevTools `Network → Block request URL`, verify amber banner appears + map continues rendering on OSM raster tiles. |
| ERR-01 retry on a flaky cellular connection | ERR-01 | Real network jitter > synthetic delay | Manual on iPhone over flaky LTE: upload 3 photos, force one transient drop, verify amber retry tile auto-recovers within 14s window. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s (quick) / 300s (full)
- [x] Manual-only items have step-by-step test instructions
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
