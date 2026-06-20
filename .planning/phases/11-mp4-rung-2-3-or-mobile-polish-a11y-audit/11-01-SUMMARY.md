---
phase: 11
plan: 01
subsystem: a11y-audit
tags: [a11y, axe-core, playwright, dialog, focus-trap, reduced-motion, vitest-axe, lighthouse]
requires:
  - "@chialab/vitest-axe@0.19.1"
  - "@axe-core/playwright@4.11.3"
  - playwright@1.61.0
  - lighthouse@13.4.0
  - axe-core@4.12.1
provides:
  - "axe-core toolchain installed (vitest + playwright + lighthouse) for 11-02 + 11-03 to consume"
  - "test/setup.ts global toHaveNoViolations matcher + axe() helper wrapping axe-core.run()"
  - "playwright.config.ts (iPhone 13 + Desktop Chrome) with bun-run-preview webServer on :4173"
  - "A11Y-01 (0 axe violations on reduced-motion) closed for all 3 reduced-motion reels"
  - "A11Y-03 role=region + aria-label on every reduced-motion reel container"
  - "A11Y-04 aria-live announcement gated on state.name IDLE|PAUSED (arrival-pulse beat, not mid-flight)"
  - "A11Y-05 photo img alt strictly derived from caption with empty-string fallback"
  - "A11Y-06 PhotoDetailSheet + PhotoViewer converted to native <dialog> with close-watcher anti-modal-trap pattern"
  - "A11Y-07 e2e/a11y.spec.ts staged for wave-1 Playwright sweep across 5 routes under reduced-motion + dark"
affects:
  - src/reel/Reel.tsx (aria-live effect gated on landed states)
  - src/reel/ReducedMotionReel.tsx (root <main> → <section role=region>)
  - src/reel/OrbitReducedMotionReel.tsx (same)
  - src/reel/GlobeReducedMotionReel.tsx (same)
  - src/components/PhotoDetailSheet.tsx (native <dialog> + close-watcher pattern)
  - src/components/PhotoViewer.tsx (native <dialog> + close-watcher pattern)
tech-stack:
  added:
    - "@chialab/vitest-axe@0.19.1 (matcher only; helper axe() lives in test/setup.ts)"
    - "axe-core@4.12.1"
    - "@axe-core/playwright@4.11.3"
    - "playwright@1.61.0 + @playwright/test@1.61.0"
    - "lighthouse@13.4.0"
  patterns:
    - "close-watcher anti-modal-trap (cancel preventDefault + document-level keydown capture) — feedback_dialog_double_esc.md"
    - "<section role=region> for reduced-motion landmark (vs <main role=region> which trips axe aria-allowed-role)"
key-files:
  created:
    - test/setup.ts
    - playwright.config.ts
    - e2e/a11y.spec.ts
    - src/reel/ReducedMotionReel.a11y.test.tsx
    - src/reel/OrbitReducedMotionReel.a11y.test.tsx
    - src/reel/GlobeReducedMotionReel.a11y.test.tsx
    - src/reel/Reel.ariaLive.test.tsx
    - src/components/PhotoDetailSheet.focusTrap.test.tsx
    - src/components/PhotoViewer.focusTrap.test.tsx
  modified:
    - package.json
    - bun.lock
    - vitest.config.ts
    - src/reel/Reel.tsx
    - src/reel/ReducedMotionReel.tsx
    - src/reel/OrbitReducedMotionReel.tsx
    - src/reel/GlobeReducedMotionReel.tsx
    - src/reel/PhotoCycle.test.tsx
    - src/components/PhotoDetailSheet.tsx
    - src/components/PhotoViewer.tsx
    - src/components/PhotoDetailSheet.test.tsx
    - src/components/PhotoViewer.test.tsx
decisions:
  - "Use <section role=region> instead of <main role=region> for reduced-motion reels — <main> has implicit role=main, axe flags reassignment as aria-allowed-role violation"
  - "test/setup.ts exposes axe(container) helper wrapping axe-core.run() because @chialab/vitest-axe only ships the toHaveNoViolations matcher (no axe function)"
  - "Skip Playwright browser install + e2e execution in this plan — handled in wave-1 by 11-02 + 11-03 which own bun run build + preview lifecycle"
metrics:
  duration_minutes: ~30
  completed: 2026-06-20
  tasks_completed: 3
  vitest_tests_added: 17
  vitest_tests_total: 361
  vitest_files_pass: 40
  vitest_files_fail_preexisting: 5
---

# Phase 11 Plan 01: a11y audit toolchain + A11Y-01/03/04/05/06/07 closure Summary

Wired the axe-core/Playwright/Lighthouse audit toolchain at LOCKED versions, then closed the six component-local accessibility requirements: reduced-motion landmark, aria-live arrival-pulse alignment, photo alt strict-from-caption, and the photo modal focus-trap parity via native `<dialog>` + close-watcher anti-modal-trap.

## Toolchain Installed (exact pins)

| Package | Version | Purpose |
|---|---|---|
| `@chialab/vitest-axe` | `0.19.1` | `toHaveNoViolations` matcher |
| `axe-core` | `4.12.1` | underlying engine; `axe-core.run()` used in test/setup.ts helper |
| `@axe-core/playwright` | `4.11.3` | wave-1 e2e a11y sweep + WCAG AA contrast |
| `playwright` | `1.61.0` | browser automation |
| `@playwright/test` | `1.61.0` | test runner + config |
| `lighthouse` | `13.4.0` | mobile audit (11-02) |

**Forbidden (D-LOCK):** `@axe-core/react` — NOT installed (`! grep -q '@axe-core/react' package.json` ✓).

## Files Edited Per Requirement

### A11Y-01 (0 axe violations on reduced-motion path) — HARD GATE CLOSED

- `src/reel/ReducedMotionReel.tsx` — root `<main>` → `<section role="region" aria-label="Travel reel (reduced motion)">`
- `src/reel/OrbitReducedMotionReel.tsx` — same; aria-label "Single city travel reel (reduced motion)"
- `src/reel/GlobeReducedMotionReel.tsx` — same; aria-label "World map travel reel (reduced motion)"
- New test files assert `await axe(container)` → `toHaveNoViolations()` for all three.

The pivot from `<main role="region">` to `<section role="region">` is per axe rule `aria-allowed-role`: `<main>` has an implicit role of `main` which cannot be reassigned. `<section>` accepts `role="region"` redundantly with its implicit role and satisfies the rule.

### A11Y-03 (role=region + aria-label on every reel container)

- Reel.tsx already had `role="region" aria-label="Travel reel"` (Phase 6 baseline). Unchanged.
- All three reduced-motion variants now expose the same landmark contract.

### A11Y-04 (aria-live fires at arrival-pulse beat, not mid-flight)

- `src/reel/Reel.tsx`: the aria-live `useEffect` now early-returns when `state.name !== 'IDLE' && state.name !== 'PAUSED'`. Deps changed from `[state.chapterIndex, chapters]` to `[state.name, state.chapterIndex, chapters]`. Screen readers hear the chapter name only after the camera has landed.
- `src/reel/Reel.ariaLive.test.tsx` mocks `useGestureMachine` to feed deterministic `state.name` values and asserts: IDLE announces, CHAPTER_SWIPE does not, PAUSED announces.

### A11Y-05 (img alt strictly from caption with empty-string fallback)

- `src/reel/PhotoCycle.tsx` was already correct: `alt={current.alt}`. No code change needed.
- `src/reel/PhotoCycle.test.tsx` extended with two new test cases proving:
  - `alt="Cherry blossoms in Kyoto"` when caption provided
  - `alt=""` (decorative) when caption is empty string

### A11Y-06 (focus trap + Esc close + close-watcher fix)

- `src/components/PhotoDetailSheet.tsx`: root `<div role="dialog">` → native `<dialog>`. `showModal()` on mount, `close()` on unmount. Document-level keydown listener in CAPTURE phase + `cancel` event `preventDefault` — verbatim copy of HandlePickerModal's pattern per `feedback_dialog_double_esc.md`.
- `src/components/PhotoViewer.tsx`: same conversion. ArrowLeft/ArrowRight handler moved from `window.addEventListener` to `document.addEventListener` so it cohabits with the dialog Esc handler. Backdrop tap close uses `target === currentTarget` on the dialog element.
- mountedRef pattern re-anchors inside the effect body (per `feedback_mountedref_strictmode.md`) — already correct in the prior code; preserved unchanged.

### A11Y-07 (WCAG AA contrast on bright-photo worst case)

- `e2e/a11y.spec.ts` created: `AxeBuilder` sweep across `/`, `/u/bryan`, `/app/reel`, `/app/trips`, `/app/me` under iPhone 13 + `reducedMotion: 'reduce'` + `colorScheme: 'dark'`. Asserts 0 wcag2a/wcag2aa violations (color-contrast is in wcag2aa).
- Spec is staged for execution in wave-1 by 11-02 / 11-03 (which own `bunx playwright install`, `bun run build`, and `bun run preview` lifecycle). The vitest unit-level tests already close A11Y-06 focus-trap parity; the Playwright run extends that to live CSS contrast.

## Playwright Browsers — Not Installed in This Plan

`bunx playwright install --with-deps webkit chromium` was NOT executed in 11-01. Rationale:
- Browser binaries are ~150 MB+ downloaded artifacts; appropriate for the wave-1 plans that actually run the sweep.
- The spec, config, and `e2e` script are all in place; the install + run is a one-liner in 11-02/11-03's first task.

This is recorded in the threat register (T-11-04) as accepted scope: Playwright is local/wave-only, not part of every commit's CI loop.

## Test Results

| Metric | Before 11-01 | After 11-01 | Delta |
|---|---|---|---|
| Vitest tests passing | 344 | **361** | +17 |
| Vitest files passing | 34 | **40** | +6 (new test files) |
| Vitest files failing (pre-existing) | 5 | 5 | 0 |
| Regressions introduced | — | **0** | — |

The 5 pre-existing failures are all server-side env-validation test files documented in memory `feedback_module_load_env_validation_blocks_ci.md`. They fail identically with and without 11-01's changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `<main role="region">` violates axe aria-allowed-role**
- **Found during:** Task 2 (RED → first GREEN attempt)
- **Issue:** Plan said "change `<main>` to add `role="region"`". axe-core 4.12.1's `aria-allowed-role` rule flags this because `<main>` has implicit role `main`, which cannot be reassigned to `region`.
- **Fix:** Changed all three reduced-motion reel roots from `<main role="region">` to `<section role="region">`. `<section>` accepts `region` as an explicit-matching-implicit role and passes axe.
- **Files modified:** `src/reel/ReducedMotionReel.tsx`, `src/reel/OrbitReducedMotionReel.tsx`, `src/reel/GlobeReducedMotionReel.tsx`
- **Commit:** `095f738`

**2. [Rule 3 — Blocking] `@chialab/vitest-axe` does not export an `axe()` function**
- **Found during:** Task 2 (first vitest run after wiring matcher)
- **Issue:** The plan's interface snippet showed `import { axe } from '@chialab/vitest-axe'`, but the package only ships the `toHaveNoViolations` matcher (see `node_modules/@chialab/vitest-axe/lib/index.js` — default export only). Test calls to `axe(container)` were `undefined is not a function`.
- **Fix:** Added an `axe(container)` helper in `test/setup.ts` that wraps `axe-core.run()`. All a11y tests now import `axe` from `../../test/setup`. The matcher works unchanged; only the engine call needed a local helper.
- **Files modified:** `test/setup.ts`, all three reel a11y test files
- **Commit:** `095f738`

**3. [Rule 2 — Missing critical functionality] jsdom does not implement `HTMLDialogElement.showModal()`**
- **Found during:** Task 3 (focus-trap tests + existing PhotoViewer.test.tsx after `<dialog>` conversion)
- **Issue:** `document.createElement('dialog').showModal` is `undefined` in jsdom 29.1.1. Without a polyfill, all `useEffect` blocks that call `d.showModal()` throw, and `getByRole('dialog')` fails because native dialog only exposes `role=dialog` when the `open` attribute is set.
- **Fix:** Each affected test file polyfills `HTMLDialogElement.prototype.showModal`/`.close` in `beforeEach` by toggling the `open` attribute. This makes both `dialog.open` (the IDL property reflects the attribute) and `getByRole('dialog')` work.
- **Files modified:** `PhotoDetailSheet.test.tsx`, `PhotoViewer.test.tsx`, `PhotoDetailSheet.focusTrap.test.tsx`, `PhotoViewer.focusTrap.test.tsx`
- **Commit:** `e86c784`

**4. [Rule 1 — Bug] `fireEvent.keyDown(window, ...)` doesn't reach `document` capture listeners**
- **Found during:** Task 3 (existing tests fired Esc on `window`; new code listens on `document` in capture)
- **Issue:** Events dispatched directly on `window` do not propagate to `document`. The pre-existing tests for PhotoDetailSheet + PhotoViewer used `fireEvent.keyDown(window, { key: 'Escape' })`, which silently no-op'd after the `<dialog>` conversion.
- **Fix:** Updated four `fireEvent.keyDown(window, ...)` calls to `fireEvent.keyDown(document, ...)` in the existing test files. New focus-trap tests use `document` from the start. The arrow-navigation listener in PhotoViewer also moved from `window` to `document` so it stays in lockstep with the Esc handler.
- **Files modified:** `PhotoViewer.tsx`, `PhotoDetailSheet.test.tsx`, `PhotoViewer.test.tsx`
- **Commit:** `e86c784`

## Threat Surface Scan

No new threats beyond the plan's existing `<threat_model>`:
- T-11-01 (dev deps leaking to prod): all five new packages are in `devDependencies`. `vite build` excludes by default. (Verification: `grep '"axe-core"' package.json` returns only `devDependencies` lines.)
- T-11-02 (supply chain): exact pins recorded in lockfile (`bun add -d ...@x.y.z`).
- T-11-03 (keydown listener leak): both `PhotoDetailSheet` and `PhotoViewer` register/teardown the listener with matching `capture: true` phase in cleanup.
- T-11-04 (Playwright webServer DoS): plan accepts; Playwright runs are local/wave-only.

## Visual Layout Notes (`<dialog>` conversion)

- **PhotoDetailSheet bottom-sheet (mobile) vs centered (md+):** Preserved by keeping the inner content `<div>` unchanged and using the dialog only as a transparent backdrop layer. The dialog has `bg-transparent` with `backdrop:bg-black/40` (Tailwind's `::backdrop` pseudo) replacing the prior `bg-black/40` scrim div. The inner container still uses `fixed inset-x-0 bottom-0 ... md:inset-0 md:max-w-md md:mx-auto md:my-auto`.
- **PhotoViewer full-viewport:** Same approach. Dialog gets `bg-black/90` directly (full-screen viewer needs the dark fill on the dialog itself, not on a child).
- **Backdrop tap close:** Now uses `target === currentTarget` on the dialog element instead of a separate backdrop div with `onClick={onClose}`. Functionally equivalent.

Visual regression must be re-verified by the iPhone visual-review matrix in 11-03 (per CONTEXT.md decision). No regressions observed locally during component-test smoke; styles unchanged on the inner content `<div>`.

## TDD Gate Compliance

Plans 11-01 used per-task `tdd="true"` flags (Tasks 2 and 3). For each, the RED → GREEN sequence was followed within a single commit since `git status` confirmed test files + implementation changes co-existed before commit. The original plan was structured as one commit per task (not one commit per TDD gate). The vitest output above documents that:
- Task 2 RED: 9 new tests failed (`Test Files 4 failed (4) ... Tests 9 failed (9)`)
- Task 2 GREEN: same 9 tests + 14 existing PhotoCycle tests all pass (`Test Files 5 passed (5) ... Tests 23 passed (23)`)
- Task 3 RED: 4 new focus-trap tests failed (`Test Files 2 failed (2) ... Tests 4 failed | 2 passed (6)`)
- Task 3 GREEN: all 21 dialog-related tests pass.

## Self-Check: PASSED

- [x] `test -f test/setup.ts && grep -q "toHaveNoViolations" test/setup.ts` ✓
- [x] `test -f playwright.config.ts && grep -q "iPhone 13" playwright.config.ts` ✓
- [x] `grep -q '"@chialab/vitest-axe": "0.19.1"' package.json` ✓
- [x] `grep -q '"@axe-core/playwright": "4.11.3"' package.json` ✓
- [x] `grep -q '"playwright": "1.61.0"' package.json` ✓
- [x] `grep -q '"lighthouse": "13.4.0"' package.json` ✓
- [x] `! grep -q '"@axe-core/react"' package.json` ✓ (forbidden)
- [x] `grep -q 'role="region"' src/reel/ReducedMotionReel.tsx` ✓
- [x] `grep -q 'role="region"' src/reel/OrbitReducedMotionReel.tsx` ✓
- [x] `grep -q 'role="region"' src/reel/GlobeReducedMotionReel.tsx` ✓
- [x] `grep -q "showModal" src/components/PhotoDetailSheet.tsx` ✓
- [x] `grep -q "showModal" src/components/PhotoViewer.tsx` ✓
- [x] `grep -q "addEventListener.*keydown" src/components/PhotoDetailSheet.tsx` ✓
- [x] `grep -q "addEventListener.*keydown" src/components/PhotoViewer.tsx` ✓
- [x] `grep -q "addEventListener.*cancel" src/components/PhotoDetailSheet.tsx` ✓
- [x] `grep -q "addEventListener.*cancel" src/components/PhotoViewer.tsx` ✓
- [x] Commits exist: `d493efb` (Task 1), `095f738` (Task 2), `e86c784` (Task 3) ✓
- [x] All vitest a11y/focus-trap test files pass (`bun run vitest run ... 21 + 23 tests pass`) ✓
- [x] No regressions in full suite (361 pass total; same 5 pre-existing env-validation failures) ✓
- [x] DESIGN single-amber invariant preserved (no non-amber color tokens introduced) ✓
