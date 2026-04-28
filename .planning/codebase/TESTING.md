# Testing Patterns

**Analysis Date:** 2026-04-27
**Phase:** W1

## Status

**Automated tests: none yet.** First tests land in W2.

The W1 acceptance gate is a manual one: 30-second test on a real iPhone (iOS 17+ Safari) with all gesture transitions verified. The `StateBadge` dev affordance (top-left amber pill) shows the current `ReelStateName` and is the harness for that verification.

## Planned Test Stack (locked in docs/plan.md)

**Test runners:**
- **Vitest** (latest) — unit tests + integration tests. Hot-reload friendly with Vite, no jsdom config drama.
- **Playwright** (latest) — E2E tests on real Chromium / WebKit / Firefox. Mobile emulation profile for iPhone 14 Pro.
- **@testing-library/react** — component testing.

**Coverage target:** 80% lines, 80% branches (gstack-global rule from `~/.claude/rules/common/testing.md`).

## What to Test First (W2)

**Pure modules — Vitest unit tests:**
1. `stateMachine.ts` — every `(state, event) → state` transition. Especially:
   - SCRUBBING → IDLE on POINTER_UP commits the right chapter index.
   - POINTER_DOWN with pointers≥2 always promotes to MAP_INTERACT regardless of prior state.
   - VIS_HIDDEN never returns to anything other than SUSPENDED.
   - VIS_VISIBLE → IDLE only from SUSPENDED.
   - JUMP_CHAPTER clamps at 0 and totalChapters - 1.
   - TAP_BACKGROUND only toggles in IDLE / PAUSED, ignores other states.

**React hooks — RTL `renderHook`:**
2. `useGestureMachine` —
   - Long-press timer fires SCRUBBING after 200ms with single finger held still.
   - Long-press CANCELLED if user moves >FLICK_THRESHOLD_PX vertically before 200ms.
   - Visibility change dispatches VIS_HIDDEN/VISIBLE.
   - Auto-play timer in IDLE wraps from last chapter back to first.
3. `usePrefersReducedMotion` — subscribes to matchMedia change, returns latest.

**Components — RTL:**
4. `ChapterRail` — current segment fills amber, scrub cursor draws partial gradient at right offset.
5. `ChapterOverlay` — re-mounts on key change (verifies arrival pulse path).
6. `ReducedMotionReel` — renders all 10 chapters in order, has CTA link.

**E2E — Playwright (mobile profile):**
7. Public reel landing — auto-play advances at least 2 chapters in 12 seconds.
8. Reduced-motion path — no map canvas, all chapters visible by scroll.
9. Keyboard — Space pauses, ArrowRight advances chapter.

## Test File Organization (planned)

**Location:**
- Unit/component tests live next to source: `src/gestures/stateMachine.test.ts`.
- Playwright lives in `tests/e2e/` at repo root.

**Naming:**
- `.test.ts` for Vitest (matches Vitest defaults).
- `.spec.ts` for Playwright (Playwright defaults).

## Manual Test Plan

The full QA plan lives in `docs/test-plan.md`. Notable areas the automated suite cannot fully cover:

- **Real-device gesture feel** — long-press timing, flick threshold, scrub cursor responsiveness on actual touch hardware. iPhone 14 Pro is the canonical reference device.
- **iOS Safari quirks** — pull-to-refresh disabled, back-edge-swipe not intercepted, 3-finger gestures yield to OS, MediaRecorder behavior in W10.
- **Map flyTo aesthetic** — does the camera land where the eye expects, with the right pitch/bearing? Subjective.

## Run Commands (when wired)

```bash
bun test                     # Vitest, all unit + integration
bun test --watch             # watch mode
bun test stateMachine        # filter by name substring
bun run test:coverage        # coverage report
bun run test:e2e             # Playwright, headless
bun run test:e2e --headed    # Playwright with visible browser
```

## Smoke Tests Today

The closest thing to a test gate in W1:

```bash
bun run typecheck   # tsc -b --noEmit must be clean
bun run build       # tsc -b && vite build must succeed
```

Both run on every commit (no CI yet — first CI lands W9).

## Anti-patterns to Avoid

- **Mocking the gesture state machine.** It's a pure function — call it directly. The whole point of the pure-machine + effectful-hook split is that the machine is trivially unit-testable without mocks.
- **Mocking MapLibre in component tests.** Test the gesture hook and overlays separately; let Playwright cover the map+canvas integration on a real WebGL context.
- **Testing `prefers-reduced-motion` via JSDOM.** JSDOM doesn't implement matchMedia faithfully. Test the picker logic with a hand-rolled fake MediaQueryList; test the actual fallback rendering with Playwright's `forcedColors` / `reducedMotion` emulation.
