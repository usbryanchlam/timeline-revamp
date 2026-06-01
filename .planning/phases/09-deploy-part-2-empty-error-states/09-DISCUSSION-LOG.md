# Phase 9 — Discussion Log

**Date:** 2026-06-01
**Mode:** /gsd-discuss-phase (default, single-pass through 4 selected areas)

Human-reference audit log of the discuss-phase session. Decisions live in `09-CONTEXT.md`; this file records the questions asked and how they were answered.

## Areas selected

User multi-selected all 4 presented gray areas:
- CI/CD architecture
- Pre-CI infra cleanup
- Error state UX (ERR-01,03,04)
- Phase scope discipline

## Area 1 — Phase scope discipline

**Q:** Phase 9 has heavy scope. Which items stay IN-scope vs get deferred?
- Options: Defer ERR-02, Defer MeRoute v2, Defer F4 Instance Principal, Keep /app/trips empty-state polish
- **Selected (multi):** ALL FOUR. ERR-02 → Phase 10. MeRoute v2 → Phase 12. F4 → hardening backlog. /app/trips polish kept (treated as extension of ERR-04).

## Area 2 — CI/CD architecture

**Q1:** How should the CI pipeline be triggered?
- **Selected:** Tag-only deploy + main-push CI (Recommended).

**Q2:** What's the build artifact + registry?
- **Selected:** OCIR image, ARM64 only (Recommended).

**Q3:** How does the VM pull and run the new image?
- **Selected:** GHA SSH-in via `appleboy/ssh-action` (Recommended).

**Q4:** How does `db:migrate` run on deploy?
- **Selected:** Auto-run pre-up, with manual rollback escape hatch (Recommended).

**Q5:** Rollback strategy on bad deploy?
- **Selected:** Tag-pin rollback via re-deploy of prior tag (Recommended).

## Area 3 — Pre-CI infra cleanup

**Q1:** F1.1 nginx + certbot bootstrap chicken-egg — fix path?
- **Selected:** Pre-create cert/dhparam files in cloud-init (Recommended).

**Q2:** F9 server-side `users.email` empty — fix path?
- **Selected:** Auth0 Action injects email into access token custom claim (Recommended).

**Q3:** OIDC Identity Propagation Trust (Phase 8.1 deferred) — handle in Phase 9?
- **Selected:** Defer to its own micro-phase (Recommended). App CI uses OCIR auth token instead.

## Area 4 — Error state UX

**Q1:** ERR-01 photo upload failure UX?
- **Selected:** Inline tile with auto-retry + visible state + manual retry button (Recommended). Backoff [2s, 4s, 8s].

**Q2:** ERR-03 MapTiler rate-limit detection + fallback UX?
- **Selected:** Detect 429, swap to OSM raster, dismissible amber banner (Recommended).

**Q3:** ERR-04 onboarding + /app/trips empty-state design?
- **Selected:** Card with copy + amber CTA, no illustration (Recommended). DESIGN.md allows illustrations on `/app` but we skip for visual consistency with the public reel.

## Bonus — DEPLOY-06 error middleware

**Q:** DEPLOY-06 middleware shape?
- **Selected:** Catch-all + structured error response + stderr logging (Recommended). Request IDs propagated via `x-request-id`. No Sentry.

## Deferred items captured

See `09-CONTEXT.md` `<deferred>` table — ERR-02 (P10), MeRoute v2 (P12), F4 (hardening), OIDC trust (own micro-phase), multi-arch, blue/green, staging env, Sentry, instrumented iPhone FPS, motion tuning, `<ReelView />` shared extraction, cities.test.ts split.

## Claude's discretion (per CONTEXT.md)

- Exact `appleboy/ssh-action` version pin
- Whether to gate deploy job behind `environment: production` reviewer (default yes, mirror 8.1)
- Test/lint commands invoked in CI (researcher confirms what `package.json` exposes)
- Cloud-init dhparam bit size (2048 documented)
- Exact Auth0 Action JS snippet
- Retry-tile UI styling details below the card level

---

*Discussion log generated 2026-06-01 alongside CONTEXT.md.*
