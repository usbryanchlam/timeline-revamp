# Codebase Concerns

**Analysis Date:** 2026-06-19

**Phase context:** Phase 9 complete + live-verified (v0.2.4 deployed via tag-driven GHA CI/CD to OCI Ampere A1 VM). iPhone UAT round just closed (5 patch releases). Phase 10 (MP4) on hold; Phase 11 (mobile polish + a11y audit branch) is next.

## Severity Index

- 🔴 **High** — affects launch readiness, security, or live correctness
- 🟡 **Medium** — fragile area, future-work hazard, or untested invariant
- 🟢 **Low** — hygiene, dead code, minor refactor

---

## 🔴 Deploy & Operations

**VM file-system drift (load-bearing, fragile).** The deploy workflow now scp's `docker-compose.yml` + `docker-compose.prod.yml` to `/opt/timeline-revamp/` on every tag deploy (fixed UAT v0.2.1 after v0.1.0 + v0.2.0 silently deployed nothing). However, **other manually-installed files on the VM are still NOT synced by the workflow**:
- `/opt/timeline-revamp/.env` (production secrets — set once, never auto-synced)
- `/opt/timeline-revamp/ops/nginx/timeline.conf` (Phase 8 nginx config — also set once on the VM)
- `/opt/timeline-revamp/.oci/timeline-revamp.pem` (OCI private key)
- `infra/cloud-init.yaml` is repo-only and never re-applied unless the VM is re-tainted

**Risk:** if any of these need updating, the deploy will silently use the stale version. There's no drift detection. Suggested guardrail: a `scripts/verify-vm-files.sh` that diffs critical VM files against repo expectations, run as a smoke step.

**OCI `.oci/` dir perms hotfix not codified.** UAT v0.2.3 surfaced and fixed (manually, via SSH) `chmod 711 /opt/timeline-revamp/.oci/` — the container's `app` user (uid 1001) couldn't traverse the dir (owned by uid 1000 `ubuntu`, mode 700) to open its own PEM. The fix is NOT in `infra/DEPLOY.md`, NOT in `infra/cloud-init.yaml`, NOT in Terraform. A fresh VM provision would replay the same EACCES bug. Action: add to DEPLOY.md Post-Provision SCP block; mention in cloud-init.yaml.

**OCIR_AUTH_TOKEN rotation cadence undocumented.** Stored in GHA secrets; no policy on when/how to rotate. OCIR auth tokens expire per Oracle's policy.

## 🔴 Security

**OCI PEM mounted into container (Phase 8 F8 follow-up, deferred).** `server/oci/parClient.ts` reads `OCI_PRIVATE_KEY_PATH` at startup (currently `/app/.oci/timeline-revamp.pem`). Mounting a private key into a container is a known anti-pattern. **Instance Principal auth** (OCI VM identity) would eliminate the PEM-in-container risk entirely. Deferred from Phase 8 — still open.

**Bucket access_type=ObjectRead (Phase 8 F5 Path B follow-up, deferred).** Photos are addressable by direct URL once you know the UUID-named object name (128 bits of unguessability). No listing protection, but a UUID-leak (e.g. via referer header in a logged outbound request) would permanently expose that photo. **Path B** mints short-TTL read PARs server-side per request — Phase 11+/Phase 12 hardening candidate.

## 🟡 Test & Quality Debt

**`server/routes/cities.test.ts` is 945 lines** (past the project's ~800-line soft ceiling). Natural splits documented in STATE.md:
- `cities.read.test.ts` — GET tests
- `cities.write.test.ts` — POST/PATCH/DELETE tests
- `cities.reorder.test.ts` — PATCH /reorder + DEFERRABLE constraint test
- `cities.test.helpers.ts` — shared fixtures (the largest savings)

**`PATCH /api/cities/reorder` pre-flight check is OUTSIDE the transaction.** The ownership + completeness check runs before `db.transaction(...)` opens. Narrow TOCTOU window: a concurrent `DELETE /api/cities/:id` between the pre-flight check and the transaction commit could leave a gap in the `0..n-1` `order_index` sequence. Fix: move the check inside the txn at the cost of holding the row-locks longer. Acceptable for v1; revisit if concurrency profile changes.

**`PATCH /api/cities/:id` strictly-advances `updatedAt` test uses a 50ms sleep** for determinism. Replace with a backdated seed (`updatedAt = Date.now() - 1000` at fixture insert) for full determinism. Hygiene.

## 🟡 Frontend Architecture Smells

**Reel rendering branches are NOT shared via a `<ReelView />` abstraction.** `PublicReelRoute`, `HandleReelRoute`, and `AppReelRoute` each independently:
- Call `usePrefersReducedMotion()`
- Decide whether to render `Reel` / `ReducedMotionReel` / `OrbitReel` / `OrbitReducedMotionReel` / `GlobeReel` / `GlobeReducedMotionReel`
- Pass chapters (seeded vs. fetched)

Triple-implementation; any new reel-selection rule must touch all three. Suggested refactor: `<ReelView chapters={...}>` that owns the branching.

**`SEEDED_CITIES` array length is implicit.** `src/data/seeded-cities.ts` exports 9 cities (UAT v0.2.0). Some components historically assumed `>= 1`; explicit length docs would help. Mostly under control; flag for awareness.

**`SCRUB_TOTAL_CHAPTERS = 10` in `src/gestures/stateMachine.ts:51`** is a dead constant — no consumer reads it. Remove or wire it to `SEEDED_CITIES.length` for honesty.

**`MapPicker.tsx mapReadyTick` side-effect counter** (Phase 5 carry-over). Increments to retrigger marker-sync effect after init. Replace with `useState(map)` so React re-renders on init naturally. Cosmetic; works correctly today.

**`MapPicker.tsx` marker tear-down + recreate on every prop change.** No keyed diff. Acceptable for current ≤9 cities; revisit at 100+ cities (Phase 5 code review I-4).

**`formatArrived` duplicated** in `src/components/CityList.tsx` + `src/reel/ChapterOverlay.tsx`. Extract to `src/utils/formatDate.ts`. Hygiene.

## 🟡 Auth & Public-Surface Coupling

**`/app?signup=1` query-param signal is fragile.** UAT v0.2.2 wired the "Make your own" CTA to `/app?signup=1`, which `RequireAuth` reads to pass `screen_hint: 'signup'` to Auth0. The contract is: public CTA href ↔ `RequireAuth` `URLSearchParams.has('signup')`. If anything else navigates to `/app?signup=1` (e.g., a typo in another CTA, a bookmark), the user gets the signup screen instead of login. **Not a security issue** (Auth0 still validates the user), but a usability footgun. Suggested: rename the param to something less generic, e.g. `?hint=signup`, and document in `AuthProvider.tsx` JSDoc.

**`AUTH-04 grep-enforced public-surface seam** is enforced by code-search not type-checking. A future contributor importing `@auth0/auth0-react` from a public route would compile and run; the grep test catches it. Acceptable but consider augmenting with an ESLint rule (`no-restricted-imports` with `paths: [{ name: '@auth0/auth0-react', message: ... }]` filtered by file pattern).

## 🟢 Bundle & Performance

**No Lighthouse mobile audit since Phase 2.** Targets: LCP element identified, perf ≥ 90, CLS ≤ 0.1. Phase 11 scope.

**`framer-motion` is in the main bundle**, not its own chunk. Phase 2 deferred this as "optional unless Lighthouse flags it." Phase 11 will check.

**`@auth0/auth0-react` chunk gating verification.** AUTH-04 says the auth0 chunk loads only on `/app/*`. Build the prod bundle and grep `dist/assets/index-*.js` for `loginWithRedirect` — should be ABSENT (it should live only in the `@auth0_auth0-react`-prefixed chunk). Drift check.

**`maplibre-gl` is in its own chunk** (`vite.config.ts` `manualChunks: { maplibre: ['maplibre-gl'] }`) — verified Phase 2, ~283 KB gzip. The chunk loads after LCP via React.lazy on `MapCanvas`.

## 🟢 Accessibility

**No formal a11y audit has been run.** Phase 11 scope. Specific items:
- Keyboard-nav coverage across `/app/*` (Trips reorder dnd-kit handles, CityForm, PhotoUploader).
- Focus management: `HandlePickerModal`, `PhotoDetailSheet`, `PhotoViewer` (focus trap + restore).
- Screen-reader announcement coverage. `Reel.tsx` has an `aria-live="polite"` region announcing chapter changes; broader sweep for trip CRUD + photo upload status needed.
- `PlayPauseIndicator` (UAT v0.2.0): `role="status"` + `aria-label="Reel paused"` on the persistent layer; transient toggle layer is `aria-hidden`. Reconfirm whether the persistent layer should also be visible to screen readers.
- ARIA-label correctness on drag handles (`<button aria-label="Reorder">` in CityList).

## 🟢 Mobile-UAT Deferred Items

**Instrumented iPhone Web Inspector FPS measurement** for `OrbitReel` 60°/s orbit (Phase 7 HUMAN-UAT item #1). Visual pass was achieved during Phase 8 deploy smoke; the instrumented measurement (USB-tether + Web Inspector → Rendering → Frame Rendering Stats) was deferred to "Phase 12 polish." Better fit for Phase 11 (mobile polish + a11y branch) given the focus.

## 🟢 Documentation & Doc-Code Drift

**Phase 4 callback URL whitelist guide drift.** Plan 04-02 instructed the operator to whitelist `http://localhost:5173` as Allowed Callback URL in Auth0, but the SDK code at `src/auth/AuthProvider.tsx:29` sends `${origin}/app`. User had to extend the dashboard whitelist after first run. Patch: either fix `AuthProvider.tsx` to use origin-only or update the plan/SUMMARY. Doc-only fix.

**`infra/cloud-init.yaml` has 4 known bugs (Phase 8 F1)** that only matter if a fresh VM is re-tainted + re-applied via Terraform. Rare path; documented in Phase 8 03-SUMMARY. Suggested fold-in to Phase 8.1.1 if/when it lands.

## 🟢 Dead Code & Imports

**`SCRUB_TOTAL_CHAPTERS`** in `src/gestures/stateMachine.ts:51` — exported, unread. Remove or wire to `SEEDED_CITIES.length`.

**`tsx` in `devDependencies`** is no longer used by `db:migrate` (UAT phase 8 swapped to `bun run`). May still be used by `scripts/dev.ts`; audit before removing.

## 🟢 Test Hygiene Targets

**Extract `cities.test.helpers.ts`** to drive `cities.test.ts` under the 800-line ceiling.

**Make the OCI `.oci/` PEM perms a unit-testable invariant** somewhere — currently it's a manual deploy concern. Suggested: `infra/DEPLOY.md` Post-Provision section with copy-pasteable verification command.

---

## Quick-Reference: Open Phase Follow-Ups (cross-ref to phase SUMMARYs)

| Source | Item | Severity |
|---|---|---|
| Phase 8 F1 | 4 cloud-init bugs (rare path) | 🟢 |
| Phase 8 F1 | Document UID-1001 + dir-perm step in DEPLOY.md | 🔴 (silent recurrence risk) |
| Phase 8 F5 Path B | Mint read PARs vs ObjectRead bucket | 🔴 (security hardening) |
| Phase 8 F8 | HandlePickerModal Claim button starts dimmed — pre-fill suggestion | 🟢 (Phase 11) |
| Phase 8 F8 | parClient.ts → Instance Principal auth | 🔴 (eliminates PEM mount) |
| Phase 5 housekeeping | Split `cities.test.ts` (945 lines) | 🟡 |
| Phase 5 housekeeping | Reorder pre-flight inside txn | 🟡 |
| Phase 5 housekeeping | `mapReadyTick` → `useState(map)` | 🟢 |
| Phase 5 housekeeping | Marker `Map<cityId, Marker>` diff (defer to 100+ cities) | 🟢 |
| Phase 5 housekeeping | Extract `formatArrived` to `src/utils/` | 🟢 |
| Phase 5 housekeeping | Deterministic `updatedAt` seed | 🟢 |

These flow into Phase 11/12 planning as input.
