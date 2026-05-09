# Codebase Structure

**Analysis Date:** 2026-04-27
**Phase:** Post-Phase 4 — frontend route tree (Phase 3) + backend skeleton + Auth0 + lazy provisioning (Phase 4) shipped. Phase 5 (city CRUD + map picker) is the next layer to land.

## Directory Layout

```
timeline-revamp/
├── docs/                    # Snapshots of gstack-canonical planning docs
│   ├── plan.md              #   master implementation plan, Phase 1-12 schedule
│   └── test-plan.md         #   /qa input — affected pages, edge cases, critical paths
├── .planning/               # GSD durable planning + codebase map (survives compaction)
│   ├── PROJECT.md           #   product framing, decisions table
│   ├── REQUIREMENTS.md      #   numbered requirements (REEL-*, AUTH-*, DATA-*, etc.)
│   ├── ROADMAP.md           #   12 phases with success criteria + plan list
│   ├── STATE.md             #   current execution state (which phase/plan is live)
│   ├── TODOS.md             #   tactical todos
│   ├── codebase/            #   THIS DIR — STACK / INTEGRATIONS / ARCHITECTURE / STRUCTURE / CONVENTIONS / TESTING / CONCERNS
│   └── phases/              #   per-phase plans
│       ├── 02-reel-polish/
│       ├── 03-app-shell/
│       └── 04-backend-auth0/
│
├── src/                     # Frontend application code (Vite + React 19)
│   ├── App.tsx              #   createBrowserRouter — five routes (see route map below)
│   ├── main.tsx             #   ReactDOM.createRoot + StrictMode + maplibre-gl CSS hoist
│   ├── index.css            #   Tailwind base + tokens (:root vars) + components + utilities
│   ├── vite-env.d.ts        #   ImportMetaEnv typing for VITE_AUTH0_* + VITE_MAPTILER_KEY
│   │
│   ├── routes/              #   React Router v7 route components — one file per route
│   │   ├── AppLayout.tsx    #     /app/* parent — AuthProvider → RequireAuth → HandlePickerGate → Outlet + BottomNav
│   │   ├── AppReelRoute.tsx #     /app index — wraps Reel in `.app-reel-host` (BottomNav collision wrapper)
│   │   ├── HandleReelRoute.tsx #  /u/:handle — Phase 9 will fetch real data; currently seeded reel
│   │   ├── PublicReelRoute.tsx #  / — public reel, no auth, no fetch
│   │   ├── TripsRoute.tsx   #     /app/trips — placeholder shell; Phase 5 fills in CRUD
│   │   ├── MeRoute.tsx      #     /app/me — placeholder shell; Phase 5+ adds settings
│   │   └── NotFoundRoute.tsx#     * — 404 with link back to /
│   │
│   ├── auth/                #   Auth0-aware components and hooks
│   │   ├── AuthProvider.tsx #     Mounts <Auth0Provider> only inside AppLayout (AUTH-04 seam)
│   │   ├── HandlePickerGate.tsx # Fetches /api/me; renders modal sibling when handle is null
│   │   ├── HandlePickerModal.tsx# Form + client-side validation (shared with server) + POST /api/me/handle
│   │   └── useApi.ts        #     useApi() / useApiJson<T>() — fetch with Bearer token attached
│   │
│   ├── components/          #   Layout-level components shared across the /app/* tree
│   │   ├── RequireAuth.tsx  #     Calls loginWithRedirect on !isAuthenticated; "Signing in…" splash
│   │   └── BottomNav.tsx    #     Fixed h-16 nav; tabs Reel | Trips | Me; amber active state
│   │
│   ├── reel/                #   Cinematic reel surface (the "movie" — single feature module)
│   │   ├── Reel.tsx         #     Root composer — gesture machine + Suspense<MapCanvas> + overlays
│   │   ├── MapCanvas.tsx    #     MapLibre wrapper — lazy-loaded; flyTo on chapter change
│   │   ├── MapPoster.tsx    #     Suspense fallback; identical positioning to MapCanvas (no CLS)
│   │   ├── ChapterOverlay.tsx #   Bottom-anchored: photo stack, city name, caption, date
│   │   ├── ChapterRail.tsx  #     Bottom horizontal progress rail with scrub cursor (`data-chapter-rail`)
│   │   ├── CTAPill.tsx      #     Top-right "Make your own →" pill + tagline
│   │   ├── StateBadge.tsx   #     Dev affordance — current ReelStateName (DEV-only after Phase 2)
│   │   ├── ReducedMotionReel.tsx # Static fallback (vertical scroll list of cities)
│   │   └── usePrefersReducedMotion.ts # Live-updating matchMedia hook
│   │
│   ├── gestures/            #   Touch/mouse/keyboard input handling for the reel
│   │   ├── stateMachine.ts  #     PURE — ReelState, ReelEvent, transition() + timing constants
│   │   ├── stateMachine.test.ts # Vitest coverage of every transition (Phase 2 milestone)
│   │   └── useGestureMachine.ts # React hook — owns timers, listeners, pointer tracking
│   │
│   ├── motion/              #   (currently empty/reserved — Framer Motion 11 is installed)
│   │   └── variants.ts      #     Motion variants land here when Phase 2 motion polish ships
│   │
│   ├── data/                #   Static data; replaced by API calls in Phase 5+
│   │   └── seeded-cities.ts #     10 hardcoded chapters Tokyo→Banff
│   │
│   └── types/               #   Cross-feature TS types
│       └── reel.ts          #     Coordinates, PhotoSeed, CityChapter, ReelStateName
│
├── server/                  # Hono API (Bun runtime, tsx for dev)
│   ├── index.ts             #   Hono app: GET /health + /api/health public; /api/me{,/*} authed chain
│   ├── env.ts               #   Zod-validated env (DATABASE_URL, PORT, AUTH0_DOMAIN, AUTH0_AUDIENCE)
│   │
│   ├── auth/                #   JWT validation + lazy user provisioning
│   │   ├── jwt.ts           #     requireJwt middleware — jose + createRemoteJWKSet, RS256, iss + aud
│   │   ├── jwt.test.ts      #     Vitest — mints local tokens via __setJwksGetterForTest seam
│   │   ├── lazyProvision.ts #     SELECT-or-INSERT users keyed by auth0_sub; sets c.var.user
│   │   └── context.ts       #     `declare module 'hono'` augmentation for ContextVariableMap
│   │
│   ├── handles/             #   Shared handle validator (imported by frontend via @server alias)
│   │   ├── validate.ts      #     Regex + reserved-words check; discriminated-union result
│   │   └── reservedWords.ts #     Frozen Set — admin/api/app/u/auth/login/etc.
│   │
│   ├── routes/              #   Hono sub-routers (one file per resource family)
│   │   └── me.ts            #     GET /api/me, POST /api/me/handle (with PG 23505 → 409 mapping)
│   │
│   └── db/                  #   Drizzle schema + Postgres client
│       ├── schema.ts        #     pg-core: users, cities, photos, notifications + $inferSelect types
│       ├── client.ts        #     Single pg.Pool drizzled with the schema namespace
│       ├── migrate.ts       #     `bun run db:migrate` entrypoint (one-shot pg.Client)
│       └── migrations/
│           ├── 0000_panoramic_deathbird.sql   # Generated: tables + FK cascades + uniques
│           ├── 0001_cities_deferrable_unique.sql # HAND-AUTHORED — owns DATA-02 deferrable constraint
│           └── meta/                           # drizzle-kit journal + snapshot files
│
├── scripts/
│   └── dev.ts               # Spawns Vite + Hono in parallel; prefixed [web]/[api] output; signal forwarding
│
├── dist/                    # Vite build output (gitignored)
├── node_modules/            # bun install (gitignored)
├── .gstack/                 # gstack project state (gitignored)
├── .git/                    # Git internals
│
├── index.html               # Single HTML entry; Google Fonts preconnect; theme-color #0A0E1A
├── package.json             # Scripts: dev, dev:web, dev:api, build, typecheck, test*, db:up/down/generate/migrate/studio
├── bun.lock                 # bun lockfile, committed
├── docker-compose.yml       # postgres:16 service (named volume `pgdata`, port 5432)
├── drizzle.config.ts        # Drizzle Kit: schema=server/db/schema.ts, out=server/db/migrations
├── tsconfig.json            # Project references → app + node + server
├── tsconfig.app.json        # Strict TS for src/, @/ alias
├── tsconfig.node.json       # Strict TS for vite.config.ts + scripts/
├── tsconfig.server.json     # Strict TS for server/ (NodeNext module resolution)
├── vite.config.ts           # @vitejs/plugin-react + @/ + @server aliases + /api proxy + manualChunks
├── vitest.config.ts         # Vitest config (jsdom for src/, node for server/)
├── tailwind.config.ts       # Theme extension (colors, fonts, easings, container-queries plugin)
├── postcss.config.js        # tailwindcss + autoprefixer
├── DESIGN.md                # Visual / UX design system (CLAUDE.md routes here before UI changes)
├── README.md                # Project overview, status, doc pointers
├── CLAUDE.md                # Routing rules + design-system pointer
├── TODOS.md                 # v2 backlog (everything explicitly cut from v1)
├── .env.example             # Documented env contract (VITE_AUTH0_*, VITE_MAPTILER_KEY, AUTH0_*, DATABASE_URL)
├── .env.local               # Per-developer secrets (gitignored)
└── .gitignore               # node_modules, dist, *.tsbuildinfo, .gstack/, .env*
```

> Note: there is no `public/` directory. Vite serves static assets directly from `index.html` and bundle output; no extra static-asset directory has been added yet.

## Route Map

| Path | Component | Auth | Notes |
|------|-----------|------|-------|
| `/` | `PublicReelRoute` | None | Public reel from `SEEDED_CITIES`; no fetch, no Auth0 SDK loaded |
| `/u/:handle` | `HandleReelRoute` | None | Phase 3 stub — sets `document.title`, renders seeded reel; Phase 9 fetches per-handle |
| `/app` | `AppLayout` → index `AppReelRoute` | Required | Wraps reel in `.app-reel-host` so BottomNav clears the ChapterRail |
| `/app/trips` | `AppLayout` → `TripsRoute` | Required | Placeholder; Phase 5 lands map-pick + city CRUD |
| `/app/me` | `AppLayout` → `MeRoute` | Required | Placeholder |
| `*` | `NotFoundRoute` | None | 404 with link back to `/` |

Mount order inside `AppLayout` (`src/routes/AppLayout.tsx:24-37`):
`AuthProvider → RequireAuth → HandlePickerGate → <div class="min-h-dvh bg-bg text-ink pb-16"> Outlet + BottomNav </div>`

## Directory Purposes

**`src/routes/`:**
- One TSX file per route component. Routes themselves are declared in `src/App.tsx`.
- Convention: route components are thin — they pick a presentation (e.g., reduced-motion vs full reel) and render feature components from `src/reel/`, `src/auth/`, etc.

**`src/auth/`:**
- Everything that imports `@auth0/auth0-react` lives here (or in `src/components/RequireAuth.tsx`). This is the AUTH-04 enforcement boundary — keeping Auth0 imports localised is what guarantees the public reel chunk stays Auth0-free.
- `useApi()` is the single seam where access tokens leave the Auth0 context.

**`src/components/`:**
- Layout components used across the `/app/*` tree (`RequireAuth`, `BottomNav`). Reel-specific components live in `src/reel/` instead.

**`src/reel/`:**
- The cinematic reel — single feature module. Each component is its own file; the gesture machine is the only shared dependency.

**`src/gestures/`:**
- Pure transition function (`stateMachine.ts`) + effectful hook (`useGestureMachine.ts`) + tests. **Rule:** `stateMachine.ts` MUST stay free of React/DOM imports.

**`server/auth/`:**
- JWT verification (`jwt.ts`), provisioning (`lazyProvision.ts`), and the Hono context augmentation (`context.ts`). The augmentation is imported for side effect by `server/index.ts:12`; do not delete it.

**`server/handles/`:**
- Cross-trust-boundary handle utilities. `validate.ts` and `reservedWords.ts` are the ONLY files frontend may import via `@server/...` (see `vite.config.ts:11-17`).

**`server/routes/`:**
- One sub-router per resource family. `me.ts` today; Phase 5 will add `cities.ts` and possibly `trips.ts`.

**`server/db/`:**
- `schema.ts` is the Drizzle source of truth. `migrations/` contains both generated and hand-authored SQL — see DATA-02 ownership notice in `schema.ts:1-17` before regenerating.

**`scripts/`:**
- Local-only Node scripts. `dev.ts` is the only entry today; CI/deploy scripts land in Phase 9.

**`docs/`:**
- Snapshots of gstack-canonical planning docs. Authoritative source is `~/.gstack/projects/usbryanchlam-timeline-revamp/`.

**`.planning/`:**
- GSD durable planning. `codebase/` (this directory) is the codebase map; `phases/` holds per-phase plans; the top-level files are durable across compactions.

## Naming Conventions

**Files:**
- Components: `PascalCase.tsx` (`AppLayout.tsx`, `BottomNav.tsx`, `MapCanvas.tsx`)
- Hooks: `useCamelCase.ts` (`useApi.ts`, `useGestureMachine.ts`, `usePrefersReducedMotion.ts`)
- Plain modules: `camelCase.ts` (`stateMachine.ts`, `lazyProvision.ts`, `seeded-cities.ts` is grandfathered)
- Tests: co-located `*.test.ts` next to source (`stateMachine.test.ts`, `jwt.test.ts`)
- SQL migrations: `NNNN_snake_case.sql` (drizzle-kit format; hand-authored files keep the same scheme — see `0001_cities_deferrable_unique.sql`)

**Routes:**
- React Router paths use kebab-case lowercase. The `/u/:handle` segment is intentionally short (handles are reservedly distinct from `/app`).

**Imports:**
- `@/` → `src/` (frontend)
- `@server/` → `server/` (frontend may import ONLY from `@server/handles/*`; vite.config comment is load-bearing)
- Server uses NodeNext resolution; relative imports include `.js` extensions even though sources are `.ts` (TypeScript NodeNext rule).

## Where to Add New Code

| Adding... | Goes in... |
|---|---|
| A new `/app` route | New file under `src/routes/`, register as a child of `/app` in `src/App.tsx:13-21` |
| A new public route | New file under `src/routes/`, register at root in `src/App.tsx:11-12`. **Do NOT** import from `src/auth/`. |
| A reel overlay element | `src/reel/<NewComponent>.tsx`; render inside `Reel.tsx` |
| A gesture event or state | `src/gestures/stateMachine.ts` (event union + transition case) → handler in `useGestureMachine.ts` → test in `stateMachine.test.ts` |
| A visual token | `src/index.css` `:root` (CSS var) AND `tailwind.config.ts` `theme.extend` if a Tailwind utility is needed |
| Static demo data | `src/data/<topic>.ts` with strict types from `@/types` |
| A new API resource (e.g., cities for Phase 5) | `server/routes/<resource>.ts` (sub-router); mount in `server/index.ts` next to `meRouter`; add middleware chain `requireJwt + lazyProvisionUser` (or an equivalent) |
| A new DB table or column | Edit `server/db/schema.ts` → `bun run db:generate` → review SQL → `bun run db:migrate`. **Do not modify `0001_cities_deferrable_unique.sql`** — owned by DATA-02. |
| A hand-authored migration (e.g., a deferrable constraint) | New `NNNN_*.sql` file in `server/db/migrations/`; document ownership at the top of `server/db/schema.ts` so future `db:generate` runs leave it alone |
| Auth0-aware component | `src/auth/` (or `src/components/` if it's layout-level). Render only inside `AppLayout`. |
| A shared client/server utility | `server/<feature>/` and import from frontend via `@server/<feature>/*`; if more than handles need this, extend the alias allowlist comment in `vite.config.ts:11-17` |
| A `scripts/` entry | `scripts/<name>.ts`; invoke via `tsx scripts/<name>.ts` (matches `package.json:dev`) |
| Vitest tests | Co-locate as `*.test.ts` next to source. `src/gestures/stateMachine.test.ts` and `server/auth/jwt.test.ts` are the canonical examples. |

## Special Directories

**`server/db/migrations/`:**
- Generated AND hand-authored SQL coexist here. The drizzle-kit `meta/` subdirectory is generated; do not edit by hand.

**`.planning/`:**
- Survives compaction. Treat it as durable state — refresh when architecture shifts (end of Phase 2, end of Phase 4 [now], end of Phase 6, end of Phase 9).

**`.gstack/`:**
- Local gstack project state. Gitignored. Authoritative copy is in `~/.gstack/projects/usbryanchlam-timeline-revamp/`.

**`dist/`:**
- Vite build output. Gitignored. Regenerated by `bun run build`.

---

*Structure analysis: 2026-04-27*
