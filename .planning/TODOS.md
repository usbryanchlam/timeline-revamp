# TODOS

## Deferred from Phase 3

- **Manual theme toggle (v2):** Phase 3 ships system-preference-only theming via `prefers-color-scheme` media query. If user research or feedback indicates a manual override is wanted, add:
  1. Switch Tailwind config to `darkMode: ['class', '[data-theme="dark"]']`.
  2. Add a `ThemeProvider` React context that reads from localStorage, falls back to `matchMedia('(prefers-color-scheme: dark)')`, and writes `data-theme` on `<html>`.
  3. Add a `<ThemeToggle />` component (already named in DESIGN.md component inventory).
  4. Bootstrap the initial theme in main.tsx BEFORE React hydrates to avoid a flash of wrong theme.
  Estimated effort: 1 plan, ~3 tasks.
