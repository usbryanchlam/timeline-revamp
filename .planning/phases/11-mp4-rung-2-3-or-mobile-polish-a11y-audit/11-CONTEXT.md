# Phase 11: MP4 rung 2/3 OR mobile polish + a11y audit — Context

**Gathered:** 2026-06-19
**Status:** Ready for research + planning
**Source:** User-provided triage shortlist (in-chat, post-UAT-round closure)
**Branch chosen:** **Branch D** — MP4 cut from v1, weekend used for axe-core audit + iPhone/Pixel/iPad real-device polish

<domain>
## Phase Boundary

Phase 11 is the **mobile polish + a11y audit** branch of the Phase 11 fork. Phase 10 (MP4 server) remains on hold; MP4 is cut from v1 per requirement **MP4-06** and shipped as a v2 feature.

**In scope:**
- Lighthouse mobile audit on `bun run preview`
- Instrumented iPhone FPS measurement for the OrbitReel 60°/s orbit (closes Phase 7 deferred mobile UAT item #1)
- HandlePickerModal "Claim" button pre-fill with an Auth0-derived suggestion (closes Phase 8 finding F8)
- axe-core a11y audit sweep across `/`, `/u/:handle`, `/app/reel`, `/app/trips`, `/app/me`, including keyboard, screen-reader, focus management
- iPhone visual-review matrix across `/`, `/u/:handle`, `/app/*` in light + dark mode

**Out of scope:**
- MP4 rung 2 (client `MediaRecorder`) and rung 3 (10s GIF) — cut from v1; MP4-04/MP4-05 deferred to v2
- Any new feature work (this is polish + audit only)
- Codebase map refresh — handled separately via `/gsd-map-codebase` (already run in this session)

</domain>

<decisions>
## Implementation Decisions

### Branch selection (LOCKED)
- **Branch D**: MP4 cut from v1; mobile polish + a11y audit replaces MP4-04/05/06 work.
- **MP4-06** is satisfied by documenting the cut in this phase's SUMMARY.md and `.planning/TODOS.md` (v2 backlog).

### Triage shortlist (LOCKED — user provided)

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
   - Closes all 8 A11Y requirements:
     - **A11Y-01**: Reduced-motion path passes axe-core with 0 violations
     - **A11Y-02**: Keyboard-only path completes "add a city" flow without a mouse
     - **A11Y-03**: Reel container `role="region"` with `aria-label` (NOT `application`)
     - **A11Y-04**: Chapter transitions fire `aria-live="polite"` announcement (e.g., "Kyoto, October 2024")
     - **A11Y-05**: Photo overlays have `alt` from user-entered captions; empty-alt if no caption
     - **A11Y-06**: Detail sheet has focus trap, `Esc` closes
     - **A11Y-07**: Overlay text passes WCAG AA contrast on bright-photo worst case (gradient scrim)
     - **A11Y-08**: Keyboard controls: ←/→ scrub ±1s, ↑/↓ chapter prev/next, Space play/pause, Enter open detail
   - Acceptance: 0 axe-core violations on the reduced-motion path (A11Y-01 hard gate); manual keyboard walkthrough of "add a city" completes without mouse (A11Y-02); each remaining requirement either implemented or documented as "verified via existing code" with file:line evidence

5. **iPhone visual-review matrix**
   - Routes: `/`, `/u/:handle`, `/app/reel`, `/app/trips`, `/app/me`
   - Themes: light + dark (OS-level `prefers-color-scheme` toggle)
   - Capture: screenshots saved into `docs/visual-review/v1.0.0/` (planner to confirm path)
   - Acceptance: each route × theme combination has a saved screenshot AND a one-line verdict ("ok" / "issue: ..."); any "issue:" verdict either fixed in this phase OR captured into `.planning/TODOS.md` as a v1.1 follow-up

### Tooling decisions (Claude's discretion within these constraints)
- axe-core integration: prefer **dev-time / test-time** integration over runtime checks (no axe-core in production bundle)
- FPS instrumentation: dev-only, gated behind a query param or env flag (must NOT ship in the production bundle)
- Lighthouse: run against `bun run preview` (matches Phase 2 deferred check)
- Visual-review screenshots: real device preferred (iPhone), but a Playwright mobile-emulation fallback is acceptable if a real device is unavailable

### Claude's Discretion
- Exact file paths for the FPS counter, Lighthouse baseline report, visual-review screenshots
- Whether to split the 5 triage items into 2 plans or 3 plans (ROADMAP says 2-3, branch-dependent; planner decides based on dependency analysis — researcher recommended 3-plan split)

### Post-research decisions (added 2026-06-19, after RESEARCH.md)

- **A11Y-08 arrow-key semantics (LOCKED)**: Keep current `←/→ = JUMP_CHAPTER` (prev/next chapter) behavior. Phase 11 edits `.planning/REQUIREMENTS.md` line 31 to reflect the shipped semantics (`←/→ chapter prev/next, ↑/↓ scrub ±1s` OR drop the `←/→ scrub` line). Rationale: gesture-machine semantics are already documented in code; conflating arrow-keys with scrub risks motion-coherence regression. Plan must include a REQUIREMENTS.md edit task.
- **Photo modals (LOCKED)**: Convert `PhotoDetailSheet` and `PhotoViewer` to native `<dialog>` (matches `HandlePickerModal` pattern). Reuse the close-watcher anti-modal-trap pattern (document-level keydown capture-phase listener + `cancel` preventDefault) from the project memory. Visual-layout regression must be verified via the visual-review matrix screenshots — flag any centering/backdrop drift.
- **axe-core toolchain (LOCKED via RESEARCH.md)**: `@chialab/vitest-axe@0.19.1` (active fork) + `@axe-core/playwright@4.11.3` for contrast/focus-visible rules that jsdom can't compute. `@axe-core/react` is OUT (no React 18+ support).
- **UI-SPEC.md (LOCKED)**: Skip — Phase 11 is polish, not new UI. Plans reference `DESIGN.md` directly. `--skip-ui` semantics applied to this run.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project requirements
- `.planning/REQUIREMENTS.md` — A11Y-01..08, PERF-01..05, MP4-04..06
- `.planning/ROADMAP.md` — Phase 11 section (line 240+), Branch D success criteria
- `.planning/STATE.md` — UAT Round table (v0.2.0..v0.2.4), Phase 7 deferred mobile UAT items, Phase 8 findings F1–F8

### Design contract
- `DESIGN.md` — single amber accent (`DESIGN.md:85-87`), public reel always dark (`DESIGN.md:72`), map pin rules (`DESIGN.md:159`, `:230`)

### Source-of-truth gstack docs
- `~/.gstack/projects/usbryanchlam-timeline-revamp/bryanlam-main-design-20260423-104825.md` — master plan
- `~/.gstack/projects/usbryanchlam-timeline-revamp/bryanlam-main-eng-review-test-plan-20260424-200544.md` — QA plan
- Repo snapshots: `docs/plan.md`, `docs/test-plan.md`

### Codebase map (refreshed 2026-06-19)
- `.planning/codebase/STACK.md`, `INTEGRATIONS.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`, `CONCERNS.md`

### Phase memory (project-local feedback)
- `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/feedback_dialog_double_esc.md` — Chromium close-watcher anti-modal-trap (relevant to A11Y-06 + HandlePickerModal focus trap)
- `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/feedback_mountedref_strictmode.md` — StrictMode mountedRef pattern
- `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/feedback_lazy_chunk_css.md` — lazy-chunk CSS race (relevant to Lighthouse CLS investigation)

### Existing implementation seams to respect
- `src/reel/Reel.tsx` — reel container (A11Y-03 `role="region"` target)
- `src/reel/ChapterRail.tsx` + `ChapterOverlay.tsx` — aria-live target (A11Y-04)
- `src/reel/PhotoCycle.tsx` / `PhotoDetailSheet.tsx` / `PhotoViewer.tsx` — alt-text source (A11Y-05) + focus trap (A11Y-06)
- `src/components/HandlePickerModal.tsx` — F8 pre-fill target
- `src/gestures/useGestureMachine.ts` + `stateMachine.ts` — keyboard controls (A11Y-08) target
- `src/reel/ReducedMotionReel.tsx` — A11Y-01 baseline path

</canonical_refs>

<specifics>
## Specific Ideas

- Lighthouse baseline matters as a v1.0.0 launch artifact — even if perf is already ≥ 90, capturing the baseline lets v1.1 detect regressions.
- FPS instrumentation should be a small reusable hook (e.g., `useFrameRate()`) gated behind `?fps=1` query param. Phase 8 already added `?signup=1` as a query-param-signal precedent.
- HandlePickerModal F8 pre-fill: the Auth0 `nickname` for Google-federated logins is often a name with spaces (e.g., "Bryan Lam"). Strip non-handle-valid chars, lowercase, truncate, validate.
- a11y audit: A11Y-01 (reduced-motion + 0 axe violations) is the hardest gate — run it on `prefers-reduced-motion: reduce` simulated via DevTools or a CSS media-query override during the test.
- Visual-review matrix: 5 routes × 2 themes = 10 screenshots. Worth a small index page (`docs/visual-review/v1.0.0/INDEX.md`) for at-a-glance comparison.

</specifics>

<deferred>
## Deferred Ideas

- **MP4 client/GIF fallback** (MP4-04, MP4-05): cut from v1 per Branch D; revisit in v2.
- **Codebase map refresh**: already done in this session via `/gsd-map-codebase` — not a Phase 11 task.
- **3 deferred Phase 7 mobile UAT items**:
  - iPhone 60FPS orbit sustain → **handled in Phase 11** (triage #2)
  - iOS globe projection rendering → deferred to v1.1 (visual polish, low-priority — note in TODOS.md)
  - Mixed-case URL resolution on deployed stack → already addressed by lowercase normalization in Phase 7-02 (re-verify in visual-review matrix #5, no plan task needed)
- **Phase 8 findings F1–F7**: most resolved by UAT round v0.2.0–v0.2.4 — re-verify status in the planner step; only F8 (HandlePickerModal pre-fill) carries forward as triage #3.
- **Phase 5 housekeeping carry-overs** (cities.test.ts split, formatArrived extract, mapReadyTick refactor, marker diffing): not Phase 11 scope; carry into post-v1.0.0 tech-debt phase.

</deferred>

---

*Phase: 11-mp4-rung-2-3-or-mobile-polish-a11y-audit*
*Context gathered: 2026-06-19 via user-provided triage shortlist*
