---
phase: 03-app-shell
plan: 02
subsystem: app-shell
tags: [navigation, route-guard, ui-chrome, app-tree]
requires: [03-01]
provides:
  - BottomNav component (text-only, 3 tabs, amber active state)
  - RequireAuth component (Phase 4 auth seam, currently pass-through)
  - AppLayout wired with both
  - /app/ Reel↔BottomNav z-index collision resolved
affects:
  - src/routes/AppLayout.tsx
  - src/routes/AppReelRoute.tsx
  - src/reel/ChapterRail.tsx (added data-chapter-rail attribute)
  - src/index.css (added .app-reel-host scoped rule)
tech_stack_added: []
tech_stack_patterns:
  - "NavLink className-as-function for active-state styling"
  - "Marker class (.app-reel-host) + descendant selector for scoped CSS overrides"
key_files_created:
  - src/components/RequireAuth.tsx
  - src/components/BottomNav.tsx
key_files_modified:
  - src/routes/AppLayout.tsx
  - src/routes/AppReelRoute.tsx
  - src/reel/ChapterRail.tsx
  - src/index.css
decisions:
  - "Lucide NOT installed → BottomNav is text-only (per plan: install is a separate decision)"
  - "Used !important on .app-reel-host [data-chapter-rail] override because ChapterRail sets bottom via inline style; inline styles outrank class rules"
  - "Added data-chapter-rail attribute (not class) to ChapterRail outer div as the CSS hook"
  - "Used arbitrary value duration-[120ms] for tap feedback (Tailwind's default scale doesn't include 120)"
metrics:
  duration: 3 minutes
  completed: 2026-04-27
requirements_completed: [APP-01, APP-03]
---

# Phase 3 Plan 02: Bottom Nav + Auth Seam Summary

**One-liner:** Bottom nav (Reel | Trips | Me) wired into the `/app/*` tree via a new `<RequireAuth>` Phase-4 seam, with the `/app/` Reel↔nav z-index collision resolved by a scoped `.app-reel-host` CSS override that lifts the ChapterRail above the fixed 64px nav.

## What Was Built

1. **`src/components/RequireAuth.tsx`** — 13-line pass-through component. Phase 4 will replace the body with Auth0 session check + `<Navigate to="/" />` redirect. AppLayout already wraps `<Outlet />` in it, so Phase 4 needs zero route-tree churn.

2. **`src/components/BottomNav.tsx`** — Fixed bottom navigation (z-40, h-16) with three text-only NavLinks. Active tab uses the locked single amber-500 accent; inactive tabs are `text-ink-mute`. Each hit area is 64px tall (well above DESIGN.md's 44px minimum) with `pb-[env(safe-area-inset-bottom)]` for iOS home-indicator clearance. 120ms `active:opacity-70` tap feedback matches the `--motion-snap` design token.

3. **`src/routes/AppLayout.tsx`** — Now wraps `<Outlet />` in `<RequireAuth>` and renders `<BottomNav />`. Added `pb-16` so Trips/Me scrollable content does not slide under the fixed nav.

4. **`/app/` Reel ↔ BottomNav collision fix** — Three coordinated changes:
   - `AppReelRoute.tsx` wraps the Reel in `<div className="app-reel-host">`
   - `ChapterRail.tsx` gained a `data-chapter-rail` attribute on its outer div (one-line addition, no behavior change)
   - `index.css` adds `.app-reel-host [data-chapter-rail] { bottom: calc(4rem + max(env(safe-area-inset-bottom), 32px)) !important }`. Because `/` does not get the `.app-reel-host` wrapper, the public reel's rail anchor remains untouched.

## Verification

- `bun run typecheck` → exit 0
- `bun run test` → 85/85 tests pass (no regressions)
- `bun run build` → exit 0 (1.89s)

## Deviations from Plan

**1. [Rule 3 - Blocking] `duration-120` is not a default Tailwind utility**
- **Found during:** Task 2 self-review after writing BottomNav
- **Issue:** Tailwind's default scale jumps 100→150→200; `duration-120` would emit no CSS
- **Fix:** Used `duration-[120ms]` (arbitrary value) to guarantee the 120ms design token
- **Files modified:** `src/components/BottomNav.tsx`
- **Commit:** ad37986

**2. [Rule 1 - Bug] Plan's CSS rule would not override ChapterRail's inline `bottom` style**
- **Found during:** Task 3 implementation
- **Issue:** ChapterRail sets `bottom` via inline `style={{ bottom: '...' }}`. Inline styles outrank normal class selectors, so `.app-reel-host [data-chapter-rail] { bottom: ... }` would have no effect.
- **Fix:** Added `!important` to the override and documented the reason in a CSS comment. Override is scoped to `.app-reel-host`, so blast radius is limited to the `/app/` reel.
- **Alternative considered:** Refactor ChapterRail to read its bottom from a CSS variable. Rejected — too invasive for a layout-shell plan; would touch reel internals.
- **Files modified:** `src/index.css`
- **Commit:** 5c0bd5d

**3. ChapterRail attribute (not class)**
- The plan said "either `chapter-rail` class or `data-chapter-rail` attribute, pick whichever lands cleaner." Picked `data-chapter-rail` — clearly signals this is a hook for outside-the-component code, not a styling primitive.

## Authentication Gates

None.

## Self-Check: PASSED

- src/components/RequireAuth.tsx → FOUND
- src/components/BottomNav.tsx → FOUND
- src/routes/AppLayout.tsx (modified) → FOUND
- src/routes/AppReelRoute.tsx (modified) → FOUND
- src/reel/ChapterRail.tsx (modified) → FOUND
- src/index.css (modified) → FOUND
- Commit 84d7ca6 (RequireAuth) → FOUND
- Commit ad37986 (BottomNav) → FOUND
- Commit 5c0bd5d (AppLayout + collision fix) → FOUND
