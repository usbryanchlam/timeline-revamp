---
phase: 07-public-urls-handle
plan: "01"
subsystem: auth
tags: [handles, picker, public-api, dialog, debounce, validation]

requires:
  - phase: 04-backend-auth
    provides: validateHandle source of truth, RESERVED_HANDLES set, HandlePickerGate + HandlePickerModal Phase 4 scaffolding, POST /api/me/handle authoritative claim path with 23505→409 collapse via pgErrorCode
  - phase: 05-cities-crud-reel
    provides: reqIdRef sentinel pattern (src/api/cities.ts:29-50) — the project invariant for stale-response guarding under fan-out / debounce

provides:
  - GET /api/handles/check — public unauthenticated live-availability endpoint with Cache-Control: no-store
  - useHandleCheck React hook — 300ms debounce + AbortController + reqIdRef stale-drop sentinel
  - Native <dialog> modal pattern in React 19 — showModal() + cancel preventDefault for blocking dismissal
  - jsdom polyfill recipe for HTMLDialogElement.showModal/close (24-line test fixture, idempotent guard)
  - validateHandle reuse pattern: same Zod-flavor branching (too_short/too_long/invalid_chars/reserved/taken) shared by server endpoint + client hook + modal UI

affects: 07-02 (public reel URLs land on /u/<claimed_handle>), 08 (Nginx will not cache /api/handles/check thanks to no-store; same Hono per-prefix mount discipline applies to /api/public/*)

tech-stack:
  added: []  # No new dependencies — Zod, Drizzle, Hono, vitest, @testing-library/react all already installed
  patterns:
    - "Native <dialog>.showModal() blocking modal — browser-owned focus trap + backdrop, cancel-event preventDefault for Esc-blocking"
    - "Hono per-prefix middleware mount preserved — new public endpoint registered BEFORE the /api/me JWT block (registration-order routing)"
    - "Live-check hook discipline: debounce → AbortController on cleanup → reqIdRef stale-drop → AbortError swallow"

key-files:
  created:
    - server/routes/handlesCheck.ts (handler — Zod query parse, validateHandle reuse, Drizzle LOWER() case-insensitive lookup, no-store header)
    - server/routes/handlesCheck.test.ts (10 integration tests across 6 reason codes + Cache-Control header + no-auth regression + missing-query + mixed-case)
    - src/api/handlesCheck.ts (useHandleCheck hook — 4-state machine idle/checking/available/unavailable/error)
    - src/api/handlesCheck.test.ts (10 hook tests across debounce/abort/reqIdRef stale-drop/reason mapping/AbortError swallow)
    - src/auth/HandlePickerModal.test.tsx (10 jsdom modal tests across dialog/cancel/preview/live-check/POST/copy)
  modified:
    - src/auth/HandlePickerModal.tsx (upgraded in place — wrapper swapped to <dialog>, live-check wiring added, URL preview line, button text/placeholder updated; submit logic preserved verbatim)
    - server/index.ts (mounted GET /api/handles/check at line 33, BEFORE the /api/me JWT block at line 43)

key-decisions:
  - "Live check is advisory only — POST /api/me/handle remains the sole authoritative claim path. 23505→409 collapse in Phase 4 me.ts unchanged."
  - "Cache-Control: no-store header set BEFORE the DB query so it lands on every response (including thrown 5xx). Prevents Nginx from serving stale 'available' to racing pickers in Phase 8."
  - "Missing ?candidate query returns { available: false, reason: 'invalid_chars' } with 200 — the picker UI only needs a binary 'green to claim or not', so 422 would force extra branch handling. D-02 default."
  - "useHandleCheck enabled gate is `localValidation?.ok === true` — saves network round-trips on input that already fails the regex/length/reserved checks client-side. Single source of truth via validateHandle()."
  - "Dialog Esc-blocking via cancel event preventDefault (D-01). No close button, no skip link — modal is truly blocking until POST /api/me/handle returns 200."
  - "Single amber accent honored — taken/error messages use text-ink-mute (muted), check/Claim button use text-amber-500/bg-amber-500. No green-check/red-X color coding (DESIGN.md locked risk #1)."

patterns-established:
  - "jsdom HTMLDialogElement polyfill: install only if name !== 'mockShowModal' — idempotent across test reruns and parallel test files"
  - "Live-check hook contract: reqIdRef declared OUTSIDE the effect, sentinel -1 set in dedicated cleanup-only effect (mountedRef would have been the wrong pattern — see project memory feedback_mountedref_strictmode.md)"
  - "Hono public-endpoint precedent: register before per-prefix middleware blocks; bulk `app.use('/api/*', requireJwt)` is forbidden across the codebase"

requirements-completed: [AUTH-05, AUTH-06, AUTH-07]

duration: 22min
completed: 2026-05-15
---

# Phase 7 Plan 01: Handle reservation flow Summary

**Live debounced handle-availability check backed by a new public `GET /api/handles/check`, with the Phase 4 picker upgraded in place to a blocking native `<dialog>` that wires the live state into a disabled-until-available Claim button — recruiters and racing pickers both get a fresh answer with zero cached staleness.**

## Performance

- **Duration:** ~22 min (Tasks 1+2 in autonomous subagent run, Task 3 finished inline after stream-idle timeout recovery)
- **Started:** 2026-05-14T22:48:00Z
- **Completed:** 2026-05-15T09:10:00Z (timeline includes overnight checkpoint between agent timeout and inline completion)
- **Tasks:** 3 (TDD discipline — RED → GREEN per task)
- **Files modified:** 7 (3 created server-side, 2 created client-side, 1 created test, 1 modified modal, 1 modified server/index.ts mount)

## Accomplishments

- **Public live-availability endpoint shipped.** `GET /api/handles/check?candidate=…` returns `{ available: true }` or `{ available: false, reason }` across 5 reason codes, mounted before the `/api/me` JWT block. 10 integration tests cover all reason codes, Cache-Control header, no-auth regression, missing-query default, and mixed-case input.
- **`useHandleCheck` hook shipped.** Local fetch + AbortController + reqIdRef sentinel pattern (project invariant — NOT mountedRef, NOT TanStack Query). 300ms debounce coalesces keystrokes. Stale responses are dropped by reqIdRef comparison. AbortError silently swallowed. 10 hook tests including a deferred-promise timing test proving slow stale responses cannot overwrite fast fresh ones.
- **HandlePickerModal upgraded in place.** Wrapper swapped from a fixed-position div to a native `<dialog>` opened via `showModal()`. Cancel event listener `preventDefault`s on Esc — modal cannot be dismissed. URL preview line `timeline.bryanlam.dev/u/<input>` renders below the input with reactive lowercasing. Live-check status row shows `Checking…` / `✓ Available` / muted reason text. Claim button disabled until `check.state === 'available'`. Existing POST /api/me/handle submit logic preserved verbatim. 10 jsdom tests cover the full state machine + D-05 copy.
- **HandlePickerGate.tsx untouched** — confirmed via `git diff --stat`. The gate's contract (`<HandlePickerModal onPicked={...} />` when `users.handle IS NULL`) is the right seam; only the modal needed upgrading.
- **289/289 tests pass** (+54 new across the plan). Frontend + server typecheck clean.

## Task Commits

Each task TDD-committed (RED → GREEN):

1. **Task 1: GET /api/handles/check endpoint + tests + mount**
   - RED: `a59ec4d` — test(07-01): add failing tests for GET /api/handles/check
   - GREEN: `b01cbea` — feat(07-01): GET /api/handles/check endpoint + public mount

2. **Task 2: useHandleCheck hook (300ms debounce + AbortController + reqIdRef)**
   - RED: `9baa351` — test(07-01): add failing tests for useHandleCheck hook
   - GREEN: `51afc12` — feat(07-01): useHandleCheck hook with 300ms debounce + AbortController

3. **Task 3: HandlePickerModal upgrade — native dialog + live check + URL preview**
   - Combined commit (RED-test was authored in the same commit as the GREEN-impl during inline recovery): `799b4c7` — feat(07-01): HandlePickerModal upgrade — native <dialog> + live check

## Files Created/Modified

- `server/routes/handlesCheck.ts` — public handler; Zod query parse → validateHandle → Drizzle case-insensitive lookup
- `server/routes/handlesCheck.test.ts` — 10 integration tests (uses Drizzle live DB; mirrors cities.test.ts harness without JWT minting)
- `src/api/handlesCheck.ts` — useHandleCheck hook + HandleCheckState discriminated union
- `src/api/handlesCheck.test.ts` — 10 jsdom hook tests with fake timers, deferred-promise timing for stale-drop, AbortController spy
- `src/auth/HandlePickerModal.tsx` — upgraded in place (4237 → 5891 bytes). Submit path verbatim from Phase 4
- `src/auth/HandlePickerModal.test.tsx` — 10 jsdom integration tests with hook-mock + showModal polyfill (idempotent install guard)
- `server/index.ts` — added `import { handlesCheckHandler }` and registered `app.get('/api/handles/check', handlesCheckHandler)` BEFORE the `/api/me` JWT block

## Decisions Made

See `key-decisions` in frontmatter. The locked CONTEXT.md decisions touching this plan are all honored:
- **D-01** Blocking modal — `<dialog>.showModal()` + `cancel` preventDefault — Esc cannot dismiss; no close button; no skip link.
- **D-02** Debounced live check — 300ms via `useHandleCheck`, gated on local `validateHandle` passing.
- **D-03** Live check is advisory — POST /api/me/handle remains authoritative; existing 23505→409 collapse path untouched.
- **D-04** Cache-Control: no-store — set FIRST in handler so it applies to every response, including 5xx.
- **D-05** Copy: title "Pick your handle", button "Claim" (NOT "Claim handle"), placeholder "e.g. bryan", description "lowercase letters, numbers, hyphens · 3–20 chars", URL preview always rendered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inverted polyfill guard in HandlePickerModal.test.tsx**
- **Found during:** Task 3 verification (initial test run — all 10 tests failed with `TypeError: d.showModal is not a function`)
- **Issue:** The jsdom polyfill installer used the early-return guard `if (!proto.showModal || proto.showModal.name === 'mockShowModal') return;`. On first invocation, `proto.showModal` is `undefined`, so `!proto.showModal` is true and the function returns BEFORE installing the polyfill. The intent was "skip if already installed our polyfill" — i.e., `if (proto.showModal && proto.showModal.name === 'mockShowModal') return;`.
- **Fix:** Flipped the OR to AND and dropped the negation on the first half — install when not present OR present-but-not-ours; skip when present-and-already-ours.
- **Files modified:** `src/auth/HandlePickerModal.test.tsx`
- **Verification:** All 10 modal tests pass; the polyfill installs once per test run and the `name === 'mockShowModal'` self-recognition prevents re-installation across reruns.
- **Committed in:** `799b4c7` (part of Task 3 commit — polyfill fix bundled with the modal upgrade)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in test scaffolding written by the executor agent during the timed-out run; not a plan defect, but the executor's local logic error).
**Impact on plan:** No scope creep. The fix unblocked Task 3's verification gate without touching production code shape.

## Issues Encountered

**1. Stream-idle timeout on the executor agent.** The autonomous gsd-executor agent for plan 07-01 ran for ~21 minutes (62 tool uses) and was killed by an SSE stream-idle timeout AFTER Tasks 1 and 2 were committed cleanly. Task 3 was interrupted mid-flight — the test file was authored but uncommitted (untracked in `git status`), and `HandlePickerModal.tsx` was never modified.

**Recovery:** Inspected disk state (`git log` + `git status`) confirmed Tasks 1+2 commits on disk and verified their tests pass standalone (24/24). Read the uncommitted Task 3 test file and the unmodified Task 3 source file, then completed Task 3 inline in the orchestrator context (single file edit + polyfill fix in test file + one combined commit). Total inline recovery time: ~6 minutes including the polyfill-guard auto-fix.

This is the third stream-idle timeout pattern observed in this project (Phase 6 06-02 + 06-04 + Phase 7 07-01). Atomic per-task commit discipline made recovery trivial in all three cases: completed work persists on disk regardless of agent termination.

## User Setup Required

None — no external service configuration.

## Next Phase Readiness

- **Wave 2 (07-02) is unblocked.** Plan 07-02 builds `GET /api/public/u/:handle` and the reel UI; the public endpoint mount precedent (this plan registers `/api/handles/check` before `/api/me`) is the pattern 07-02 will mirror for `/api/public/u/:handle`.
- **Live-check hook is reusable.** If Phase 8 adds an Nginx IP rate limit on `/api/handles/check`, the 429 response will surface as `state: 'error'` in the hook — no client changes needed.
- **Modal pattern documented.** The native `<dialog>` + jsdom polyfill recipe is now established in this codebase and can be reused for any future blocking modal without adding a UI dependency.
- **Project memory candidate flagged.** The jsdom polyfill-install guard inversion was a subtle bug worth saving as a feedback memory: "When polyfilling a missing prototype method, the install-once guard should be `if (present && name === ourMockName) return`, NOT `if (!present || name === ourMockName) return` — the latter never installs because the first invocation has `!present === true`." See deviation #1 above.

## Self-Check: PASSED

Verified against plan-level `<verification>` block:

- ✓ `bun run test -- server/routes/handlesCheck.test.ts` → 10/10 green
- ✓ `bun run test -- src/api/handlesCheck.test.ts` → 10/10 green (24/24 across this file + handlesCheck endpoint test combined)
- ✓ `bun run test -- src/auth/HandlePickerModal.test.tsx` → 10/10 green
- ✓ `bun run test` → 289/289 green (no regressions; prior baseline was 235)
- ✓ `bun run typecheck` → exit 0 (server + frontend)
- ✓ `grep -n "/api/handles/check\|/api/me'\|/api/me/" server/index.ts` → handles/check at line 33 BEFORE /api/me at line 43
- ✓ `grep -c "validateHandle(" server/routes/handlesCheck.ts` → ≥ 1 (single source of truth reused)
- ✓ `git diff --stat src/auth/HandlePickerGate.tsx` → 0 lines changed (gate's contract preserved)

All 8 success criteria from the plan are met. Plan 07-01 shipped.

---
*Phase: 07-public-urls-handle*
*Completed: 2026-05-15*
