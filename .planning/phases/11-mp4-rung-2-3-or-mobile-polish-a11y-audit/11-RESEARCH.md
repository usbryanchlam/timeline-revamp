# Phase 11: MP4 rung 2/3 OR mobile polish + a11y audit — Research

**Researched:** 2026-06-19
**Domain:** Accessibility audit tooling, mobile performance instrumentation, visual-review automation, real-device polish on an existing Vite 6 + React 19 + Vitest 4 + jsdom stack
**Confidence:** HIGH on tooling choices and integration patterns; MEDIUM on the precise threshold targets surviving a real iPhone; LOW only on iOS-Safari-specific GPU bugs that emulation can't reproduce

## Summary

Branch D was selected: MP4 is cut from v1 (MP4-06 satisfied by documenting the cut), and the weekend goes to mobile polish, an axe-core a11y audit, and an iPhone visual-review matrix. The codebase already has most of the seams Phase 11 needs — `Reel.tsx` has the `role="region"` container and an `aria-live="polite"` div (A11Y-03 + A11Y-04 partially implemented); `useGestureMachine.ts:261-274` already handles `←/→ ↑/↓ Space` (A11Y-08 partial — missing `Enter` for detail open); `HandlePickerModal.tsx` already has the close-watcher anti-modal-trap document-level keydown capture (A11Y-06 reference pattern); `suggestHandle.ts` is already scaffolded with the right algorithm. This phase wires those into a measurable audit pass plus net-new instrumentation (FPS hook, Lighthouse run, visual matrix).

**Primary recommendation:** Use `@chialab/vitest-axe@0.19.1` (peer deps `vitest ^3 || ^4`, `axe-core ^4.0.0`) for component-level axe runs against the **reduced-motion path** as the A11Y-01 hard gate, supplemented by a one-off `@axe-core/playwright@4.11.3` smoke against `bun run preview` for routes that depend on layout/CSS that jsdom can't compute. Use `lighthouse@13.4.0` directly (no `@lhci/cli` — overkill for a one-shot baseline) against `bun run preview --host` on port 4173 with mobile profile, persist JSON + HTML to `docs/lighthouse/v1.0.0-baseline.{json,html}`. Build `useFrameRate()` as a dev-only hook in `src/dev/useFrameRate.ts` gated on `import.meta.env.DEV && new URLSearchParams(location.search).has('fps')`. For the visual-review matrix, use Playwright iPhone 13 device emulation as the baseline (10 screenshots into `docs/visual-review/v1.0.0/`) AND tag the result with the explicit caveat that emulation does NOT exercise the deferred Phase 7 iOS GPU bugs (globe projection rendering) — a real-iPhone manual pass is still required.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| axe-core component runs (A11Y-01..07) | Test (Vitest/jsdom) | E2E (Playwright) | jsdom catches semantic violations cheaply; Playwright catches CSS/contrast violations jsdom can't compute |
| Lighthouse mobile audit (PERF-01/03/04) | Local CLI (`bun run preview`) | Manual capture | Single artifact per release; no CI integration in v1 |
| FPS instrumentation (Phase 7 UAT #1) | Browser/Client (dev-only hook) | — | rAF-delta sampling is a pure client-side concern; gated to never reach prod bundle |
| Auth0 nickname → handle suggestion (F8) | Browser/Client (`HandlePickerGate` + `suggestHandle.ts`) | — | Already scaffolded; only wiring + tests + UAT remain |
| aria-live announcement (A11Y-04) | Browser/Client (`Reel.tsx` liveRef effect) | — | Already partially implemented at Reel.tsx:64-69; needs `arrival-pulse` trigger alignment |
| Focus trap (A11Y-06) | Browser/Client (native `<dialog>` + document keydown) | — | HandlePickerModal pattern is the reference; PhotoDetailSheet + PhotoViewer need parity check |
| Keyboard controls (A11Y-08) | Browser/Client (`useGestureMachine.ts:261-274`) | — | ←/→/↑/↓/Space already exist; Enter (open detail) missing |
| Visual-review matrix | Test (Playwright) | Real device manual | Playwright catches layout regressions; manual catches GPU/Safari quirks |

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Branch selection:**
- **Branch D**: MP4 cut from v1; mobile polish + a11y audit replaces MP4-04/05/06 work.
- **MP4-06** is satisfied by documenting the cut in this phase's SUMMARY.md and `.planning/TODOS.md` (v2 backlog).

**Triage shortlist:**

1. **Lighthouse mobile audit on `bun run preview`**
   - Run mobile profile against the public reel page (`/`)
   - Capture and persist a baseline report (path: `docs/lighthouse/v1.0.0-baseline.json` or similar — planner to confirm location)
   - Acceptance: perf ≥ 90, LCP ≤ 2.5s, CLS ≤ 0.1 (matches **PERF-01**, **PERF-03**, **PERF-04**)
   - If thresholds miss: capture the diagnosis (LCP element, blocking resources) and triage fix vs. v2 deferral within this phase

2. **Instrumented iPhone FPS measurement for OrbitReel 60°/s orbit**
   - Closes Phase 7 deferred mobile UAT item #1 (iPhone 60FPS orbit sustain)
   - Add a dev-only FPS counter or rAF-delta sampler that runs during a single-city reel's orbit (REEL-08)
   - Measure on iPhone (real device); capture median + p95 FPS over the 8s orbit
   - Acceptance: median ≥ 55 FPS, p95 ≥ 50 FPS over the 8s window; if it misses, document the bottleneck and either tune or carry into v1.1

3. **HandlePickerModal "Claim" button pre-fill with Auth0-derived suggestion**
   - Closes Phase 8 finding F8
   - Source the suggestion from the Auth0 ID-token `nickname` or `email` local-part (planner to choose; reserved-word list from Phase 4 still applies)
   - Sanitize against the existing 26-entry reserved-word list and the handle regex; if sanitization yields empty, fall back to empty input
   - Acceptance: on first-time login with `users.handle IS NULL`, the picker input mounts with a non-empty suggestion that passes client-side validation, OR the input mounts empty if no clean suggestion exists; user can edit before submitting

4. **a11y audit sweep**
   - Tool: axe-core (via @axe-core/react or @axe-core/playwright — planner to choose based on testing setup; see RESEARCH)
   - Scope: `/` (public reel), `/u/:handle` (public per-handle reel), `/app/reel`, `/app/trips`, `/app/me`, `HandlePickerModal`, `PhotoDetailSheet`, `PhotoViewer`
   - Closes all 8 A11Y requirements (A11Y-01..A11Y-08 — see REQUIREMENTS.md for full text)
   - Acceptance: 0 axe-core violations on the reduced-motion path (A11Y-01 hard gate); manual keyboard walkthrough of "add a city" completes without mouse (A11Y-02); each remaining requirement either implemented or documented as "verified via existing code" with file:line evidence

5. **iPhone visual-review matrix**
   - Routes: `/`, `/u/:handle`, `/app/reel`, `/app/trips`, `/app/me`
   - Themes: light + dark (OS-level `prefers-color-scheme` toggle)
   - Capture: screenshots saved into `docs/visual-review/v1.0.0/` (planner to confirm path)
   - Acceptance: each route × theme combination has a saved screenshot AND a one-line verdict ("ok" / "issue: ..."); any "issue:" verdict either fixed in this phase OR captured into `.planning/TODOS.md` as a v1.1 follow-up

### Claude's Discretion

- Exact file paths for the FPS counter, Lighthouse baseline report, visual-review screenshots
- Specific axe-core wrapper choice (@axe-core/react for dev console vs. @axe-core/playwright for CI-style assertion)
- How to source the Auth0 suggestion (nickname vs. email local-part vs. both with fallback)
- Whether to split the 5 triage items into 2 plans or 3 plans (ROADMAP says 2-3, branch-dependent; planner decides based on dependency analysis)

**Tooling guardrails:**
- axe-core integration: prefer **dev-time / test-time** integration over runtime checks (no axe-core in production bundle)
- FPS instrumentation: dev-only, gated behind a query param or env flag (must NOT ship in the production bundle)
- Lighthouse: run against `bun run preview` (matches Phase 2 deferred check)
- Visual-review screenshots: real device preferred (iPhone), but a Playwright mobile-emulation fallback is acceptable if a real device is unavailable

### Deferred Ideas (OUT OF SCOPE)

- **MP4 client/GIF fallback** (MP4-04, MP4-05): cut from v1 per Branch D; revisit in v2.
- **Codebase map refresh**: already done in this session via `/gsd-map-codebase` — not a Phase 11 task.
- **Phase 7 mobile UAT item: iOS globe projection rendering** → deferred to v1.1 (visual polish, low-priority — note in TODOS.md)
- **Phase 7 mobile UAT item: Mixed-case URL resolution on deployed stack** → already addressed by lowercase normalization in Phase 7-02 (re-verify in visual-review matrix #5, no plan task needed)
- **Phase 8 findings F1–F7**: most resolved by UAT round v0.2.0–v0.2.4 — re-verify status in the planner step; only F8 (HandlePickerModal pre-fill) carries forward as triage #3.
- **Phase 5 housekeeping carry-overs** (cities.test.ts split, formatArrived extract, mapReadyTick refactor, marker diffing): not Phase 11 scope; carry into post-v1.0.0 tech-debt phase.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MP4-04 | Client `MediaRecorder` + canvas.captureStream(30) | Deferred to v2 — documented as cut in Branch D. SUMMARY.md will record the rationale; TODOS.md gets a v2 entry. No implementation. |
| MP4-05 | 10s GIF export fallback | Same — deferred to v2. |
| MP4-06 | If all three rungs fail, MP4 cut from v1 and shipped as v2 | **Closed by Branch D selection.** SUMMARY.md documents the cut; this is the "satisfied by documenting" path. |
| A11Y-01 | Reduced-motion path passes axe-core with 0 violations | `@chialab/vitest-axe` against `<ReducedMotionReel>` + `<OrbitReducedMotionReel>` + `<GlobeReducedMotionReel>` in jsdom; supplement with `@axe-core/playwright` smoke against `bun run preview` with `--emulated-media=reduce` for CSS-dependent rules |
| A11Y-02 | Keyboard-only "add a city" flow | Manual checklist runner against `/app/trips`: Tab to MapPicker, Tab+Enter to CityForm, fill, Tab to Save. `userEvent.keyboard()` test in `TripsRoute.test.tsx` can codify the path. |
| A11Y-03 | Reel container `role="region"` + `aria-label` | **Already implemented** at `src/reel/Reel.tsx:75-76`. Audit confirms also present in `OrbitReel`, `GlobeReel`, `ReducedMotionReel` — only `ReducedMotionReel.tsx:23` uses `<main>` without role+label (needs add). |
| A11Y-04 | Chapter transitions fire `aria-live="polite"` ("Kyoto, October 2024") | **Already implemented** at `Reel.tsx:64-69 + 105-110`. Research note: announcement fires on `state.chapterIndex` change — currently mid-flight, not on arrival. Re-trigger should align with `CHAPTER_FLY_DONE` to land on the same beat as `--ease-arrival`. |
| A11Y-05 | Photo `alt` from user captions; empty-alt if no caption | `PhotoCard.alt` already plumbed (`OrbitReel.tsx:25` sets `alt: ''` for public reel — needs `caption` plumbing). `ReducedMotionReel.tsx:79` uses `aria-label={p.alt}`. Verify alt propagates correctly via test. |
| A11Y-06 | Detail sheet focus trap + Esc closes | **HandlePickerModal: already correct** (native `<dialog>` + double-Esc workaround at `HandlePickerModal.tsx:60-82`). **PhotoDetailSheet: partial** — uses custom div modal (not `<dialog>`), Esc closes, but no actual focus trap (Tab can escape). **PhotoViewer: same** — Esc closes, but no Tab loop. Recommendation in pitfalls section. |
| A11Y-07 | Overlay text WCAG AA contrast on bright-photo worst case | Manual contrast check + ChapterOverlay has `.scrim-bottom` gradient (`ChapterOverlay.tsx:38`). Playwright + axe color-contrast rule on `bun run preview` confirms in-context. |
| A11Y-08 | Keyboard controls: ←/→ ↑/↓ Space Enter | **Partial**: `useGestureMachine.ts:261-274` handles `Space` (TOGGLE_PAUSED) + `Arrow*` (JUMP_CHAPTER). **Missing: Enter** (open detail sheet — needs new dispatch + handler). Note: current `←/→` jumps chapters, NOT scrubs ±1s as requirement says — flag for plan-time decision (scrubbing requires new state-machine event). |

## Standard Stack

### Core (verified via `npm view`, 2026-06-19)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@chialab/vitest-axe` | 0.19.1 (published 2026-02-25) | Vitest matcher for axe-core | Active fork of dead `vitest-axe@0.1.0` (4-year-old); peer deps `vitest ^3 || ^4` matches our 4.1.5; works with React 19 since rendering is RTL-driven, not axe-driven [VERIFIED: npm view] |
| `axe-core` | 4.12.1 | Underlying a11y engine | Industry-standard; required peer of `@chialab/vitest-axe` [VERIFIED: npm view] |
| `@axe-core/playwright` | 4.11.3 | Playwright integration for axe | Catches CSS-dependent violations (contrast, focus-visible) that jsdom cannot compute [CITED: medium.com/@echilaka — "jsdom doesn't compute real styles"] |
| `playwright` | 1.61.0 | E2E runner + iPhone emulation | Required peer for `@axe-core/playwright` and for visual-review screenshots [VERIFIED: npm view] |
| `lighthouse` | 13.4.0 | Mobile perf audit | Direct CLI is simpler than `@lhci/cli@0.15.1` for a one-shot baseline; no server-side report storage needed [VERIFIED: npm view] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@axe-core/react` | — | Dev-time console reporter | **DO NOT INSTALL** — does NOT support React 18+ per `@axe-core/react` README. Use vitest-axe in tests + axe DevTools browser extension for dev-time signal. [CITED: npmjs.com/package/@axe-core/react README] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@chialab/vitest-axe` | `vitest-axe` (chaance/vitest-axe@0.1.0) | Original is 4 years old, no Vitest 4 peer — the `@chialab` fork is the maintained line [VERIFIED: npm view] |
| `@chialab/vitest-axe` | `jest-axe` | Adds Jest runtime to a Vitest-only repo; no upside |
| Direct `lighthouse` CLI | `@lhci/cli` | LHCI is built for CI assertion + server-stored history; we want a single baseline artifact, not regression tracking yet — keep simple |
| Playwright iPhone emulation | Real iPhone Safari Web Inspector | Emulation is reproducible per release; real device is the source of truth for GPU bugs. Use BOTH. |

**Installation:**
```bash
bun add -d @chialab/vitest-axe axe-core @axe-core/playwright playwright lighthouse
# Then for Playwright iPhone emulation:
bunx playwright install webkit
```

**Version verification (run during planning to confirm currency):**
```bash
npm view @chialab/vitest-axe version time.modified
npm view @axe-core/playwright version
npm view lighthouse version
```

## Architecture Patterns

### System Architecture Diagram

```
                    Phase 11 Audit & Polish Pipeline
                    ─────────────────────────────────

┌─────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ A11y test path      │   │ Perf audit path      │   │ Visual review path   │
│ (Vitest + jsdom)    │   │ (Lighthouse CLI)     │   │ (Playwright WebKit)  │
└──────────┬──────────┘   └──────────┬───────────┘   └──────────┬───────────┘
           │                         │                          │
           ▼                         ▼                          ▼
  render(<ReducedMotionReel>) bun run preview --host    Playwright iPhone 13
  expect(await axe()).         localhost:4173            emulation
   toHaveNoViolations()        ──> lighthouse --emul     ──> page.goto(route)
                               -ated-form-factor=mobile     × {light, dark}
           │                         │                          │
           ▼                         ▼                          ▼
   Per-component pass        docs/lighthouse/             docs/visual-review/
   (CI-runnable assert)      v1.0.0-baseline.{json,html}  v1.0.0/{route}-{theme}.png
                              + thresholds script
           │                         │                          │
           └─────────────────────────┴──────────────────────────┘
                                     │
                                     ▼
                          VERIFICATION.md gate (Nyquist)
                          + SUMMARY.md MP4 cut record


                    Runtime FPS Sampling (separate dev-only path)
                    ─────────────────────────────────────────────

      ?fps=1 query param ──> useFrameRate() (gated DEV)
                              │
                              ▼
                         rAF delta sampling (8s window)
                              │
                              ▼
                         Median + p95 → small amber readout (top-left)
                              │
                              ▼
                         Real iPhone Safari Web Inspector reads from DOM
                         OR via console.table on demand
```

### Recommended File Layout

```
src/
├── dev/                          # NEW — dev-only instrumentation, tree-shaken in prod
│   ├── useFrameRate.ts           # rAF-delta sampler, DEV-gated
│   ├── useFrameRate.test.ts
│   └── FpsBadge.tsx              # Amber-themed readout, gated on ?fps=1
├── reel/
│   └── ReducedMotionReel.tsx     # ADD role="region" + aria-label (A11Y-03 fix)
├── components/
│   ├── PhotoDetailSheet.tsx      # ADD focus trap (A11Y-06 fix)
│   └── PhotoViewer.tsx           # ADD focus trap (A11Y-06 fix)
└── reel/
    └── Reel.tsx                  # ADD Enter→detail (A11Y-08 fix) — wire through dispatch

tests/                            # Existing — Vitest co-located convention
└── (axe tests are co-located, e.g., src/reel/Reel.a11y.test.tsx)

e2e/                              # NEW — Playwright tests
├── playwright.config.ts          # iPhone 13 device, WebKit, baseURL http://localhost:4173
├── a11y.spec.ts                  # @axe-core/playwright sweep across 5 routes
└── visual-review.spec.ts         # Screenshot matrix → docs/visual-review/v1.0.0/

docs/                             # Existing — release artifacts
├── lighthouse/
│   └── v1.0.0-baseline.{json,html}
└── visual-review/
    └── v1.0.0/
        ├── INDEX.md              # Route × theme verdict table
        ├── public-reel-dark.png
        ├── public-reel-light.png
        └── ... (8 more, 10 total)

scripts/
└── lighthouse-baseline.ts        # NEW — bunx lighthouse $URL --form-factor=mobile ...
                                  # (or: a simple shell script; planner decides)
```

### Pattern 1: vitest-axe component-level audit

**What:** Render a component with React Testing Library, run axe, assert no violations.
**When to use:** Every component that owns a route or modal — `ReducedMotionReel`, `OrbitReducedMotionReel`, `GlobeReducedMotionReel`, `HandlePickerModal`, `PhotoDetailSheet`, `PhotoViewer`.
**Example:**

```typescript
// @vitest-environment jsdom
// Source: https://github.com/chaance/vitest-axe README + @chialab fork docs
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from '@chialab/vitest-axe';
import { ReducedMotionReel } from './ReducedMotionReel';

expect.extend({ toHaveNoViolations });

describe('ReducedMotionReel a11y (A11Y-01 hard gate)', () => {
  it('has zero axe-core violations', async () => {
    const { container } = render(<ReducedMotionReel />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

**Setup file** (`vitest.config.ts` or `test/setup.ts`):

```typescript
// test/setup.ts — register matcher globally
import { expect } from 'vitest';
import { toHaveNoViolations } from '@chialab/vitest-axe';
expect.extend({ toHaveNoViolations });
```

Then in `vitest.config.ts`:
```typescript
test: { setupFiles: ['./test/setup.ts'], /* ...existing */ }
```

### Pattern 2: @axe-core/playwright route-level audit

**What:** Drive a real browser to the preview server, run axe with full CSS computation, assert.
**When to use:** A11Y-07 contrast checks; any rule that depends on real layout/CSS variables.
**Example:**

```typescript
// e2e/a11y.spec.ts
// Source: https://www.npmjs.com/package/@axe-core/playwright
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes = ['/', '/u/bryan', '/app/reel', '/app/trips', '/app/me'];

for (const route of routes) {
  test(`${route} has no critical axe violations`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa']) // A11Y-07 contrast lives in wcag2aa
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
```

### Pattern 3: `useFrameRate()` dev-only hook

**What:** rAF-delta sampler, median + p95 over a configurable window, gated on `?fps=1`.
**When to use:** OrbitReel orbit-FPS measurement (Phase 7 UAT #1).
**Example:**

```typescript
// src/dev/useFrameRate.ts
// Source: design from latish.dev/blog/2026/05/27/measuring-performance-in-frontend-using-fps
// adapted for React 19 + percentile reporting.
import { useEffect, useRef, useState } from 'react';

interface Sample { fps: number; median: number; p95: number; sampleCount: number; }

export function useFrameRate(opts?: { windowMs?: number; enabled?: boolean }): Sample | null {
  const enabled = (opts?.enabled ?? true)
    && import.meta.env.DEV
    && (typeof location !== 'undefined' && new URLSearchParams(location.search).has('fps'));
  const windowMs = opts?.windowMs ?? 8000;

  const [sample, setSample] = useState<Sample | null>(null);
  const samplesRef = useRef<number[]>([]);
  const lastRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    lastRef.current = performance.now();
    const start = lastRef.current;

    const tick = (now: number) => {
      if (!alive) return;
      const delta = now - lastRef.current;
      lastRef.current = now;
      if (delta > 0) samplesRef.current.push(1000 / delta);

      if (now - start >= windowMs && samplesRef.current.length > 0) {
        const sorted = [...samplesRef.current].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
        const p95 = sorted[Math.floor(sorted.length * 0.05)] ?? 0; // 5th = bottom 5%, i.e. p95-low
        setSample({
          fps: Math.round(1000 / delta),
          median: Math.round(median),
          p95: Math.round(p95),
          sampleCount: samplesRef.current.length,
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  }, [enabled, windowMs]);

  return sample;
}
```

```typescript
// src/dev/FpsBadge.tsx — DEV-only readout component (auto-removed in prod)
import { useFrameRate } from './useFrameRate';

export function FpsBadge() {
  if (!import.meta.env.DEV) return null;
  const s = useFrameRate();
  if (!s) return null;
  return (
    <div
      aria-hidden="true"
      className="fixed top-2 left-2 z-[100] rounded-md bg-bg-elev/80 px-2 py-1 text-[10px] text-amber-400 tabular-nums backdrop-blur"
    >
      {s.fps} fps · med {s.median} · p95-low {s.p95} · n={s.sampleCount}
    </div>
  );
}
```

**Tree-shaking guarantee:** `import.meta.env.DEV` is replaced at build time by Vite with `false` in `vite build`; the entire body of the hook becomes unreachable and Rollup/esbuild drops it. The `<FpsBadge />` import itself can be conditionally rendered (`{import.meta.env.DEV && <FpsBadge />}`) — Rollup eliminates the module from the production bundle entirely when the DEV branch is dead-coded out. Add a build-time grep guard in the verification step: `grep -c "useFrameRate" dist/assets/*.js` should be 0.

### Pattern 4: Lighthouse baseline against `bun run preview`

**What:** One-shot mobile audit, JSON + HTML artifacts.
**When to use:** v1.0.0 launch baseline; PERF-01/03/04 evidence.

```bash
# scripts/lighthouse-baseline.sh
#!/usr/bin/env bash
set -euo pipefail

PORT=4173
URL="http://localhost:${PORT}/"
OUT_DIR="docs/lighthouse"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
PREFIX="${OUT_DIR}/v1.0.0-baseline"

# Start preview server in background, wait for port
bun run preview --host --port "${PORT}" &
PREVIEW_PID=$!
trap "kill ${PREVIEW_PID}" EXIT

# Wait for preview to be ready (max ~30s)
until curl -s "${URL}" > /dev/null; do sleep 0.5; done

mkdir -p "${OUT_DIR}"

bunx lighthouse "${URL}" \
  --form-factor=mobile \
  --screenEmulation.mobile \
  --throttling.cpuSlowdownMultiplier=4 \
  --output=json --output=html \
  --output-path="${PREFIX}-${TIMESTAMP}" \
  --chrome-flags="--headless=new --no-sandbox" \
  --quiet

# Symlink "latest" for stable path reference in VERIFICATION.md
ln -sf "$(basename "${PREFIX}-${TIMESTAMP}.report.json")" "${PREFIX}.json"
ln -sf "$(basename "${PREFIX}-${TIMESTAMP}.report.html")" "${PREFIX}.html"
```

**Threshold script** (Node, called after Lighthouse run):

```typescript
// scripts/assert-lighthouse-thresholds.ts
import { readFileSync } from 'fs';
const report = JSON.parse(readFileSync('docs/lighthouse/v1.0.0-baseline.json', 'utf-8'));
const perf = report.categories.performance.score * 100;
const lcp = report.audits['largest-contentful-paint'].numericValue;
const cls = report.audits['cumulative-layout-shift'].numericValue;

const fails: string[] = [];
if (perf < 90) fails.push(`perf=${perf} < 90`);
if (lcp > 2500) fails.push(`LCP=${lcp}ms > 2500ms`);
if (cls > 0.1) fails.push(`CLS=${cls} > 0.1`);

if (fails.length) {
  console.error('Lighthouse thresholds FAIL:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log(`Lighthouse OK: perf=${perf} LCP=${lcp}ms CLS=${cls}`);
```

### Pattern 5: Auth0 nickname → handle pre-fill

**What:** Already scaffolded — wire it through `HandlePickerGate` → `HandlePickerModal` and add tests.
**When to use:** F8 closure (closes Phase 8 finding).

**Current state (already on disk):**
- `src/auth/suggestHandle.ts` — implements the sanitize+validate pipeline (nickname → email-local → given_name). Returns empty on failure.
- `src/auth/HandlePickerGate.tsx` — calls `suggestHandle` and passes to `HandlePickerModal` via `suggestedHandle` prop.
- `src/auth/HandlePickerModal.tsx:46-48` — receives `suggestedHandle`, initializes `input` state with it.

**What's missing (Phase 11 work):**
- Tests for `suggestHandle.test.ts` (no test file currently exists — verify with `ls src/auth/`)
- Tests for `HandlePickerGate.tsx` integration (passes Auth0 user through to modal)
- UAT verification on real Auth0 login (the algorithm is in place; we just need to confirm it works against Bryan's actual Auth0 `nickname` claim)

**Sanitize algorithm (already implemented at `suggestHandle.ts:51-60`):**
```typescript
function sanitize(raw: string): string {
  const lowercased = raw.toLowerCase();
  const dashed = lowercased.replace(/[._\s]+/g, '-');
  const stripped = dashed.replace(/[^a-z0-9-]/g, '');
  const collapsed = stripped.replace(/-+/g, '-');
  const trimmed = collapsed.replace(/^-+|-+$/g, '');
  if (trimmed.length === 0) return '';
  const truncated = trimmed.slice(0, 20);
  return truncated.replace(/-+$/, ''); // re-trim trailing hyphen after truncate
}
```

Final candidate is then run through `validateHandle()` from `@server/handles/validate.js` (single source of truth; same rules as the POST /api/me/handle endpoint, including the 26-entry reserved set).

### Pattern 6: aria-live arrival-pulse alignment

**What:** Move the announcement trigger from `state.chapterIndex` change to `CHAPTER_FLY_DONE`.
**Why:** Currently `Reel.tsx:62-69` writes to the `aria-live` div on every chapter index change — which means VoiceOver announces "Kyoto, October 2024" the instant the user swipes, before the camera lands. The arrival pulse is the brand beat; the announcement should land on the same beat.

**Recommended change:**
```typescript
// Subscribe to state.name transitions, not chapterIndex
useEffect(() => {
  if (state.name !== 'IDLE' && state.name !== 'PAUSED') return; // only "landed" states
  const c = chapters[state.chapterIndex];
  if (c && liveRef.current) {
    liveRef.current.textContent = `${c.name}, ${formatMonthYear(c.arrivedAt)}`;
  }
}, [state.name, state.chapterIndex, chapters]);
```

The state machine already transitions through `CHAPTER_SWIPE → CHAPTER_FLY_DONE → IDLE`, so gating on `state.name === 'IDLE' | 'PAUSED'` fires exactly when the photo card has landed.

### Anti-Patterns to Avoid

- **`@axe-core/react` in dev** — Does NOT support React 18+. Performance tanks even when it does. Use vitest-axe + axe DevTools browser extension instead. [CITED: npmjs.com/package/@axe-core/react]
- **Skipping the reduced-motion CSS emulation in Playwright a11y tests** — `prefers-reduced-motion: reduce` swaps to `ReducedMotionReel.tsx`, which is the A11Y-01 hard gate. Without `page.emulateMedia({ reducedMotion: 'reduce' })` you're auditing the wrong tree.
- **Trusting jsdom for contrast checks** — jsdom doesn't compute styles. axe's `color-contrast` rule will silently no-op. Use Playwright for any rule that touches CSS-computed values.
- **Adding axe-core to the runtime bundle** — only `import.meta.env.DEV`-gated, or test-only via `devDependencies`. Verify with `grep -c axe-core dist/assets/*.js` → 0.
- **Bundling Playwright into Vitest** — Playwright is e2e; keep it in `e2e/` with its own `playwright.config.ts` and a separate `bun run e2e` script (not part of `bun run test`).
- **Running Lighthouse against `bun run dev`** — dev server has unminified code + no chunking. Must use `bun run preview` (port 4173 by Vite default).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| axe-core integration with Vitest | Custom assertion wrapper | `@chialab/vitest-axe` | Already has the matcher, type defs, ESM/CJS dual export, axe-core peer pin |
| Mobile-emulated Lighthouse run | Manual DevTools capture | `lighthouse` CLI | Reproducible, scriptable, JSON output for thresholds |
| iPhone device emulation for screenshots | Custom Puppeteer + viewport math | Playwright `devices['iPhone 13']` | DPR, UA, viewport, touch all set in one line |
| Focus trap for PhotoDetailSheet | Hand-rolled Tab loop | Convert to native `<dialog>` (like HandlePickerModal) + document keydown capture | Native dialog gives focus trap free; keydown capture handles close-watcher landmine |
| FPS readout UI library | Pull in a stats.js or react-fps | The `useFrameRate` hook above + 1-line `<FpsBadge />` | Avoids new prod-bundle risk; tree-shaken |

**Key insight:** This phase is mostly **integration** of well-trodden libraries, not building. The temptation to write a custom a11y checker, custom Lighthouse wrapper, or custom FPS lib is the bug — every commodity tool here has a working CLI/SDK.

## Common Pitfalls

### Pitfall 1: jsdom can't compute styles → false-negative axe contrast violations
**What goes wrong:** vitest-axe in jsdom reports 0 violations, but Playwright + axe in WebKit finds contrast failures.
**Why it happens:** jsdom implements DOM API but no layout/CSS engine. axe's `color-contrast` rule skips when computed style returns the empty string.
**How to avoid:** Run BOTH the jsdom vitest-axe pass (cheap, fast, covers semantics) AND a Playwright pass (slow, covers CSS-dependent rules). The A11Y-01 hard gate requires 0 violations in BOTH.
**Warning signs:** Vitest a11y suite green; manual inspection finds amber-on-white at < 4.5:1.

### Pitfall 2: PhotoDetailSheet + PhotoViewer don't actually trap focus
**What goes wrong:** Both modals use a `<div role="dialog" aria-modal="true">` instead of a real `<dialog>`. Tab cycles through focusable elements behind the modal scrim, breaking A11Y-06.
**Why it happens:** `aria-modal="true"` is a hint to AT, not a focus-trap enforcement. Browsers don't honor it for Tab order.
**How to avoid:** Either (a) convert both to native `<dialog>` with `showModal()` (matches HandlePickerModal pattern, gives focus trap + Esc free) and add the document-level Esc keydown-capture workaround from the close-watcher memory, OR (b) implement a manual focus trap with first/last sentinel buttons. Recommendation: option (a) for consistency with the existing modal pattern.
**Warning signs:** Playwright a11y test passes (axe doesn't check focus trap), but manual Tab-cycle test escapes the sheet.

### Pitfall 3: Reduced-motion path missing role="region"
**What goes wrong:** A11Y-03 says reel container is `role="region"` with `aria-label`. `Reel.tsx:75-76` has it. `ReducedMotionReel.tsx:23` uses `<main>` only — `<main>` has implicit `role="main"`, NOT `role="region"`. axe reports a violation.
**Why it happens:** Reduced-motion path was built before the A11Y-03 requirement was locked.
**How to avoid:** Add `role="region" aria-label="Travel reel (reduced motion)"` to the `<main>` element. Same for `OrbitReducedMotionReel`, `GlobeReducedMotionReel`.
**Warning signs:** axe rule `landmark-unique` or `region` violation against reduced-motion path.

### Pitfall 4: aria-live announcement fires mid-flight, not on arrival
**What goes wrong:** `Reel.tsx:62-69` writes to the live region on every `state.chapterIndex` change — the moment the user swipes, before the camera lands. VoiceOver announces "Kyoto" while still flying away from Tokyo.
**Why it happens:** Effect deps are `[state.chapterIndex, chapters]`, not `[state.name, state.chapterIndex, chapters]`.
**How to avoid:** Gate on `state.name === 'IDLE' || state.name === 'PAUSED'` (the "landed" states). See Pattern 6 above. The arrival pulse and the announcement become the same beat — that IS the brand.
**Warning signs:** Real-device VoiceOver UAT reports announcement leading the photo card.

### Pitfall 5: Lighthouse measuring `bun run dev` instead of `bun run preview`
**What goes wrong:** Perf score < 90 because dev server emits unminified, unchunked, source-mapped code.
**Why it happens:** Easy to muscle-memory `bun run dev` instead of `bun run preview`.
**How to avoid:** Scripted runner that starts `bun run preview` explicitly, waits for port 4173, asserts URL responds before launching Chrome.
**Warning signs:** LCP > 5s, perf < 50, "main bundle 8 MB" in the report.

### Pitfall 6: ?fps=1 query param shipped to production
**What goes wrong:** A curious user appends `?fps=1` to the production URL; the amber FPS badge appears. Brand polish broken.
**Why it happens:** Either the DEV gate is missing or the dead-code-elimination doesn't trigger (e.g., `if (DEV)` instead of `import.meta.env.DEV` literal).
**How to avoid:** Use the `import.meta.env.DEV` literal (Vite replaces with `false` at build time → Rollup eliminates). Add a build-time grep guard: `grep -c "useFrameRate\|FpsBadge" dist/assets/*.js` must be 0. Wire into the verification step.
**Warning signs:** Anyone can see the FPS badge on `https://timeline.bryanlam.dev/?fps=1`.

### Pitfall 7: Playwright iPhone emulation ≠ real iPhone for GPU bugs
**What goes wrong:** Visual-review matrix passes in Playwright; real iPhone Safari shows globe-projection rendering artifacts (Phase 7 deferred item).
**Why it happens:** Playwright WebKit on macOS uses macOS's graphics stack; iOS Safari uses Metal on Apple GPU. Two different rendering paths.
**How to avoid:** Treat Playwright matrix as a **regression baseline**, not a substitute for real-device QA. Document this caveat in `docs/visual-review/v1.0.0/INDEX.md`. Carry "iOS globe projection rendering" as a v1.1 TODOS.md entry per deferred decision.
**Warning signs:** Matrix green; UAT round opens with a globe rendering bug.

### Pitfall 8: vitest setup file not loaded → matcher missing
**What goes wrong:** `expect(results).toHaveNoViolations()` throws `is not a function`.
**Why it happens:** The matcher must be registered via `expect.extend()` before the assertion. If using a setup file, `vitest.config.ts` must declare it via `test.setupFiles`.
**How to avoid:** Either inline `expect.extend({ toHaveNoViolations })` at the top of each a11y test file (3 files × 1 line), or register globally in `test/setup.ts` and add `setupFiles: ['./test/setup.ts']` to `vitest.config.ts`. The latter scales better.
**Warning signs:** First a11y test fails with `expect(...).toHaveNoViolations is not a function`.

## Code Examples

### Render-a-component + axe (A11Y-01)
```typescript
// src/reel/ReducedMotionReel.a11y.test.tsx
// @vitest-environment jsdom
// Source: github.com/chaance/vitest-axe README pattern + @chialab fork docs
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from '@chialab/vitest-axe';
import { ReducedMotionReel } from './ReducedMotionReel';

describe('ReducedMotionReel — A11Y-01 hard gate', () => {
  it('renders with zero axe-core violations', async () => {
    const { container } = render(<ReducedMotionReel />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

### Playwright a11y route sweep
```typescript
// e2e/a11y.spec.ts
// Source: npmjs.com/package/@axe-core/playwright official example
import { test, expect, devices } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ ...devices['iPhone 13'] });

const ROUTES = ['/', '/u/bryan', '/app/reel', '/app/trips', '/app/me'] as const;

for (const route of ROUTES) {
  test(`${route} (reduced-motion) — no axe wcag2aa violations`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}
```

### Visual-review screenshot matrix
```typescript
// e2e/visual-review.spec.ts
import { test, devices } from '@playwright/test';

test.use({ ...devices['iPhone 13'] });

const ROUTES = ['/', '/u/bryan', '/app/reel', '/app/trips', '/app/me'] as const;
const THEMES = ['dark', 'light'] as const;

for (const route of ROUTES) {
  for (const theme of THEMES) {
    test(`screenshot ${route} ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const slug = route === '/' ? 'public-reel' : route.replace(/[/:]/g, '-').replace(/^-/, '');
      await page.screenshot({
        path: `docs/visual-review/v1.0.0/${slug}-${theme}.png`,
        fullPage: false, // iPhone viewport only — matches what a user sees
      });
    });
  }
}
```

### Playwright config for iPhone emulation
```typescript
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['iPhone 13'],
  },
  webServer: {
    command: 'bun run preview --host --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
```

### Keyboard "add a city" path test (A11Y-02)
```typescript
// src/routes/TripsRoute.a11y.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// ... + necessary providers/wrappers
import { TripsRoute } from './TripsRoute';

describe('TripsRoute — A11Y-02 keyboard-only add-city', () => {
  it('completes add-city flow without mouse', async () => {
    const user = userEvent.setup();
    render(<TripsRoute /* ...providers */ />);
    // Tab to map → Enter to pick a location → form opens
    await user.keyboard('{Tab}{Enter}');
    // Tab to name input → type → Tab to date → type → Tab to Save → Enter
    // ... full sequence
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@axe-core/react` for dev-console signals | Browser-extension (axe DevTools) + vitest-axe in tests | React 18 release (Mar 2022) | `@axe-core/react` never gained React 18+ support. Tests run in Vitest; dev signal moved to the extension. [CITED: npmjs.com/package/@axe-core/react] |
| `jest-axe` | `@chialab/vitest-axe` (in Vitest projects) | Vitest 1.0+ ecosystem maturation | Same API, no Jest runtime dragged in. Original `chaance/vitest-axe` is unmaintained; `@chialab` fork is the active line. [VERIFIED: npm view] |
| `@lhci/cli` for a baseline | Direct `lighthouse` CLI for one-shot | LHCI is built for CI history; overkill for single baseline | Use LHCI later if regression detection becomes a priority. v1 just needs a baseline artifact. |
| `axe-playwright` | `@axe-core/playwright` | 2022+ | Deque-official package; better-maintained than the community `axe-playwright`. Both work; prefer official. |

**Deprecated/outdated:**
- `@axe-core/react`: No React 18+ support; use axe DevTools browser extension instead. [CITED: npmjs.com README]
- `vitest-axe@0.1.0` (chaance/vitest-axe): 4 years old, no Vitest 4 peer dep. Use `@chialab/vitest-axe@0.19.x` instead. [VERIFIED: npm view]

## Runtime State Inventory

Not applicable — Phase 11 is greenfield instrumentation + a11y audit + visual matrix. No renames, refactors, or migrations. No databases, OS-registered tasks, secrets renames, or build-artifact renames involved.

**Nothing found in any category — verified by scope review.** Phase 11 adds new files (`src/dev/`, `e2e/`, `docs/lighthouse/`, `docs/visual-review/`) and edits existing files in place. No persistence layer is touched.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Median ≥ 55 FPS, p95 ≥ 50 FPS over 8s is the right OrbitReel target | User Constraints (locked decision from CONTEXT.md, but planner should confirm) | If iPhone hits 45 fps median, we may need to either lower target or downgrade OrbitReel quality. Worth verifying user is happy with 55 as the floor. |
| A2 | LCP ≤ 2.5s on `bun run preview` Lighthouse mobile profile is achievable without additional work | Lighthouse threshold assertion | Phase 2 dynamic-import + LCP poster were designed to hit this. If the baseline misses, the plan needs an explicit "diagnose + fix or defer" task. The CONTEXT already accepts this — flagged here for visibility. |
| A3 | Real iPhone is available for UAT during Phase 11 weekend | Visual-review matrix + FPS measurement | If no real device available, FPS measurement can't be completed and visual matrix degrades to emulation-only (which doesn't catch the iOS GPU bugs). Carry forward to v1.1 if needed. |
| A4 | Playwright WebKit installed via `bunx playwright install webkit` is sufficient — no Chromium needed for the matrix | Stack table | Playwright iPhone emulation runs on WebKit. Chromium is only needed if we wanted to cross-browser test, which isn't in scope. |
| A5 | The `?fps=1` query param convention follows the `?signup=1` precedent and is safe | Pattern 3 | Verified: existing precedent in `RequireAuth.tsx` (UAT v0.2.2). No conflict with other query params. |
| A6 | `@chialab/vitest-axe` works with React 19 even though it doesn't claim React-version peer | Standard Stack | Verified by reasoning: vitest-axe operates on the rendered DOM output of RTL, not on React internals. RTL has React 19 support. Risk is LOW but worth running a smoke test before locking. |

**Resolution path for A2/A3:** Both should be discussed in the plan-time discuss-phase if the planner decides — they're locked acceptance criteria per CONTEXT.md so the planner should treat them as targets and design the "what if it misses" branch into the plan.

## Open Questions

1. **A11Y-08 `←/→` semantics: scrub vs. jump?**
   - What we know: REQUIREMENTS.md says `←/→ scrub ±1s, ↑/↓ chapter prev/next`. Current code does `←/→ JUMP_CHAPTER` (`useGestureMachine.ts:265-273`).
   - What's unclear: Does scrubbing make sense for a reel without continuous playback time? "Scrub ±1s" maps weakly onto a discrete-chapter model. If we honor the spec literally, we need a `SCRUB` event in the state machine.
   - Recommendation: planner should propose interpretation (option A: keep current `←/→ = jump`, document spec deviation; option B: implement scrub via animating the scrub cursor on `state.scrubT` ±0.1 for 1s of dwell). Decide in discuss-phase before locking the task.

2. **PhotoDetailSheet: convert to native `<dialog>` or keep custom modal?**
   - What we know: Custom modal currently uses `<div role="dialog">` (no focus trap). Native `<dialog>` would give focus trap free + match HandlePickerModal.
   - What's unclear: Conversion may have visual side-effects (backdrop, m-auto centering). Need to verify the existing responsive layout (bottom-sheet on mobile, centered modal on md+) survives.
   - Recommendation: planner picks native `<dialog>` as the default; if visual regressions surface during the task, fall back to a manual focus-trap component (first/last sentinel pattern).

3. **Should visual-review matrix be 5×2=10 screenshots or 5×2×(portrait+landscape)=20?**
   - What we know: CONTEXT.md says "5 routes × 2 themes = 10 screenshots."
   - What's unclear: iPhone is mobile-first; landscape isn't a design surface. But iPad portrait differs from iPhone portrait.
   - Recommendation: stick with 10 (iPhone portrait, light+dark). Optionally add iPad portrait as 5 more if planner sees budget. CONTEXT spec wins.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `bun` | Test runner, preview server | ✓ (assumed; v1.3.12 in CI per TESTING.md) | 1.3.12+ | — |
| `node` | Lighthouse CLI runtime | ✓ (Node 24 in CI per UAT v0.2.4) | 24.x | — |
| Chrome / Chromium | `lighthouse` CLI | ✓ on dev workstation | system | `--chrome-flags="--headless=new"` |
| `playwright` browsers (WebKit) | E2E + visual-review + a11y route sweep | ✗ (not installed yet) | — | `bunx playwright install webkit` (one-time, ~150 MB) |
| Real iPhone | FPS measurement (Triage #2), final visual-review pass | Assumed available (Bryan owns one — Phase 7 UAT was on iPhone) | — | If unavailable: Playwright WebKit emulation for visual matrix; FPS measurement carries to v1.1 |
| mkcert + .dev/certs/ | iPhone LAN HTTPS dev for Auth0 | ✓ per memory `feedback_auth0_https_iphone_dev.md` | — | — |

**Missing dependencies with no fallback:** None — all critical paths have either an install command or an acceptable fallback.

**Missing dependencies with fallback:**
- `playwright` WebKit browser — install on demand, no blocker.
- Real iPhone — emulation fallback noted; FPS measurement defers to v1.1 if no device.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 (existing) + @chialab/vitest-axe 0.19.1 (NEW) + Playwright 1.61.0 (NEW) |
| Config files | `vitest.config.ts` (existing — needs `setupFiles` addition); `e2e/playwright.config.ts` (NEW) |
| Quick run command | `bun run test src/reel/ReducedMotionReel.a11y.test.tsx` (single a11y test) |
| Full suite command | `bun run test && bun run e2e` (Vitest unit/a11y + Playwright e2e/a11y/visual) |
| Lighthouse command | `bun run scripts/lighthouse-baseline.sh && bun scripts/assert-lighthouse-thresholds.ts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| MP4-04 | Client MediaRecorder export (DEFERRED to v2) | doc-only | n/a (SUMMARY.md + TODOS.md entry) | ❌ Phase 11 task |
| MP4-05 | GIF export (DEFERRED to v2) | doc-only | n/a (SUMMARY.md + TODOS.md entry) | ❌ Phase 11 task |
| MP4-06 | MP4 cut from v1 — documented | doc-only | n/a (SUMMARY.md cut record + ROADMAP.md update) | ❌ Phase 11 task |
| A11Y-01 | 0 axe violations on reduced-motion | unit (vitest-axe) + e2e (Playwright + axe) | `bun run test src/reel/ReducedMotionReel.a11y.test.tsx` + `bunx playwright test e2e/a11y.spec.ts` | ❌ Wave 0 (NEW: `src/reel/ReducedMotionReel.a11y.test.tsx`, `src/reel/OrbitReducedMotionReel.a11y.test.tsx`, `src/reel/GlobeReducedMotionReel.a11y.test.tsx`, `e2e/a11y.spec.ts`) |
| A11Y-02 | Keyboard-only add-city flow | integration (vitest + userEvent.keyboard) | `bun run test src/routes/TripsRoute.a11y.test.tsx` | ❌ Wave 0 (NEW test file) |
| A11Y-03 | role="region" + aria-label | unit (vitest-axe `landmark-unique` + assertion) | included in A11Y-01 axe sweep | ❌ Wave 0 |
| A11Y-04 | aria-live "Kyoto, October 2024" on arrival | unit (Reel.tsx test) | `bun run test src/reel/Reel.ariaLive.test.tsx` | ❌ Wave 0 (NEW test file) |
| A11Y-05 | Photo alt from caption; empty-alt if none | unit (PhotoCycle + ChapterOverlay) | included in existing PhotoCycle.test.tsx (extend with alt assertions) | ⚠ partial — extend existing |
| A11Y-06 | Detail sheet focus trap + Esc | unit (vitest + userEvent.tab/keyboard) | `bun run test src/components/PhotoDetailSheet.focusTrap.test.tsx` + `PhotoViewer.focusTrap.test.tsx` | ❌ Wave 0 (NEW test files) |
| A11Y-07 | WCAG AA contrast on overlay | e2e (Playwright + axe `color-contrast` rule) | `bunx playwright test e2e/a11y.spec.ts` (subset) | ❌ Wave 0 — covered by A11Y-01 e2e file |
| A11Y-08 | ←/→ ↑/↓ Space Enter keyboard | unit (Reel keyboard test) | `bun run test src/reel/Reel.keyboard.test.tsx` | ❌ Wave 0 (NEW test file) |
| PERF-01/03/04 (Triage #1) | Lighthouse mobile perf ≥ 90, LCP ≤ 2.5s, CLS ≤ 0.1 | script (Lighthouse JSON parse) | `bun run scripts/lighthouse-baseline.sh && bun scripts/assert-lighthouse-thresholds.ts` | ❌ Wave 0 (NEW scripts) |
| FPS (Triage #2) | OrbitReel median ≥ 55 FPS, p95 ≥ 50 over 8s | manual (real iPhone) + unit (useFrameRate logic) | `bun run test src/dev/useFrameRate.test.ts` + manual readout from amber FPS badge on iPhone | ❌ Wave 0 (NEW hook + test) |
| F8 (Triage #3) | HandlePickerModal pre-fills from Auth0 | unit (suggestHandle + HandlePickerGate integration) | `bun run test src/auth/suggestHandle.test.ts` + UAT manual | ❌ Wave 0 (NEW `suggestHandle.test.ts`; algorithm code already exists) |
| Visual matrix (Triage #5) | 10 screenshots + INDEX.md verdicts | e2e (Playwright) + manual review | `bunx playwright test e2e/visual-review.spec.ts` | ❌ Wave 0 (NEW test file + INDEX.md) |

### Sampling Rate
- **Per task commit:** the targeted test for that task (e.g., a11y test for the A11Y-X task; useFrameRate.test.ts for the FPS task).
- **Per wave merge:** `bun run test` (full Vitest suite, ~415 + ~10 new = ~425 tests) + `bunx playwright test e2e/a11y.spec.ts` (a11y route sweep). Visual-review + Lighthouse are separate one-shot scripts.
- **Phase gate:** `bun run test && bunx playwright test && bun run scripts/lighthouse-baseline.sh && bun scripts/assert-lighthouse-thresholds.ts` all green; visual-review matrix INDEX.md exists with verdicts; SUMMARY.md records MP4-06 cut decision.

### Wave 0 Gaps
- [ ] `test/setup.ts` — register `expect.extend({ toHaveNoViolations })`; update `vitest.config.ts` to load it via `setupFiles`
- [ ] `e2e/playwright.config.ts` — Playwright config with iPhone 13 device + preview webServer
- [ ] `e2e/a11y.spec.ts` — Playwright a11y route sweep (5 routes × reduced-motion emulation)
- [ ] `e2e/visual-review.spec.ts` — Playwright screenshot matrix (5 routes × 2 themes = 10 PNGs)
- [ ] `scripts/lighthouse-baseline.sh` — preview server + Lighthouse run + symlinks
- [ ] `scripts/assert-lighthouse-thresholds.ts` — Node script parsing JSON, asserting perf/LCP/CLS
- [ ] `src/dev/useFrameRate.ts` + `src/dev/useFrameRate.test.ts` + `src/dev/FpsBadge.tsx`
- [ ] `src/reel/ReducedMotionReel.a11y.test.tsx` + same for `OrbitReducedMotionReel`, `GlobeReducedMotionReel`
- [ ] `src/reel/Reel.ariaLive.test.tsx` (A11Y-04 — arrival-pulse alignment)
- [ ] `src/reel/Reel.keyboard.test.tsx` (A11Y-08 — Space, Enter, arrows)
- [ ] `src/routes/TripsRoute.a11y.test.tsx` (A11Y-02 — keyboard add-city)
- [ ] `src/components/PhotoDetailSheet.focusTrap.test.tsx` (A11Y-06)
- [ ] `src/components/PhotoViewer.focusTrap.test.tsx` (A11Y-06)
- [ ] `src/auth/suggestHandle.test.ts` (F8 — algorithm coverage)
- [ ] `docs/visual-review/v1.0.0/INDEX.md` — route × theme verdict table (generated by visual-review.spec.ts? or hand-written)
- [ ] Framework install: `bun add -d @chialab/vitest-axe axe-core @axe-core/playwright playwright lighthouse && bunx playwright install webkit`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (touched indirectly via F8 suggestion) | Auth0 SDK already validates; suggestHandle only reads claims, doesn't trust them for auth |
| V3 Session Management | no | Phase 4 territory; not touched here |
| V4 Access Control | no | Public/private boundary already enforced in Phases 3+4 |
| V5 Input Validation | yes (suggestedHandle sanitization) | `validateHandle()` from `@server/handles/validate.js` is the single source of truth; suggestHandle.ts uses it |
| V6 Cryptography | no | Not touched |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Auth0 nickname injection (e.g., script tags in handle) | Tampering | `sanitize()` strips to `[a-z0-9-]` only; XSS-impossible character set |
| FPS badge leaking telemetry to prod | Information Disclosure | `import.meta.env.DEV` dead-code-elimination; build-time grep guard `dist/` |
| axe-core dev dependency shipping to prod | Bloat / Disclosure | `devDependencies` only; `vite build` excludes; grep guard |
| Lighthouse JSON containing secrets (cookies, env) | Disclosure | Use `--collect.settings.skipAudits` for any audit that reads cookies; we run unauthenticated against `/` so no cookie state |

## Sources

### Primary (HIGH confidence)
- npm view (verified 2026-06-19): `@chialab/vitest-axe@0.19.1`, `axe-core@4.12.1`, `@axe-core/playwright@4.11.3`, `playwright@1.61.0`, `lighthouse@13.4.0`, `@lhci/cli@0.15.1`, `vitest-axe@0.1.0` (legacy)
- `src/reel/Reel.tsx` (file inspected) — A11Y-03/04 partial implementation evidence
- `src/gestures/useGestureMachine.ts:261-274` (file inspected) — A11Y-08 partial keyboard handling evidence
- `src/auth/suggestHandle.ts` (file inspected) — F8 algorithm already scaffolded
- `src/auth/HandlePickerModal.tsx` (file inspected) — A11Y-06 reference pattern (native `<dialog>` + document keydown capture)
- `src/components/PhotoDetailSheet.tsx` + `PhotoViewer.tsx` (files inspected) — A11Y-06 gap (custom div modal, no focus trap)
- `package.json` (file inspected) — current versions of `@testing-library/react@16.3.2`, `jsdom@29.1.1`, `vitest@4.1.5`, `vite@7.0.0`, `react@19.0.0`

### Secondary (MEDIUM confidence)
- [Testing React Accessibility with Axe (Medium, Emmanuel Chilaka, May 2026)](https://medium.com/@echilaka/testing-react-accessibility-with-axe-dev-console-vitest-and-the-chrome-extension-e24b5ae623df) — jsdom contrast computation limitation
- [npm trends comparison](https://npmtrends.com/@axe-core/react-vs-jest-axe-vs-react-a11y-vs-react-axe) — adoption signals
- [@axe-core/playwright npm](https://www.npmjs.com/package/@axe-core/playwright) — official package + usage pattern
- [@axe-core/react npm](https://www.npmjs.com/package/@axe-core/react) — React 18+ unsupported notice
- [Unlighthouse / Lighthouse CI guide 2026](https://unlighthouse.dev/learn-lighthouse/lighthouse-ci) — assertion format for `maxNumericValue`
- [chaance/vitest-axe README](https://github.com/chaance/vitest-axe) — original API surface (now stale, but matcher API matches @chialab fork)

### Tertiary (LOW confidence — verify if used)
- [Measuring Performance in FrontEnd using FPS (Latish Sehgal, May 2026)](https://latish.dev/blog/2026/05/27/measuring-performance-in-frontend-using-fps/) — basic rAF FPS pattern (adapted for our hook design)
- General axe-core blog patterns — sanity-check against official docs

## Project Constraints (from CLAUDE.md)

From `./CLAUDE.md` and `~/CLAUDE.md`:

- **DESIGN.md is the source of truth for visual decisions** — always read before any UI change. Three locked risks: single amber accent, arrival-pulse signature easing (`cubic-bezier(0.16, 1, 0.3, 1)`), no empty-state illustrations on public surfaces. **Phase 11 implication:** FPS badge, focus rings, a11y test failure indicators MUST use amber (`--amber-500` dark / `--amber-600` light); no new colors introduced.
- **`/browse` skill from gstack for web browsing** (not relevant to this research; no browsing needed).
- **Skill routing:** "QA, test the site, find bugs → invoke qa" — not invoked here because research-phase output is not QA execution; the planner may choose to invoke `/qa` during execution.
- **TypeScript style (from `~/.claude/rules/typescript/coding-style.md`):**
  - Immutability via spread; no mutation of state objects (relevant to `useFrameRate` — uses `samplesRef.current.push()` on a mutable ref, which IS the React-idiomatic way; not a state mutation).
  - No `console.log` in production code; FPS badge writes to DOM, not console — compliant.
  - Zod for input validation at boundaries — not directly relevant (no new API surfaces).
- **TypeScript testing (from `~/.claude/rules/typescript/testing.md`):** Playwright for E2E — already aligned with this research's E2E choice.
- **Coding style (`~/.claude/rules/common/coding-style.md`):** files 200-400 lines typical, 800 max. All new files (useFrameRate.ts, FpsBadge.tsx, a11y test files) are well under.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — all versions verified via `npm view` 2026-06-19; React 19 + Vitest 4 + jsdom 29 peers confirmed.
- Architecture: **HIGH** — existing code inspected; integration seams (`Reel.tsx`, `HandlePickerModal.tsx`, `useGestureMachine.ts`, `suggestHandle.ts`) are well-defined.
- Pitfalls: **HIGH** — jsdom/CSS limitation, focus-trap gap, DEV-gate dead-code elimination, and arrival-pulse alignment are all evidence-backed (file inspection + cited sources).
- A11Y-08 scrub semantics: **MEDIUM** — REQUIREMENTS.md text and current code conflict; planner needs to decide.
- iOS GPU bugs (deferred Phase 7 #2): **LOW** — emulation can't catch; only real-device UAT can.

**Research date:** 2026-06-19
**Valid until:** 2026-07-19 (30 days; stack is stable, tools are well-established)

## RESEARCH COMPLETE

**Phase:** 11 - mp4-rung-2-3-or-mobile-polish-a11y-audit (Branch D)
**Confidence:** HIGH

### Key Findings
1. **`@chialab/vitest-axe@0.19.1`** is the only viable axe+Vitest path — original `vitest-axe@0.1.0` is dead (4 years stale, no Vitest 4 peer); `@axe-core/react` doesn't support React 18+. Combine with `@axe-core/playwright@4.11.3` for CSS-dependent rules (contrast, focus-visible) that jsdom can't compute.
2. **F8 (HandlePickerModal pre-fill) is mostly already done on disk.** `src/auth/suggestHandle.ts` implements the nickname/email-local/given_name fallback chain with full sanitize+validate pipeline; `HandlePickerGate.tsx` wires it through; `HandlePickerModal.tsx` accepts `suggestedHandle` and initializes input state. Phase 11 work is tests + UAT verification, not algorithm implementation.
3. **A11Y-03 already shipped on the motion path** (`Reel.tsx:75-76` has `role="region"` + `aria-label`); the **reduced-motion path is missing it** (`ReducedMotionReel.tsx:23` uses bare `<main>`). One-line fix per reduced-motion reel × 3 (regular, orbit, globe).
4. **A11Y-04 fires at the wrong moment.** `Reel.tsx:62-69` writes to aria-live on `chapterIndex` change (mid-swipe), not on `CHAPTER_FLY_DONE`. The fix is to gate the effect on `state.name === 'IDLE' || 'PAUSED'` so the announcement lands on the same beat as the arrival pulse — that IS the brand. Small but high-leverage change.
5. **PhotoDetailSheet + PhotoViewer don't actually trap focus.** Both use `<div role="dialog" aria-modal="true">` which is a hint, not an enforcement. HandlePickerModal's native `<dialog>` + document-level Esc keydown capture is the reference pattern to replicate (and reuses the close-watcher anti-modal-trap memory).
6. **FPS hook can be 100% tree-shaken from prod** via `import.meta.env.DEV` literal + `?fps=1` query param. Build-time grep guard against `dist/assets/*.js` codifies the guarantee.
7. **Playwright iPhone emulation ≠ real iPhone for GPU bugs** — the deferred Phase 7 "iOS globe projection rendering" item cannot be closed by the visual-review matrix; planner should leave it deferred to v1.1 per CONTEXT.

### File Created
`/Users/bryanlam/Workspaces/timeline-revamp/.planning/phases/11-mp4-rung-2-3-or-mobile-polish-a11y-audit/11-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All versions verified via `npm view` 2026-06-19; peers confirmed against package.json |
| Architecture | HIGH | Existing files inspected line-by-line; integration seams clear |
| Pitfalls | HIGH | jsdom limitation, focus-trap gap, aria-live timing, DEV-gate elimination — all evidence-backed |
| A11Y-08 scrub semantics | MEDIUM | REQUIREMENTS.md vs. current code conflict; needs planner decision |
| iOS GPU bugs (deferred #2) | LOW | Emulation can't catch; real-device UAT only |

### Open Questions for Planner
1. **A11Y-08 `←/→` semantics:** keep current `JUMP_CHAPTER` (document spec deviation) or implement actual scrub? Recommend discuss-phase decision before locking task.
2. **PhotoDetailSheet conversion to native `<dialog>`:** primary recommendation, but visual-layout regression risk. Plan a verification step.
3. **Visual matrix scope:** 5×2=10 baseline (CONTEXT-locked) vs. optional iPad portrait additions.

### Ready for Planning
Research complete. Planner can now create PLAN.md files. Recommended plan split (per ROADMAP "2-3 plans"):

- **11-01:** A11y audit infrastructure + reduced-motion fixes + focus-trap fixes (A11Y-01, 03, 04, 05, 06, 07; vitest-axe + Playwright a11y + ReducedMotionReel role/label fix + PhotoDetailSheet/PhotoViewer focus trap + Reel.tsx aria-live timing fix)
- **11-02:** Keyboard + F8 pre-fill + FPS instrumentation + Lighthouse baseline (A11Y-02, 08; F8 tests + UAT; useFrameRate hook + FpsBadge; Lighthouse scripts + threshold assertion)
- **11-03:** Visual-review matrix + MP4 cut documentation + SUMMARY.md (Playwright visual matrix; MP4-04/05/06 SUMMARY + TODOS.md entries; route × theme INDEX.md)

Alternatively, **2-plan split** if planner prefers tighter waves: combine 11-01 with most of 11-02 (a11y core work), keep visual matrix + MP4 documentation as 11-02.

Sources:
- [Testing React Accessibility with Axe (Medium, May 2026)](https://medium.com/@echilaka/testing-react-accessibility-with-axe-dev-console-vitest-and-the-chrome-extension-e24b5ae623df)
- [@axe-core/playwright npm](https://www.npmjs.com/package/@axe-core/playwright)
- [@axe-core/react npm (React 18+ unsupported notice)](https://www.npmjs.com/package/@axe-core/react)
- [@chialab/vitest-axe (active fork, v0.19.1)](https://www.npmjs.com/package/@chialab/vitest-axe)
- [chaance/vitest-axe GitHub (legacy v0.1.0)](https://github.com/chaance/vitest-axe)
- [Lighthouse CI assertions guide](https://unlighthouse.dev/learn-lighthouse/lighthouse-ci)
- [Measuring Performance in FrontEnd using FPS (Latish Sehgal, May 2026)](https://latish.dev/blog/2026/05/27/measuring-performance-in-frontend-using-fps/)
- [npm trends @axe-core/react vs jest-axe vs react-axe](https://npmtrends.com/@axe-core/react-vs-jest-axe-vs-react-a11y-vs-react-axe)
