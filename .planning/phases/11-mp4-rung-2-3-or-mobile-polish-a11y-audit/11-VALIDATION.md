---
phase: 11
slug: mp4-rung-2-3-or-mobile-polish-a11y-audit
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-19
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Filled per RESEARCH.md `## Validation Architecture` section. Planner will refine the per-task table once plans are written.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 + @testing-library/react + jsdom 29.1.1 (existing) |
| **New a11y tooling** | `@chialab/vitest-axe@0.19.1` (active fork; legacy `vitest-axe@0.1.0` is 4yr stale) |
| **New CSS-rule a11y** | `@axe-core/playwright@4.11.3` (contrast + focus-visible — jsdom can't compute) |
| **New visual + perf** | `playwright@1.61.0`, `lighthouse@13.4.0` |
| **Config file** | `vitest.config.ts` (existing), `playwright.config.ts` (Wave 0 creates) |
| **Quick run command** | `bun test` (vitest, ~2s) |
| **Full suite command** | `bun test && bun run playwright test && bun run lighthouse` |
| **Estimated runtime** | ~2s vitest + ~30s playwright + ~45s lighthouse |

---

## Sampling Rate

- **After every task commit:** `bun test` (vitest, ~2s) — A11Y-01..07 jsdom-runnable checks + suggestHandle unit tests + useFrameRate unit tests
- **After every plan wave:** `bun test && bun run playwright test` (~32s) — adds contrast, focus-visible, focus-trap, visual-review screenshots
- **Before `/gsd-verify-work`:** Full suite + `bun run lighthouse` must be green; A11Y-01 reduced-motion path must show **0 axe violations**
- **Max feedback latency:** 32s (until Playwright wave checks)

---

## Per-Task Verification Map

| Requirement | Plan (provisional) | Test Type | Tool | Automated Command | Notes |
|---|---|---|---|---|---|
| **A11Y-01** Reduced-motion 0 axe violations | 11-01 | vitest+axe | `@chialab/vitest-axe` | `bun test src/reel/ReducedMotionReel.a11y.test.tsx` | Mock `matchMedia` for `(prefers-reduced-motion: reduce)`; render `<ReducedMotionReel>` and assert `axe(container)` has 0 violations |
| **A11Y-02** Keyboard "add a city" without mouse | 11-01 | playwright | `@axe-core/playwright` | `bun run playwright test trips-keyboard.spec.ts` | Tab-only walkthrough from `/app/trips` → AddCityForm → Save; assert city row present |
| **A11Y-03** Reel `role="region"` + aria-label (not `application`) | 11-01 | vitest+RTL | `@testing-library/react` | `bun test src/reel/Reel.test.tsx -t "role region"` | Already on `Reel.tsx:75-76`; one-line fix × 3 for ReducedMotionReel/OrbitReducedMotionReel/GlobeReducedMotionReel |
| **A11Y-04** Chapter transitions fire aria-live="polite" | 11-01 | vitest+RTL | `@testing-library/react` | `bun test src/reel/Reel.test.tsx -t "aria-live"` | Gate effect on `state.name === 'IDLE' \| 'PAUSED'` so announce fires at arrival-pulse beat, not mid-swipe |
| **A11Y-05** Photo overlays alt-from-caption / empty-alt | 11-01 | vitest+RTL | `@testing-library/react` | `bun test src/reel/PhotoCycle.test.tsx -t "alt"` | Re-verify existing implementation; add explicit assertions if missing |
| **A11Y-06** Detail sheet focus trap + Esc | 11-01 | vitest+playwright | native `<dialog>` + RTL + Playwright | `bun test src/reel/PhotoDetailSheet.test.tsx && playwright test photo-modal-focus.spec.ts` | Convert PhotoDetailSheet + PhotoViewer to native `<dialog>`; apply close-watcher anti-modal-trap pattern (cancel preventDefault + document-level keydown capture) |
| **A11Y-07** WCAG AA contrast on bright-photo worst-case | 11-01 | playwright+axe | `@axe-core/playwright` | `bun run playwright test reel-contrast.spec.ts` | Screenshot reel over bright photo; assert axe contrast rule passes (gradient scrim covers it) |
| **A11Y-08** Keyboard controls (Space play/pause, ↑/↓ chapter, Enter detail) | 11-02 | vitest | `@testing-library/react` + state-machine unit | `bun test src/gestures/stateMachine.test.ts && bun test src/reel/Reel.test.tsx -t "keyboard"` | Keep `←/→ = JUMP_CHAPTER` (locked); edit REQUIREMENTS.md A11Y-08 to match; add Enter handler for "open detail" |
| **MP4-04** rung 2 fallback | 11-03 | doc-only | n/a | `grep -q 'MP4-04.*cut from v1' .planning/phases/.../11-SUMMARY.md && grep -q 'MP4-04' TODOS.md` | Branch D cuts MP4 from v1; documented in SUMMARY.md + TODOS.md v2 backlog |
| **MP4-05** rung 3 fallback | 11-03 | doc-only | n/a | `grep -q 'MP4-05.*cut from v1' .planning/phases/.../11-SUMMARY.md && grep -q 'MP4-05' TODOS.md` | Same — documented as cut |
| **MP4-06** cut path documentation | 11-03 | doc-only | n/a | `grep -q 'MP4-06' .planning/phases/.../11-SUMMARY.md && grep -q 'MP4 cut from v1' TODOS.md` | The requirement IS the cut documentation — satisfied by SUMMARY.md narrative |

### Non-requirement triage items (still need validation hooks)

| Triage Item | Plan | Test Type | Automated Command | Notes |
|---|---|---|---|---|
| Lighthouse mobile baseline (PERF-01/03/04) | 11-02 | lighthouse CLI | `bun run lighthouse:mobile` | Asserts perf ≥ 90, LCP ≤ 2.5s, CLS ≤ 0.1; persists JSON to `docs/lighthouse/v1.0.0-baseline.json` |
| iPhone FPS instrumentation | 11-02 | vitest + manual | `bun test src/hooks/useFrameRate.test.ts` + manual capture on real iPhone | Hook unit-tested (median + p95 math); real-device capture is manual; build-time grep guard ensures hook is tree-shaken from `dist/assets/*.js` |
| HandlePickerModal F8 pre-fill | 11-02 | vitest | `bun test src/auth/suggestHandle.test.ts && bun test src/auth/HandlePickerModal.test.tsx -t "suggested"` | Algorithm already on disk in `src/auth/suggestHandle.ts` — Phase 11 adds tests + UAT verification |
| Visual-review matrix (5 routes × 2 themes) | 11-03 | playwright | `bun run playwright test visual-review.spec.ts` | Generates 10 screenshots into `docs/visual-review/v1.0.0/`; manual verdict file required |

---

## Wave 0 Requirements

- [ ] Install dev deps: `bun add -D @chialab/vitest-axe@0.19.1 @axe-core/playwright@4.11.3 playwright@1.61.0 lighthouse@13.4.0`
- [ ] Run `bunx playwright install --with-deps chromium webkit` (webkit needed for iPhone emulation in visual-review matrix)
- [ ] Create `playwright.config.ts` — webServer = `bun run preview` (port 4173); projects = `chromium-desktop`, `webkit-iphone-15`
- [ ] Create `lighthouse.config.js` or `bun run lighthouse:mobile` script in `package.json` (asserts thresholds, persists JSON report)
- [ ] Verify build-time tree-shake guard: `bun run build && ! grep -l 'useFrameRate\|FpsBadge' dist/assets/*.js`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| Real iPhone FPS during OrbitReel 60°/s orbit | Triage #2 | rAF perf differs by GPU; emulation lies | On iPhone Safari, navigate to `/?fps=1`, trigger single-city reel, capture median + p95 over 8s window; record in SUMMARY.md |
| iPhone visual-review verdicts | Triage #5 | Subjective — human eye on color/spacing/layout | After Playwright captures screenshots, write `docs/visual-review/v1.0.0/INDEX.md` with per-route × theme verdict |
| iOS globe projection rendering | Phase 7 deferred (NOT closed by Phase 11) | Playwright webkit ≠ real iOS GPU | Defer to v1.1 per CONTEXT.md; do not gate Phase 11 on this |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (axe-core, playwright, lighthouse installs)
- [ ] No watch-mode flags in CI commands
- [ ] Feedback latency < 32s (until Playwright wave)
- [ ] `nyquist_compliant: true` set in frontmatter once planner refines per-task table

**Approval:** pending (planner to finalize per-task IDs once PLAN.md files exist)
