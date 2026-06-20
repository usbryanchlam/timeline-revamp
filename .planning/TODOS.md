# TODOS

## Deferred from Phase 3

- **Manual theme toggle (v2):** Phase 3 ships system-preference-only theming via `prefers-color-scheme` media query. If user research or feedback indicates a manual override is wanted, add:
  1. Switch Tailwind config to `darkMode: ['class', '[data-theme="dark"]']`.
  2. Add a `ThemeProvider` React context that reads from localStorage, falls back to `matchMedia('(prefers-color-scheme: dark)')`, and writes `data-theme` on `<html>`.
  3. Add a `<ThemeToggle />` component (already named in DESIGN.md component inventory).
  4. Bootstrap the initial theme in main.tsx BEFORE React hydrates to avoid a flash of wrong theme.
  Estimated effort: 1 plan, ~3 tasks.

## Deferred from Phase 6

- **Plan path naming drift:** 06-03-PLAN.md scope block named the route `AppTripsRoute.tsx` but the actual file is `src/routes/TripsRoute.tsx`. Future plans should grep the filesystem first instead of trusting historical plan names.

## Deferred from Phase 11 (v1.0.0 Lighthouse miss → v1.1)

The v1.0.0 mobile Lighthouse baseline (`docs/lighthouse/v1.0.0-baseline.json`)
ships at perf=40 / LCP=6,303ms — below the PERF-01 (≥90) and PERF-03 (≤2,500ms)
thresholds. CLS (PERF-04) is green (0.0006). Diagnosis at
`docs/lighthouse/v1.0.0-baseline-DIAGNOSIS.md`. Three v1.1 follow-ups:

- **PERF-v1.1-A: Audit eager maplibre-gl imports.** `Reel.tsx` uses
  `React.lazy` + manualChunks for maplibre, but `OrbitReel.tsx` and
  `GlobeReel.tsx` import it statically. Even though they live on separate
  routes, their module graph pulls maplibre into the main chunk. Convert
  both to `React.lazy` and verify the public reel no longer ships maplibre
  eagerly. Expected LCP improvement: ~1,000–1,500ms.
- **PERF-v1.1-B: Re-encode seed photos.** Hong Kong seed photo is 366 KB;
  reducing to ~150 KB at 75% quality + adding `loading="lazy"` attribute to
  non-LCP slots in `src/data/seeded-cities.ts`. Expected LCP improvement:
  ~400–500ms.
- **PERF-v1.1-C: LCP poster pre-render.** Use `react-dom/server` to pre-render
  the opening `<MapPoster />` into `index.html` so the LCP element paints
  from HTML, not from hydration. Expected LCP improvement: ~1,500–2,000ms.

Combined these should lift perf 40 → 80+ and LCP 6.3s → ~2.0s. Reaching the
PERF-01 ≥ 90 / PERF-03 ≤ 2.5s thresholds may require additional work on
font-loading strategy + preload hints.
