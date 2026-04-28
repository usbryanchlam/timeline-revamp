# Technology Stack

**Analysis Date:** 2026-04-27
**Last mapped commit:** see `git log -1 --format=%H`
**Phase:** W1 (reel prototype + gesture state machine)

## Languages

**Primary:**
- TypeScript 5.9 (strict mode) — all application code in `src/`
- TSX (JSX) — React components

**Secondary:**
- CSS — `src/index.css` (Tailwind base + custom layers)
- HTML — `index.html` (single entry, Google Fonts preconnect)

## Runtime

**Environment:**
- Node 22+ for tooling (vite, tsc); actual runtime is the browser
- Target: iOS 17+ Safari, Chrome 109+, Firefox 115+ (per design doc § feasibility floor)

**Package Manager:**
- bun 1.3.12 — `bun.lock` committed
- npm-compatible registry, no special bun-only features used

## Frameworks

**Core:**
- React 19.2 — UI framework
- Vite 7.3 — dev server + build tool (Rolldown coming, not enabled)
- @vitejs/plugin-react 5.2 — JSX/Fast Refresh

**Styling:**
- Tailwind CSS 3.4 — utility-first, JIT
- @tailwindcss/container-queries 0.1 — `@container` queries plugin
- PostCSS 8 + autoprefixer — pipeline

**Map rendering:**
- maplibre-gl 5.24 — WebGL vector-tile renderer; `dragPan`/`touchZoomRotate` toggled by gesture state

**Testing:**
- _None yet_ — Vitest + Playwright + RTL planned for W2+, see test-plan.md

## Build Pipeline

**Commands:**
```bash
bun install            # 161 packages, ~45s cold
bun run dev            # vite dev server, http://localhost:5173
bun run build          # tsc -b (project refs) + vite build
bun run typecheck      # tsc -b --noEmit
bun run preview        # serve dist/, --host for LAN testing
```

**TypeScript configuration:**
- Project references: `tsconfig.json` → `tsconfig.app.json` (src/) + `tsconfig.node.json` (vite.config.ts)
- `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`, `erasableSyntaxOnly`, `verbatimModuleSyntax`
- `moduleResolution: bundler`, `allowImportingTsExtensions`, `jsx: react-jsx`
- Path alias: `@/*` → `src/*`

**Build output:**
- `dist/` — single-page app, ~1.27 MB JS / 351 KB gzipped (MapLibre dominates)
- W2 task: dynamic-import MapLibre after LCP for the Lighthouse 90 budget

## What's Locked vs What's Not

**Locked (per docs/plan.md):**
- React 19, Vite 7, TypeScript, Tailwind, MapLibre 5
- bun as package manager
- Hono + Drizzle + Postgres for backend (W4+)
- Auth0 for auth (W4b)
- OCI Object Storage for photos (W6)
- Docker Compose on OCI Ampere A1 for deploy (W8+)

**Not yet wired (planned phases):**
- Backend: any of Hono / Drizzle / Postgres
- Auth: Auth0 SDKs
- Test runners: Vitest, Playwright, @testing-library/react
- BullMQ / Redis / Puppeteer / FFmpeg (MP4 worker, W10)
- Framer Motion 11 (UI overlay motion, W2)
- React Router v7 (multi-route shell, W3)

## Tile Source (W1 placeholder)

- Active: `https://demotiles.maplibre.org/style.json` — public, no key, world-level shapes only.
- Planned: MapTiler free tier (100k/mo), API key in `VITE_MAPTILER_KEY` env var — W2 swap.
- Fallback documented in plan: self-hosted `tileserver-gl` if viral.
