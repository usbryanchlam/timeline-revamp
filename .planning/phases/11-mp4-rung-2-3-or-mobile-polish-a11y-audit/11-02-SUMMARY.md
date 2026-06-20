---
phase: 11
plan: 02
subsystem: a11y-keyboard + fps + lighthouse
tags: [a11y, keyboard, fps, lighthouse, perf, f8, suggestHandle, tree-shake]
requires:
  - "lighthouse@13.4.0 (already installed by 11-01)"
provides:
  - "A11Y-02 closed: keyboard-only add-city flow tested + MapPicker affordance shipped"
  - "A11Y-08 closed: REQUIREMENTS.md aligned with shipped JUMP_CHAPTER semantics + Enter→OPEN_DETAIL handler"
  - "F8 closed: suggestHandle algorithm covered by 12 unit cases; HandlePickerGate covered by 3 integration cases; algorithm file untouched per D-LOCK"
  - "FPS hook + FpsBadge: rAF sampler gated on DEV+?fps=1, tree-shaken from prod bundle (verify:tree-shake script)"
  - "v1.0.0 Lighthouse mobile baseline JSON+HTML on disk; threshold gate script + v1.1 deferral diagnosis"
affects:
  - .planning/REQUIREMENTS.md (A11Y-08 line — drop "←/→ scrub ±1s" per D-LOCK)
  - .planning/TODOS.md (PERF-v1.1-A/B/C entries)
  - src/gestures/stateMachine.ts (OPEN_DETAIL event added to union)
  - src/gestures/useGestureMachine.ts (Enter handler + onOpenDetail option)
  - src/reel/Reel.tsx (detailOpen state + Esc-close handler)
  - src/reel/OrbitReel.tsx (FpsBadge conditional render under DEV literal)
  - src/components/MapPicker.tsx (sr-only keyboard pin-drop button)
  - package.json (verify:tree-shake + lighthouse:baseline/assert/mobile)
tech-stack:
  added:
    - "src/dev/* runtime-DEV-gated FPS instrumentation"
  patterns:
    - "DEV+query-param runtime gate (?fps=1 precedent matches Phase 8 ?signup=1)"
    - "import.meta.env.DEV literal Vite-replacement + Rollup dead-code-elimination for tree-shake"
    - "validateHandle as single source of truth for handle suggestion final-filter (server/handles/validate.ts)"
key-files:
  created:
    - src/reel/Reel.keyboard.test.tsx
    - src/routes/TripsRoute.a11y.test.tsx
    - src/auth/suggestHandle.test.ts
    - src/auth/HandlePickerGate.test.tsx
    - src/dev/useFrameRate.ts
    - src/dev/useFrameRate.test.ts
    - src/dev/FpsBadge.tsx
    - scripts/lighthouse-baseline.sh
    - scripts/assert-lighthouse-thresholds.ts
    - docs/lighthouse/v1.0.0-baseline.json (symlink → timestamped run)
    - docs/lighthouse/v1.0.0-baseline.html (symlink)
    - docs/lighthouse/v1.0.0-baseline-DIAGNOSIS.md
    - .planning/phases/11-mp4-rung-2-3-or-mobile-polish-a11y-audit/deferred-items.md
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/TODOS.md
    - src/gestures/stateMachine.ts
    - src/gestures/stateMachine.test.ts
    - src/gestures/useGestureMachine.ts
    - src/reel/Reel.tsx
    - src/reel/OrbitReel.tsx
    - src/components/MapPicker.tsx
    - package.json
decisions:
  - "Detail-sheet state lives in Reel.tsx (detailOpen), not in stateMachine.ts. The OPEN_DETAIL event is added to the discriminated union for completeness but is a no-op in the reducer. useGestureMachine fans out via onOpenDetail callback (held in a ref to avoid re-binding the window keydown listener on every render)."
  - "MapPicker keyboard affordance is sr-only / focus-visible:not-sr-only so it does not clutter the visual layout but is fully reachable via Tab. The button calls map.getCenter() to drop the pin at the current visible center — a sensible 'where you are looking' approximation for keyboard users."
  - "verify:tree-shake script bypasses tsc (`vite build` directly) because pre-existing 11-01 a11y test files have unresolved typing for the toHaveNoViolations matcher. Logged in deferred-items.md as out-of-scope for 11-02."
  - "Lighthouse thresholds MISSED (perf=40, LCP=6.3s). Per CONTEXT.md triage #1 instruction, captured DIAGNOSIS.md + v1.1 TODOS entries instead of trying to fix in 11-02 — the fix surface (lazy maplibre, seed-photo re-encode, LCP poster pre-render) exceeds single-commit scope."
metrics:
  duration_minutes: 15
  completed: 2026-06-20
  tasks_completed: 4
  vitest_tests_added: 28
  vitest_tests_total: 392
  commits: 4
---

# Phase 11 Plan 02: keyboard a11y + F8 + FPS + Lighthouse baseline Summary

Closed the four "behavior + measurement" triage items not covered by 11-01:
A11Y-02 keyboard-only flow + A11Y-08 keyboard handler completion, F8
suggestHandle test coverage, dev-only FPS instrumentation with tree-shake
guard, and the v1.0.0 mobile Lighthouse baseline (with diagnosis + v1.1
deferral on the threshold miss).

## REQUIREMENTS.md A11Y-08 edit (before / after)

| | Before (line 31) | After |
|---|---|---|
| ←/→ | scrub ±1s | chapter prev/next |
| ↑/↓ | chapter prev/next | chapter prev/next |
| Space | play/pause | play/pause |
| Enter | open detail | open detail |

Rationale (per D-LOCK CONTEXT decision): the shipped gesture machine uses
`JUMP_CHAPTER` for all four arrow keys (`useGestureMachine.ts` lines
~265-272). The REQUIREMENTS.md "scrub ±1s" line was never implemented and
conflating arrow-keys with scrub would risk motion-coherence regression.
Phase 11 aligns the requirement with the shipped code, NOT vice versa.

## A11Y-02 + A11Y-08 — keyboard handlers and tests

### Code changes

- `src/gestures/stateMachine.ts`: added `OPEN_DETAIL` event to the
  discriminated union as a no-op transition (returns same state ref).
  Purpose: keep the event union exhaustive and give downstream consumers
  a typed dispatch surface; the actual sheet-open is fanned out via the
  hook's `onOpenDetail` callback (state machine doesn't own sheet state).
- `src/gestures/useGestureMachine.ts`: added `onOpenDetail?: () => void`
  option held in a ref so consumer identity changes don't re-bind the
  window keydown listener. The keydown handler now routes `Enter` to
  `dispatch({ type: 'OPEN_DETAIL' })` + `onOpenDetailRef.current?.()`.
  Existing `Space`/`Arrow*` handlers preserved verbatim per D-LOCK.
- `src/reel/Reel.tsx`: added `detailOpen` local state + Esc inline handler
  on the reel region. The Reel passes its `setDetailOpen(true)` as
  `onOpenDetail`; the data-attribute makes the open state externally
  observable.
- `src/components/MapPicker.tsx`: added a `sr-only focus-visible:not-sr-only`
  button labeled "Add city at current map center" that calls `map.getCenter()`
  and forwards to `onPick`. This is the A11Y-02 affordance — keyboard users
  can drop a draft pin without ever touching the pointer-only map canvas.

### New tests

- `src/reel/Reel.keyboard.test.tsx` (6 cases):
  - Reel mounts without throwing under the mocked gesture machine
  - Reel wires `onOpenDetail` callback into useGestureMachine
  - Real-hook Space toggles IDLE ↔ PAUSED
  - Real-hook Arrow* drives chapter index with clamping
  - Real-hook Enter invokes the `onOpenDetail` callback
  - Real-hook Enter without `onOpenDetail` does not throw
- `src/gestures/stateMachine.test.ts` extension (5 OPEN_DETAIL cases):
  - IDLE / PAUSED / CHAPTER_SWIPE / SCRUBBING / SUSPENDED all no-op identity
- `src/routes/TripsRoute.a11y.test.tsx` (1 case):
  - Full keyboard-only "add a city" flow using `userEvent.keyboard()`. Hard
    gate satisfied: `! grep -q 'user\.click(' src/routes/TripsRoute.a11y.test.tsx`
    (verified — zero `user.click(` occurrences in the test file).

## F8 — suggestHandle + HandlePickerGate tests

**D-LOCK precondition verified:** `src/auth/suggestHandle.ts` is unchanged
(`git diff src/auth/suggestHandle.ts` is empty). Phase 11 only adds tests +
UAT verification.

### New tests

- `src/auth/suggestHandle.test.ts` (12 cases):
  - Test 1: `{ nickname: 'Bryan Lam' }` → `'bryan-lam'`
  - Test 2: `{ nickname: 'Admin' }` → `''` (reserved-word filter)
  - Test 3: `{ email: 'bryan.lam@gmail.com' }` → `'bryan-lam'`
  - Test 4: `{ given_name: 'Bryan' }` → `'bryan'`
  - Test 5: `{}` → `''`
  - Test 6: `{ nickname: 'Très Bién!!!' }` → `'trs-bin'` (non-ASCII strip)
  - Test 7: 50-char nickname truncates to 20
  - Test 8: 2-char nickname → `''` (validateHandle too_short)
  - Test 9: fallback nickname-too-short → email
  - Test 10: fallback nickname+email-both-fail → given_name
  - Test 11: nickname preferred when all three valid
  - Test 12: email preferred when nickname empty

- `src/auth/HandlePickerGate.test.tsx` (3 cases):
  - Test 9 (plan numbering): modal pre-fills `'bryan-lam'` when
    nickname='Bryan Lam' + `/api/me` returns handle=null
  - Test 10: modal opens with empty input when no usable suggestion
  - Bonus: modal NOT rendered when `/api/me` reports a non-null handle

**All 15 new tests pass on first run.** No algorithm gaps found — F8 is
fully covered + integration-verified. Existing `HandlePickerModal.test.tsx`
suite (11 tests) still green: no regression.

### UAT verification note (manual)

After deploying 11-02, real-Auth0 UAT verification path:
1. `psql ... -c "UPDATE users SET handle=NULL WHERE id=<test-user-id>;"`
2. Log out + log in via `usbryanchlam@gmail.com` (Google federation)
3. Observe HandlePickerModal opens with input pre-filled (likely `'bryan'`
   or `'bryanlam'` depending on Auth0 nickname claim)
4. Confirm the live availability check fires + Claim button enables
   without user typing

To be recorded in `.planning/STATE.md` UAT round table after 11-03 ships
the post-11 deploy.

## FPS instrumentation — tree-shake guard output

### Files

- `src/dev/useFrameRate.ts` — rAF FPS sampler gated on
  `(opts.enabled ?? true) && import.meta.env.DEV && URLSearchParams(location.search).has('fps')`.
  Returns `{ fps, median, p95, sampleCount }` over a rolling `windowMs`
  (default 8000ms). Median = `sorted[floor(n/2)]`; p95-low =
  `sorted[floor(n*0.05)]` per RESEARCH.md.
- `src/dev/FpsBadge.tsx` — amber readout (`text-amber-400` only; single-
  accent rule preserved). Re-checks `import.meta.env.DEV` defensively
  before calling the hook.
- `src/reel/OrbitReel.tsx` — `{import.meta.env.DEV && <FpsBadge />}`
  conditional render at the orbit-active surface.

### Tree-shake guard output

```
$ bun run verify:tree-shake
vite build
... built in 2.19s
$ grep -lE 'useFrameRate|FpsBadge' dist/assets/*.js
(no matches)
$ echo $?
0
```

Both symbols are DROPPED from the production bundle. The mechanism:
1. Vite replaces `import.meta.env.DEV` with the boolean literal `false`
   at build time.
2. Rollup's minifier dead-codes `if (false) ...` branches.
3. The conditional render in `OrbitReel.tsx` means `FpsBadge` is never
   reached in prod; the import binding becomes unreachable and is
   eliminated alongside its transitive dep `useFrameRate`.

### Manual iPhone UAT note

Real-device FPS measurement (to be recorded post-deploy):
1. iPhone Safari → `https://timeline.bryanlam.dev/?fps=1` (or `/u/<handle>?fps=1`)
2. Observe FpsBadge in top-left during the 8s OrbitReel orbit
3. Record median + p95 over the orbit window; expected:
   median ≥ 55 FPS, p95-low ≥ 50 FPS per CONTEXT.md triage #2.

If miss: file follow-up against PERF-v1.1 in TODOS.md (FPS instrumentation
itself is shipped; tuning targets are a v1.1 concern).

## Lighthouse baseline — scores + verdict

### Run

`bun run lighthouse:mobile` (calls `lighthouse:baseline` then `lighthouse:assert`).

### Captured (2026-06-20 UTC)

| Metric | Measured | Threshold | Status |
| --- | --- | --- | --- |
| Perf | 40 | ≥ 90 | **FAIL** (PERF-01) |
| LCP | 6,303 ms | ≤ 2,500 ms | **FAIL** (PERF-03) |
| CLS | 0.0006 | ≤ 0.1 | PASS (PERF-04) |
| FCP | 4,427 ms | — | informational |
| TBT | 1,717 ms | — | informational |

### Verdict: defer to v1.1

Per CONTEXT.md triage #1 instruction:

> If thresholds miss: capture the diagnosis (LCP element, blocking
> resources) and triage fix vs. v2 deferral within this phase

Captured `docs/lighthouse/v1.0.0-baseline-DIAGNOSIS.md` + three
`PERF-v1.1` entries in `.planning/TODOS.md`. The fix surface (lazy
maplibre in OrbitReel/GlobeReel, seed-photo re-encoding, LCP poster
pre-rendering) exceeds single-commit scope and properly belongs to v1.1.

The baseline JSON+HTML IS the v1.0.0 launch artifact — it gives v1.1
something to regress against. PERF-04 ships green; PERF-01/03 ship as
explicit deferrals with diagnosis on file.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Blocking] Pre-existing TypeScript errors in 11-01 a11y test files block `tsc -b`**

- **Found during:** Task 3 (running `bun run build` after wiring FpsBadge)
- **Issue:** Four test files shipped by 11-01 fail `tsc -b` because
  `@chialab/vitest-axe` matcher augmentation is not imported / typed at
  the test-file level. Errors are tsc-only (vitest runs them fine).
- **Fix in 11-02:** Logged to
  `.planning/phases/11-mp4-rung-2-3-or-mobile-polish-a11y-audit/deferred-items.md`.
  `verify:tree-shake` script uses `vite build` directly (not `bun run build`,
  which includes `tsc -b`) so the tree-shake gate is not blocked.
- **Files affected (not modified):** GlobeReducedMotionReel.a11y.test.tsx,
  OrbitReducedMotionReel.a11y.test.tsx, ReducedMotionReel.a11y.test.tsx.
- **Out-of-scope per executor rule:** these files were shipped by 11-01,
  not modified by 11-02. The fix (single import line per file) is a
  one-commit follow-up for 11-03 or post-11.

### Lighthouse threshold miss (planned per CONTEXT.md, not a deviation)

Per CONTEXT.md triage #1 explicit instruction: "If thresholds miss: capture
the diagnosis ... and triage fix vs. deferral within this phase." Followed
that exact path. Recorded as a normal flow, not a deviation.

## Known Stubs

None. All new code is wired end-to-end:
- `useFrameRate` returns real samples in DEV + `?fps=1`; null otherwise.
- `FpsBadge` renders real readouts in DEV; null otherwise.
- `MapPicker` keyboard button calls real `map.getCenter()` → `onPick`.
- Reel `detailOpen` state has a real consumer (Esc close handler) and is
  surfaced as a data-attribute for downstream observability.

## Threat Flags

None. The plan's threat register (T-11-05 / T-11-06 / T-11-07 / T-11-08)
is satisfied:
- T-11-05 (FPS leaking to prod): tree-shake guard PASS.
- T-11-06 (XSS via handle suggestion): sanitize chain + validateHandle
  filter tested with `'Très Bién!!!'` non-ASCII input.
- T-11-07 (Lighthouse Chrome flags): hardcoded `--headless=new --no-sandbox`
  only; no user-supplied URL (`http://localhost:4173/` is hardcoded).
- T-11-08 (Lighthouse JSON cookie/env leakage): runs unauthenticated
  against `/`; JSON contains perf metrics only.

No new security-relevant surface introduced.

## Commits

| # | Hash | Task | Subject |
| --- | --- | --- | --- |
| 1 | `54c5813` | Task 1 | feat(11-02): close A11Y-02 + A11Y-08 keyboard accessibility |
| 2 | `be96ffe` | Task 2 | test(11-02): F8 suggestHandle algorithm + HandlePickerGate integration |
| 3 | `2dda054` | Task 3 | feat(11-02): FPS instrumentation hook + FpsBadge with tree-shake guard |
| 4 | `9e4024a` | Task 4 | feat(11-02): v1.0.0 Lighthouse mobile baseline + threshold gate |

## Self-Check: PASSED

- [x] `grep -q '←/→ chapter prev/next' .planning/REQUIREMENTS.md` ✓
- [x] `! grep -q '←/→ scrub' .planning/REQUIREMENTS.md` ✓
- [x] `grep -E 'OPEN_DETAIL|onOpenDetail' src/gestures/stateMachine.ts` ✓
- [x] `grep -q "'Enter'" src/gestures/useGestureMachine.ts` ✓
- [x] `test -f src/reel/Reel.keyboard.test.tsx` ✓
- [x] `test -f src/routes/TripsRoute.a11y.test.tsx` ✓
- [x] `! grep -q 'user\.click(' src/routes/TripsRoute.a11y.test.tsx` ✓
- [x] `test -f src/auth/suggestHandle.test.ts` ✓
- [x] `test -f src/auth/HandlePickerGate.test.tsx` ✓
- [x] `git diff src/auth/suggestHandle.ts` is empty (D-LOCK) ✓
- [x] `test -f src/dev/useFrameRate.ts && test -f src/dev/FpsBadge.tsx` ✓
- [x] `grep -c 'import.meta.env.DEV' src/dev/useFrameRate.ts` → 4 ✓
- [x] `grep -c 'import.meta.env.DEV' src/dev/FpsBadge.tsx` → 4 ✓
- [x] `grep -E 'import.meta.env.DEV.*FpsBadge' src/reel/OrbitReel.tsx` ✓
- [x] `bun run verify:tree-shake` exits 0 (no useFrameRate/FpsBadge in dist) ✓
- [x] `jq -r '.scripts["verify:tree-shake"]' package.json` matches ✓
- [x] `! grep -E 'bg-(blue|red|green|purple|pink|cyan|indigo|teal)-[0-9]' src/dev/FpsBadge.tsx` ✓ (DESIGN amber-only)
- [x] `test -x scripts/lighthouse-baseline.sh` ✓
- [x] `test -f scripts/assert-lighthouse-thresholds.ts` ✓
- [x] `grep -q 'vite preview' scripts/lighthouse-baseline.sh` ✓
- [x] `! grep -q 'bun run dev' scripts/lighthouse-baseline.sh` ✓
- [x] `jq -r '.scripts["lighthouse:mobile"]' package.json` returns the chained script ✓
- [x] `test -f docs/lighthouse/v1.0.0-baseline.json` ✓
- [x] `test -f docs/lighthouse/v1.0.0-baseline.html` ✓
- [x] Thresholds missed → `docs/lighthouse/v1.0.0-baseline-DIAGNOSIS.md` + `.planning/TODOS.md` PERF-v1.1 entries recorded ✓
- [x] All four commits exist (`git log --oneline`) ✓
- [x] 11-02 test suite green (129/129 pass across 7 files) ✓
- [x] No regressions in full suite (392 pass; same 5 pre-existing env-validation file failures as 11-01) ✓
