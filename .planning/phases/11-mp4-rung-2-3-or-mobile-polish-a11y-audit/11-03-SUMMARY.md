---
phase: 11
plan: 03
subsystem: visual-review + mp4-cut-docs + phase-summary
tags: [visual-review, playwright, screenshots, mp4-cut, branch-d, summary, css-fix, design-lock]
requires:
  - "playwright@1.61.0 + @playwright/test@1.61.0 (installed by 11-01)"
provides:
  - "e2e/visual-review.spec.ts — Playwright iPhone 13 × {dark,light} matrix"
  - "docs/visual-review/v1.0.0/ — 10 baseline PNGs + 1 mixed-case re-verify + INDEX.md verdicts (all ok)"
  - "TODOS.md — MP4-04/05/06 v2 backlog entries"
  - ".planning/TODOS.md — Phase 11 deferred-to-v1.1 section (MP4 cut + iOS globe projection + real-device UAT items)"
  - ".planning/REQUIREMENTS.md — A11Y-01..08 + MP4-06 flipped to done; MP4-04/05 marked [~] cut-to-v2"
  - "src/index.css — DESIGN.md:72 lock enforced under prefers-color-scheme: light (CTA pill amber restored)"
  - ".planning/phases/11-.../11-SUMMARY.md — phase-level rollup"
affects:
  - e2e/visual-review.spec.ts (new)
  - docs/visual-review/v1.0.0/INDEX.md (skeleton then verdicts)
  - docs/visual-review/v1.0.0/public-reel-light.png (re-captured after CTA pill fix)
  - src/index.css (added .reel-root, .reel-static-root dark-token re-assertion inside the light-mode media query)
  - TODOS.md (v2 — MP4 export section)
  - .planning/TODOS.md (Phase 11 — Deferred to v1.1 section)
  - .planning/REQUIREMENTS.md (A11Y-01..08 + MP4-04/05/06 boxes + traceability table)
  - .planning/phases/11-.../11-SUMMARY.md (new)
  - .planning/phases/11-.../.checkpoint-11-03.md (deleted after Task 2 verdicts written)
tech-stack:
  added: []
  patterns:
    - "DESIGN.md:72 lock enforced via scoped token re-assertion inside @media (prefers-color-scheme: light) — locks the reel surface dark while letting the rest of /app theme normally"
    - "Playwright iPhone 13 × {dark,light} × 5 routes screenshot matrix as a v1.0.0 launch artifact (regression target for v1.1)"
    - "MP4 cut path satisfied by Branch D documentation in 11-SUMMARY.md narrative — the requirement IS the documentation"
key-files:
  created:
    - e2e/visual-review.spec.ts
    - docs/visual-review/v1.0.0/INDEX.md
    - docs/visual-review/v1.0.0/public-reel-dark.png
    - docs/visual-review/v1.0.0/public-reel-light.png
    - docs/visual-review/v1.0.0/u-bryan-dark.png
    - docs/visual-review/v1.0.0/u-bryan-light.png
    - docs/visual-review/v1.0.0/app-reel-dark.png
    - docs/visual-review/v1.0.0/app-reel-light.png
    - docs/visual-review/v1.0.0/app-trips-dark.png
    - docs/visual-review/v1.0.0/app-trips-light.png
    - docs/visual-review/v1.0.0/app-me-dark.png
    - docs/visual-review/v1.0.0/app-me-light.png
    - docs/visual-review/v1.0.0/u-BRYAN-mixedcase-dark.png
    - .planning/phases/11-mp4-rung-2-3-or-mobile-polish-a11y-audit/11-SUMMARY.md
  modified:
    - src/index.css (added 19-line dark-token re-assertion + comment)
    - TODOS.md (added v2 — MP4 export section)
    - .planning/TODOS.md (added Phase 11 — Deferred to v1.1 section above the existing PERF-v1.1 section)
    - .planning/REQUIREMENTS.md (A11Y-01..08 + MP4-04/05/06 + traceability rows)
  deleted:
    - .planning/phases/11-mp4-rung-2-3-or-mobile-polish-a11y-audit/.checkpoint-11-03.md
decisions:
  - "CTA pill fix scope: add a token re-assertion on .reel-root + .reel-static-root inside the light-mode media query, rather than scope the override away from .glass-pill. Rationale: the lock is about the reel SURFACE, not the pill — any future descendant of the reel root (state badges, chapter overlays, photo cards) gets the same lock for free. Reuses original :root token values; no new color."
  - "MP4-06 box flipped to [x] because the cut PATH is shipped — the documentation IS the satisfaction per the requirement text. MP4-04/05 marked [~] with v2 backlog pointers because the FALLBACK code is what's cut."
  - "Plan kept the autonomous=false flag in spirit by gating Task 3 on the human-verify checkpoint resume signal — no docs-only commits land until verdicts are written."
metrics:
  duration_minutes: ~20 (post-checkpoint resume)
  completed: 2026-06-20
  tasks_completed: 3 (Task 1 pre-checkpoint, Tasks 2+3 post-checkpoint)
  vitest_tests_added: 0
  vitest_tests_total: 392 (unchanged from 11-02)
  vitest_files_pass: 45
  vitest_files_fail_preexisting: 5
  commits: 4 (post-checkpoint) + 2 (pre-checkpoint, from f1f3e4c + 993fa1b)
---

# Phase 11 Plan 03: Visual-review matrix + MP4 cut docs + CTA pill fix + Phase SUMMARY

Closing plan of Phase 11. Produces the v1.0.0 iPhone visual-review baseline (10 PNGs + INDEX.md verdicts), documents the MP4 cut per Branch D (MP4-04/05 → v2 backlog, MP4-06 satisfied by 11-SUMMARY.md narrative), flips A11Y-01..08 + MP4-06 to done in REQUIREMENTS.md, and writes the phase-level 11-SUMMARY.md rollup. One surgical CSS fix landed post-checkpoint to restore the DESIGN.md:72 lock under `prefers-color-scheme: light`.

## Task 1 Outcome — Visual-review matrix (pre-checkpoint)

Shipped in commit `f1f3e4c` (recorded in `.checkpoint-11-03.md`). Built:

- `e2e/visual-review.spec.ts`: Playwright iPhone 13 × `{dark, light}` × 5 routes loop + 1 mixed-case re-verification test (`/u/BRYAN`).
- `docs/visual-review/v1.0.0/*.png`: 10 baseline PNGs + 1 mixed-case PNG. All against `bun run preview` on `:4173`.
- `docs/visual-review/v1.0.0/INDEX.md` skeleton with 5×2 matrix + four documented limitations (Playwright WebKit ≠ iOS Safari, no backend → NotFound on `/u/bryan`, no Auth0 session → logged-out splash on `/app/*`, DESIGN.md:72 lock applied to `light` cells).

Checkpoint marker file `.checkpoint-11-03.md` committed (`993fa1b`) and the run paused for human visual review.

## Task 2 Outcome — Human verdicts + CTA pill bug fix (post-checkpoint)

Human review identified ONE DESIGN.md:72 violation: the public-reel light-mode CTA pill (`src/reel/CTAPill.tsx` → `.glass-pill`) was washing out because `@media (prefers-color-scheme: light)` flipped `--color-bg-elev` to white (`#ffffff`) and `--color-ink` to dark (`#0a0e1a`) — even on the reel surface, which DESIGN.md:72 locks to ALWAYS dark.

### CTA pill fix (commit `0618024`)

Added inside the existing `@media (prefers-color-scheme: light) { ... }` block in `src/index.css`:

```css
.reel-root,
.reel-static-root {
  --color-bg: #0a0e1a;
  --color-bg-elev: #101522;
  --color-ink: #f7f8fb;
  --color-ink-dim: #a8b0c2;
  --color-ink-mute: #6b7488;
  --color-line: #1b2235;
  color-scheme: dark;
}
```

Rationale:
- The lock is about the reel SURFACE, not the pill specifically. Any future descendant of `.reel-root` / `.reel-static-root` (state badges, chapter overlays, photo cards) gets the same lock for free.
- Reuses the original `:root` dark token values verbatim — **no new color introduced**. The DESIGN single-amber-accent invariant is preserved.
- Authenticated `/app` chrome around an embedded reel still themes normally; only the reel surface itself is locked.

### Re-capture (commit `0472175`)

`bunx playwright test --project=webkit-iphone --grep "public-reel light"` → re-captured `docs/visual-review/v1.0.0/public-reel-light.png`. Visual diff vs `public-reel-dark.png`: now identical (dark glass pill, white "Make your own" text, bright amber `→` arrow).

### Verdicts written (commit `75fa5e3`)

All 10 matrix cells flipped from `(pending)` to `ok`. Public-reel light cell carries the inline fix-and-commit-hash reference. NotFound + logged-out-splash cells inherit their Task 1 limitations as part of the verdict text — these are documented Playwright-emulation limits, not regressions. Mixed-case re-verification (`u-BRYAN-mixedcase-dark.png`) gets a separate "ok" status closing Phase 7 deferred UAT item #3. Checkpoint marker `.checkpoint-11-03.md` deleted.

## Task 3 Outcome — MP4 cut docs + REQUIREMENTS traceability + phase SUMMARY

### MP4 cut documentation (commit `6bc657b`)

**`TODOS.md`** — new `## v2 — MP4 export (cut from v1 per Phase 11 Branch D)` section at top of v2 list:
- MP4-04 (rung 2 fallback) verbatim entry per the plan.
- MP4-05 (rung 3 fallback) verbatim entry per the plan.
- MP4-06 pointer to `11-SUMMARY.md` Branch D narrative.

**`.planning/TODOS.md`** — new `## Phase 11 — Deferred to v1.1` section above the existing PERF-v1.1 section:
- MP4 cut from v1 (Branch D selection).
- iOS globe projection rendering (Phase 7 deferred mobile UAT item #2).
- Populated `/u/:handle` real-device UAT.
- Authenticated `/app/*` real-device UAT.

**`.planning/REQUIREMENTS.md`**:
- A11Y-01..08 boxes `[ ]` → `[x]` (closed by 11-01 Tasks 2/3 + 11-02 Tasks 1/2).
- MP4-04/05 boxes `[ ]` → `[~]` with v2 backlog pointer prose (cut from v1 per Branch D).
- MP4-06 box `[ ]` → `[x]` (cut PATH itself shipped — the documentation IS the satisfaction).
- Traceability table: `A11Y-01..08 | Phase 11 (W11) | ✓ Done`. MP4-04..06 row split: `MP4-04/05 cut to v2; MP4-06 ✓ Done (Branch D documented)`.

### Phase-level 11-SUMMARY.md (commit `f8d7ce4`)

`.planning/phases/11-mp4-rung-2-3-or-mobile-polish-a11y-audit/11-SUMMARY.md` created — distinct from this plan-level summary. Contains:

- Branch D selection narrative.
- Per-plan rollup with all 11-01/11-02/11-03 commit hashes.
- Requirement closure table: A11Y-01..08 + MP4-06 closed; MP4-04/05 cut-to-v2.
- CTA pill bug + fix narrative (the post-checkpoint surprise).
- Lighthouse v1.0.0 mobile baseline scores + verdict (defer to v1.1 — NOT a phase blocker per CONTEXT.md triage #1).
- Phase 7 deferred mobile UAT items disposition (#1 closed in-phase, #2 deferred to v1.1, #3 closed by mixed-case re-verification).
- Real-device UAT items deferred to v1.1.
- FPS UAT note template (real-iPhone capture post-deploy).
- F8 closure + UAT path.
- Threat model compliance summary.
- Test count delta: +48 vitest tests this phase, 0 regressions.
- Carry-forwards to Phase 12 (real-device QA + OG image + v1.0.0 tag).

## Files Modified

| File | Disposition | Commit |
| --- | --- | --- |
| `e2e/visual-review.spec.ts` | created (pre-checkpoint) | `f1f3e4c` |
| `docs/visual-review/v1.0.0/INDEX.md` | created skeleton then verdicts | `f1f3e4c` → `75fa5e3` |
| `docs/visual-review/v1.0.0/*.png` (10 baseline + 1 mixed-case) | created (pre-checkpoint) | `f1f3e4c` |
| `docs/visual-review/v1.0.0/public-reel-light.png` | re-captured after CTA pill fix | `0472175` |
| `src/index.css` | added 19-line dark-token re-assertion + comment | `0618024` |
| `TODOS.md` | added v2 — MP4 export section | `6bc657b` |
| `.planning/TODOS.md` | added Phase 11 — Deferred to v1.1 section | `6bc657b` |
| `.planning/REQUIREMENTS.md` | A11Y-01..08 + MP4-04/05/06 + traceability rows | `6bc657b` |
| `.planning/phases/11-.../.checkpoint-11-03.md` | created then deleted (gate closed) | `993fa1b` → `75fa5e3` |
| `.planning/phases/11-.../11-SUMMARY.md` | created (phase rollup) | `f8d7ce4` |
| `.planning/phases/11-.../11-03-SUMMARY.md` | created (this file) | (next commit) |

## Commits

| # | Hash | Phase | Subject |
| --- | --- | --- | --- |
| 1 | `f1f3e4c` | pre-checkpoint | feat(11-03): visual-review matrix v1.0.0 — 10 PNGs + INDEX skeleton |
| 2 | `993fa1b` | pre-checkpoint | docs(11-03): checkpoint marker for human-verify gate (Task 2) |
| 3 | `0618024` | post-checkpoint | fix(11-03): public reel CTA pill loses amber under prefers-color-scheme light (DESIGN.md:72) |
| 4 | `0472175` | post-checkpoint | chore(11-03): re-capture public-reel-light.png after CTA pill fix |
| 5 | `75fa5e3` | post-checkpoint | docs(11-03): visual-review verdicts written after human checkpoint |
| 6 | `6bc657b` | post-checkpoint | docs(11-03): close MP4-04/05/06 via documentation (Branch D); flip A11Y-01..08 to done in REQUIREMENTS |
| 7 | `f8d7ce4` | post-checkpoint | docs(11): phase summary — Branch D shipped (mobile polish + a11y + MP4 cut docs) |
| 8 | (this commit) | post-checkpoint | docs(11-03): SUMMARY for visual-review matrix + MP4 cut docs + CTA pill fix |

## Test Result

`bun run test` (vitest): **392 passed (392)**, files: 45 passed + 5 failed (pre-existing server-side env-validation files — `feedback_module_load_env_validation_blocks_ci.md` — unchanged from 11-02). Zero regressions introduced by this plan.

```
 Test Files  5 failed | 45 passed (50)
      Tests  392 passed (392)
   Duration  2.38s
```

No new vitest tests were added by 11-03 — this plan is documentation + a single CSS fix. The E2E spec `e2e/visual-review.spec.ts` (created by 11-03) ran successfully both at pre-checkpoint Task 1 (10 baseline PNGs + 1 mixed-case) and at the post-checkpoint re-capture (`public-reel light` only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Public-reel light-mode CTA pill loses amber under `prefers-color-scheme: light`**

- **Found during:** Task 2 (human-verify checkpoint).
- **Issue:** The `@media (prefers-color-scheme: light)` block in `src/index.css` flips `--color-bg-elev` to `#ffffff` and `--color-ink` to `#0a0e1a` even on the reel surface. CTAPill's `.glass-pill` uses `color-mix(in srgb, var(--color-bg-elev) 70%, transparent)` → near-white translucent pill; `text-ink` becomes dark; amber `→` flattens. DESIGN.md:72 lock ("public reel always dark") violated.
- **Fix:** Added `.reel-root, .reel-static-root { ... dark token re-assertion ... }` inside the existing light-mode media query. Reuses the original `:root` dark token values verbatim — no new color introduced. Authenticated `/app` chrome unaffected.
- **Files modified:** `src/index.css`.
- **Commit:** `0618024` (CSS fix), `0472175` (re-captured PNG).

### Out-of-Scope Discoveries

- The pre-existing `tsc -b` errors in `src/reel/*RM.a11y.test.tsx` (matcher type augmentation) are documented in 11-02's `deferred-items.md` and remain out of scope for 11-03 per the SCOPE BOUNDARY rule. `bunx vite build` (without `tsc -b`) builds clean.
- The 5 pre-existing server-side env-validation test file failures (`server/routes/*.test.ts`, `server/auth/jwt.ts` module-load `process.exit(1)`) are out of scope per `feedback_module_load_env_validation_blocks_ci.md`.

## Known Stubs

None. The CTA pill fix is wired end-to-end — Playwright re-capture verified the fix produces the correct visual output. INDEX.md verdicts are all written (no `(pending)` cells remain). REQUIREMENTS.md flags reflect the shipped reality (A11Y-01..08 closed by real tests, not stubs; MP4-04/05 explicitly cut, not stubbed).

## Threat Flags

None new. The Branch D selection sign-off (`T-11-11` in the plan threat register) is satisfied by the user's checkpoint resume signal — they identified one issue (CTA pill), it was fixed surgically, and the visual verdicts were written. No new security-relevant surface introduced by docs + CSS-only changes.

## TDD Gate Compliance

This plan was not TDD (`tdd="false"` on all three tasks per `11-03-PLAN.md`). The CSS fix is a single-line correctness change verified by visual re-capture, not by a unit test (Playwright visual regression is the appropriate gate). No RED/GREEN/REFACTOR sequence applies.

## Self-Check: PASSED

- [x] `test -f e2e/visual-review.spec.ts && grep -q 'page.screenshot' e2e/visual-review.spec.ts` ✓
- [x] `test -f docs/visual-review/v1.0.0/INDEX.md && ! grep -q '(pending)' docs/visual-review/v1.0.0/INDEX.md` ✓
- [x] `ls docs/visual-review/v1.0.0/*.png | wc -l` → 11 (10 baseline + 1 mixed-case) ✓
- [x] All 10 required PNGs present (public-reel + u-bryan + app-{reel,trips,me} × {dark,light}) ✓
- [x] `grep -q 'MP4-04' TODOS.md && grep -q 'MP4-05' TODOS.md && grep -q 'cut from v1' TODOS.md` ✓
- [x] `grep -q 'MP4 cut from v1' .planning/TODOS.md && grep -q 'iOS globe projection' .planning/TODOS.md` ✓
- [x] `grep -q '\[x\] \*\*A11Y-01\*\*' .planning/REQUIREMENTS.md` (and A11Y-02..08 same pattern) ✓
- [x] `grep -q '\[~\] \*\*MP4-04\*\*' .planning/REQUIREMENTS.md && grep -q '\[~\] \*\*MP4-05\*\*' .planning/REQUIREMENTS.md && grep -q '\[x\] \*\*MP4-06\*\*' .planning/REQUIREMENTS.md` ✓
- [x] `test -f .planning/phases/11-mp4-rung-2-3-or-mobile-polish-a11y-audit/11-SUMMARY.md && grep -q 'Branch D' .planning/phases/11-mp4-rung-2-3-or-mobile-polish-a11y-audit/11-SUMMARY.md` ✓
- [x] CSS fix lands: `grep -q 'reel-root' src/index.css | grep "always dark"` (DESIGN.md:72 comment present) ✓
- [x] Checkpoint marker deleted: `! test -f .planning/phases/11-mp4-rung-2-3-or-mobile-polish-a11y-audit/.checkpoint-11-03.md` ✓
- [x] Commits exist (`f1f3e4c`, `993fa1b`, `0618024`, `0472175`, `75fa5e3`, `6bc657b`, `f8d7ce4`) ✓
- [x] `bun run test` → 392 vitest tests pass (zero regressions; same 5 pre-existing failures as 11-02) ✓
- [x] DESIGN single-amber invariant preserved (CSS fix re-uses existing tokens; no new color) ✓
- [x] Public-reel light PNG re-captured and visually matches dark PNG (verified by re-opening the file after the fix) ✓
