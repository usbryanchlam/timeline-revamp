---
phase: 9
slug: deploy-part-2-empty-error-states
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| **Quick run command** | `bun run typecheck && bun run lint` |
| **Full suite command** | `bun test && bun run build` |
| **Estimated runtime** | ~60–120 seconds (quick), ~3–5 min (full) |

---

## Sampling Rate

- **After every task commit:** Run `bun run typecheck && bun run lint`
- **After every plan wave:** Run `bun test && bun run build`
- **Before `/gsd-verify-work`:** Full suite must be green AND deploy-job dry-run on a non-prod tag must complete to OCIR push
- **Max feedback latency:** 120 seconds (quick), 300 seconds (full)

---

## Per-Task Verification Map

> Populated by gsd-planner. Each plan/task lands here with `Automated Command` + `File Exists` columns derived from `<acceptance_criteria>`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Populated by gsd-planner. Phase 9 candidates:
> - Hono `hono/request-id` middleware import smoke (confirm Hono 4.12+ ships it)
> - MapLibre `AJAXError` integration-test harness (`map.on('error', ...)` fixture that blocks MapTiler URL and asserts `AJAXError.status === 429` fires on 5.24.0 — flagged A2)
> - `appleboy/ssh-action@v1` env-passing reference workflow comment in `.github/workflows/deploy.yml`
> - `oci artifacts container repository get` smoke (confirm OCIR has no auto-cleanup rule within rollback window)

- [ ] TBD — finalized after planner output

*If none: "Existing infrastructure covers all phase requirements."*

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s (quick) / 300s (full)
- [ ] Manual-only items have step-by-step test instructions
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
