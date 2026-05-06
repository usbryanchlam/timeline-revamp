---
phase: 03-app-shell
plan: 03
subsystem: theme
tags: [theme, tokens, css, tailwind, prefers-color-scheme, design-system]
requires: []
provides:
  - "Light + dark theming via prefers-color-scheme media query"
  - "Reconciled amber tokens (matches DESIGN.md:85-87)"
  - "tailwind darkMode: 'media' (system-driven dark: variants)"
affects:
  - src/index.css
  - tailwind.config.ts
  - .planning/TODOS.md
tech-stack:
  added: []
  patterns:
    - "CSS-only OS-driven theming (no React context, no class-on-html, zero hydration cost)"
    - "Direct override of existing --color-* vars inside @media (prefers-color-scheme: light) — no semantic-alias layer"
key-files:
  created:
    - .planning/TODOS.md
  modified:
    - src/index.css
    - tailwind.config.ts
decisions:
  - "Direct --color-* override beats semantic-alias layer (no migration cost, ~30 fewer lines)"
  - "CSS media query beats ThemeProvider context for v1 (no JS, no flicker)"
  - "Reel surfaces (--color-bg-map and scrim rules) NOT themed — DESIGN.md:72 'public reel always dark'"
  - "Amber NOT themed — brand color, not theme color (amber-600 = #E8B040 already AA on white)"
  - "Manual toggle deferred to v2 with explicit 4-step plan recorded in .planning/TODOS.md"
metrics:
  duration: "~12 min"
  completed: 2026-04-27
  tasks: 3
  files: 3
---

# Phase 3 Plan 03: Light + Dark Theme Summary

OS-driven light/dark theming via `prefers-color-scheme` media query, with reel surfaces locked dark and pre-existing amber drift reconciled to DESIGN.md.

## What Shipped

- **Amber tokens reconciled (Task 1)** — `src/index.css` and `tailwind.config.ts` both now match DESIGN.md:85-87 exactly: amber-400 = `#FFE4A0`, amber-500 = `#FFD470`, amber-600 = `#E8B040`. The drift values (`#F5B83A`, `#C28A1E`) are gone from the entire src tree (`grep -r` returns zero).
- **Light-mode chrome overrides (Task 2)** — `src/index.css` gains an `@media (prefers-color-scheme: light)` block inside `@layer base` that overrides six chrome tokens directly: `--color-bg`, `--color-bg-elev`, `--color-ink`, `--color-ink-dim`, `--color-ink-mute`, `--color-line`. Plus `:root` `color-scheme` flips from `dark` to `light dark` (UA hint). Both scrim rules (`.scrim-bottom`, `.scrim-top`) annotated as "always dark per DESIGN.md:72". `--color-bg-map` and `--color-amber-*` intentionally NOT in the override block (comments in code explain why).
- **Tailwind darkMode: 'media' (Task 3)** — One-line config change makes `dark:` variants resolve via OS preference, no class on `<html>`, no JS bootstrap. `main.tsx` and `index.html` untouched.
- **Deferred manual-toggle documented** — `.planning/TODOS.md` created with a 4-step v2 pickup plan (`darkMode: ['class', '[data-theme="dark"]']` + `ThemeProvider` + `ThemeToggle` + pre-hydration bootstrap).

## Key Files

### Modified

- `src/index.css` (+23 / −1)
  - Lines 13-15: amber tokens reconciled to DESIGN.md
  - Line 30: `color-scheme: dark` → `color-scheme: light dark`
  - Lines 33-51: new `@media (prefers-color-scheme: light)` block (chrome-only overrides)
  - Lines 80, 90: scrim rule comments ("always dark per DESIGN.md:72")
- `tailwind.config.ts` (+4 / −3)
  - Line 6 (new): `darkMode: 'media',`
  - Lines 25-27: amber values reconciled to DESIGN.md

### Created

- `.planning/TODOS.md` — v2 manual-toggle pickup plan

## Light-Mode Token Overrides (final list)

Inside `@media (prefers-color-scheme: light) :root { … }`:

| Token              | Light value | Source              |
| ------------------ | ----------- | ------------------- |
| `--color-bg`       | `#f4f5f7`   | DESIGN.md neutral-50 |
| `--color-bg-elev`  | `#ffffff`   | DESIGN.md neutral-0 |
| `--color-ink`      | `#0a0e1a`   | DESIGN.md neutral-950 |
| `--color-ink-dim`  | `#374151`   | DESIGN.md neutral-700 |
| `--color-ink-mute` | `#9ca3af`   | DESIGN.md neutral-400 |
| `--color-line`     | `#e5e7eb`   | DESIGN.md neutral-100 |
| `color-scheme`     | `light`     | UA scrollbar/form-control hint |

**NOT overridden (intentional):**
- `--color-bg-map` — reel canvas stays dark per DESIGN.md:72
- `--color-amber-{400,500,600}` — accent is brand, not theme

## Lock Compliance Check

- [x] `--color-bg-map` is **not** present as an override in the light media query (confirmed by reading the block; only mentioned in a comment explaining why it is excluded)
- [x] `.scrim-bottom` and `.scrim-top` rules unchanged (still hardcoded `rgba(10, 14, 26, …)` — dark)
- [x] `src/reel/MapPoster.tsx` and other reel surfaces untouched
- [x] No semantic-alias tokens introduced (`--bg`, `--surface`, `--accent`, `--text`, `--muted`, `--border` not present)
- [x] No `<ThemeProvider>` React component, no class-on-html bootstrap
- [x] No new packages
- [x] No manual theme toggle UI (deferred to v2 per APP-02 + plan)

## Decisions Made

1. **Direct CSS-var override, no alias layer.** Existing components already use Tailwind utilities (`bg-bg`, `text-ink`, `border-line`) that resolve via `tailwind.config.ts` to `--color-*`. Flipping the underlying values in a media query gives the entire component tree light-mode support with zero migration. Adding `--bg`/`--surface`/`--accent` would have been dead code.
2. **Pure CSS, no `ThemeProvider`.** v1 doesn't ship a manual toggle. A context + persisted-preference layer would be unused complexity; pure-CSS theming has zero JS cost and zero hydration flicker.
3. **Amber reconciliation bundled with theme work.** AA-contrast claims about amber-600 on light backgrounds only hold for `#E8B040` (DESIGN.md target), not the drifted `#C28A1E`. Fixing drift while introducing the light theme is the correct ordering.

## Deviations from Plan

None — plan executed exactly as written. The plan called for atomic per-task commits and the implementation followed that split (one commit per task, three tasks total).

## Verification Results

- `bun run typecheck` — exit 0
- `bun run build` — exit 0 (1.64s, output unchanged shape)
- `bun run test` — 85/85 passed (zero regressions vs Phase 2 baseline)
- `grep -rniE "(F5B83A|C28A1E)" src/ tailwind.config.ts` — zero matches (drift eliminated)
- `grep -c "prefers-color-scheme: light" src/index.css` — 1 occurrence
- `grep "darkMode" tailwind.config.ts` — `darkMode: 'media',`
- `grep -c "Manual theme toggle" .planning/TODOS.md` — 1 occurrence

User visual verification (deferred to post-merge per task brief):
- DevTools "Emulate CSS media feature: prefers-color-scheme" toggled in both directions
- Reel route (`/`) stays dark in both modes
- No first-paint flash (CSS-only, evaluates synchronously)

## Commits

| Task | Type    | Hash      | Message |
| ---- | ------- | --------- | ------- |
| 1    | chore   | `cfc6464` | reconcile amber tokens with DESIGN.md |
| 2    | feat    | `475139a` | add light-mode token overrides for app chrome |
| 3    | chore   | `82e402c` | set Tailwind darkMode to 'media' and document v2 toggle |

Branch: `feature/03-03-theme` (off `main` @ `3ef4fbf`)

## Self-Check: PASSED

- FOUND: `.planning/TODOS.md`
- FOUND: `src/index.css` (modified)
- FOUND: `tailwind.config.ts` (modified)
- FOUND commit `cfc6464` (Task 1)
- FOUND commit `475139a` (Task 2)
- FOUND commit `82e402c` (Task 3)
- typecheck / build / 85 tests all green on HEAD (`82e402c`)
