# TODOS

## Deferred from Phase 3

- **Manual theme toggle (v2):** Phase 3 ships system-preference-only theming via `prefers-color-scheme` media query. If user research or feedback indicates a manual override is wanted, add:
  1. Switch Tailwind config to `darkMode: ['class', '[data-theme="dark"]']`.
  2. Add a `ThemeProvider` React context that reads from localStorage, falls back to `matchMedia('(prefers-color-scheme: dark)')`, and writes `data-theme` on `<html>`.
  3. Add a `<ThemeToggle />` component (already named in DESIGN.md component inventory).
  4. Bootstrap the initial theme in main.tsx BEFORE React hydrates to avoid a flash of wrong theme.
  Estimated effort: 1 plan, ~3 tasks.

## Deferred from Phase 6

- **Trips route photos trigger consolidation (06-03 carry-over):** 06-03 shipped a separate `Photos` button list beneath the existing CityList because CityList.tsx is Phase 5 territory and 06-03's scope barred edits to it. Result: each city appears twice in the Trips screen (once in CityList for edit, once as a Photos button). Fix: add an `onPhotosClick?: (city: City) => void` prop to CityList and render a small amber ghost button per row. Then remove the standalone button list from `src/routes/TripsRoute.tsx`. ~1 task, low risk.
- **Plan path naming drift:** 06-03-PLAN.md scope block named the route `AppTripsRoute.tsx` but the actual file is `src/routes/TripsRoute.tsx`. Future plans should grep the filesystem first instead of trusting historical plan names.
