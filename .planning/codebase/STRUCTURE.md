# Codebase Structure

**Analysis Date:** 2026-04-27
**Phase:** W4 — backend skeleton landed (04-01)

## Directory Layout

```
timeline-revamp/
├── docs/                    # Snapshots of gstack-canonical planning docs
│   ├── plan.md              #   master implementation plan, W1–W12 schedule
│   └── test-plan.md         #   /qa input — affected pages, edge cases, critical paths
├── .planning/               # GSD codebase map (this directory) — survives compaction
│   └── codebase/            #   STACK / INTEGRATIONS / ARCHITECTURE / STRUCTURE / CONVENTIONS / TESTING / CONCERNS
├── src/                     # All application code
│   ├── data/                #   Hardcoded seed data; W6 replaces with backend fetch
│   ├── gestures/            #   Pure state machine + React hook driving the reel
│   ├── motion/              #   (reserved — empty in W1; tokens currently live in index.css)
│   ├── reel/                #   The cinematic reel — map canvas + overlays + fallback
│   ├── types/               #   Shared TS types (currently just reel.ts)
│   ├── App.tsx              #   Picks Reel vs ReducedMotionReel
│   ├── main.tsx             #   ReactDOM.createRoot + StrictMode
│   ├── index.css            #   Tailwind base + tokens + components + utilities
│   └── vite-env.d.ts        #   /// <reference types="vite/client" />
├── server/                  # Hono API (lands W4)
│   ├── db/
│   │   ├── schema.ts        #   Drizzle pg-core: users, cities, photos, notifications (DATA-02 constraint owned by 0001 migration, NOT this file)
│   │   ├── client.ts        #   Shared Drizzle client (one Pool per process)
│   │   ├── migrate.ts       #   bun run db:migrate entrypoint
│   │   └── migrations/      #   0000_*.sql auto-generated; 0001_cities_deferrable_unique.sql hand-authored (DATA-02)
│   ├── env.ts               #   Zod-validated server env
│   └── index.ts             #   Hono app: GET /health, GET /api/health (more in 04-02)
├── scripts/
│   └── dev.ts               #   Spawns Vite + Hono with prefixed output and signal forwarding
├── index.html               # Single HTML entry, Google Fonts preconnect
├── package.json             # Scripts: dev, dev:web, dev:api, build, typecheck, db:up, db:down, db:generate, db:migrate
├── bun.lock                 # bun lockfile, committed
├── docker-compose.yml       # Postgres 16 service (named volume `pgdata`)
├── drizzle.config.ts        # Drizzle Kit config (schema path + dbCredentials)
├── tsconfig.json            # Project references → app + node + server
├── tsconfig.app.json        # Strict TS for src/, @/ alias
├── tsconfig.node.json       # Strict TS for vite.config.ts
├── tsconfig.server.json     # Strict TS for server/ (NodeNext module resolution)
├── .env.example             # Documented env contract; .env.local stays gitignored
├── vite.config.ts           # @vitejs/plugin-react + @/ alias + host:true dev server + /api proxy → :8787
├── tailwind.config.ts       # Theme extension (colors, fonts, easings, container-queries plugin)
├── postcss.config.js        # tailwindcss + autoprefixer
├── DESIGN.md                # Visual / UX design system (CLAUDE.md routes here before UI changes)
├── TODOS.md                 # v2 backlog (everything explicitly cut from v1)
├── README.md                # Project overview, status, doc pointers
├── CLAUDE.md                # Routing rules + design-system pointer
├── .gitignore               # node_modules, dist, *.tsbuildinfo, .gstack/, .env*
└── .gstack/                 # gstack project state (gitignored)
```

## Directory Purposes

**`src/data/`:**
- Purpose: Static, frontend-known data. Hardcoded for W1, fetched from API in W4+.
- Contains: `seeded-cities.ts` (10 cities Tokyo→Banff, with center/zoom/pitch/bearing/date/caption/photos)
- Conventions: every record `as const`, fields readonly, gradient-only photos as W1 placeholders

**`src/gestures/`:**
- Purpose: Touch/mouse/keyboard input handling for the reel surface.
- Contains:
  - `stateMachine.ts` — pure transition function, all 6 states, all events, all timing constants
  - `useGestureMachine.ts` — React hook owning timers, listeners, pointer tracking
- Conventions: stateMachine.ts MUST stay pure (no React imports). All side effects in the hook.

**`src/motion/`:**
- Purpose: Reserved. Tokens currently in `index.css` `:root` block (`--ease-camera`, `--ease-arrival`, `--ease-ui`, `--ease-exit`, `--dur-*`).
- Future: When Framer Motion lands in W2, motion variants live here.

**`src/reel/`:**
- Purpose: The cinematic surface. Composes map + overlays.
- Contains:
  - `Reel.tsx` — root, wires gesture hook to overlays
  - `MapCanvas.tsx` — MapLibre wrapper; flyTo on chapter change; toggles interactivity per state
  - `ChapterOverlay.tsx` — bottom-anchored: photo stack, city name, caption, date
  - `ChapterRail.tsx` — bottom horizontal progress rail with scrub cursor
  - `CTAPill.tsx` — top-right "Make your own →" pill + tagline
  - `StateBadge.tsx` — dev affordance, top-left, shows current ReelStateName (remove or hide-behind-?debug=1 in W2)
  - `ReducedMotionReel.tsx` — static fallback (vertical scroll list of cities)
  - `usePrefersReducedMotion.ts` — live-updating matchMedia hook
- Conventions: every component is one default-or-named export, no class components, 1 component per file

**`src/types/`:**
- Purpose: Cross-feature TS types.
- Contains: `reel.ts` — Coordinates, PhotoSeed, CityChapter, ReelStateName.

**`docs/`:**
- Purpose: Repo-local copies of gstack-canonical planning docs.
- Pattern: gstack at `~/.gstack/projects/usbryanchlam-timeline-revamp/` is primary; copies refreshed after major plan updates.
- Contains: `plan.md` (W1–W12 schedule), `test-plan.md` (QA input).

**`.planning/codebase/`:**
- Purpose: Durable codebase map for post-compaction durability and onboarding.
- Pattern: Refresh after significant arch changes (end of W4, end of W6, end of W9).

## Where to Add New Things

| Adding... | Goes in... |
|---|---|
| A new gesture event or state | `src/gestures/stateMachine.ts` (event union + transition case), then handler in `useGestureMachine.ts` |
| A new overlay element on the reel | `src/reel/<NewComponent>.tsx`, render inside `Reel.tsx` |
| A new visual token | `src/index.css` `:root` (CSS var) AND `tailwind.config.ts` `theme.extend` if utility-needed |
| Static demo data | `src/data/<topic>.ts`, with strict types from `@/types` |
| A new page (W3+) | `src/routes/<route>.tsx`, register in router (lands W3) |
| Backend route or endpoint | `server/<feature>.ts` (or grow `server/index.ts` for tiny additions); register on the Hono app |
| New DB table or schema change | edit `server/db/schema.ts`, run `bun run db:generate`, review SQL, run `bun run db:migrate`. Do NOT touch `server/db/migrations/0001_cities_deferrable_unique.sql`; it is owned by DATA-02. |

## File Count

```
Source files (.ts/.tsx):  ~22 (frontend ~17 + server: env.ts, schema.ts, client.ts, migrate.ts, index.ts) + scripts/dev.ts
Config files:             10 (package.json, tsconfig* x4, vite.config, drizzle.config, tailwind.config, postcss.config, docker-compose, index.html, .gitignore)
Doc files:                6 (DESIGN.md, TODOS.md, README.md, CLAUDE.md, docs/plan.md, docs/test-plan.md)
```
