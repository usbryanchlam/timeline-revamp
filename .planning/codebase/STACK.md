# Technology Stack

**Analysis Date:** 2026-04-27
**Last mapped commit:** `b39a943` (post-Phase 4)
**Phase:** Phases 1–4 complete (reel + gesture state machine + backend + dev orchestration)

## Languages

**Primary:**
- TypeScript ^5.6.3 (strict) — frontend (`src/`), backend (`server/`), dev scripts (`scripts/`)
- TSX (React 19 JSX) — components under `src/`

**Secondary:**
- CSS — `src/index.css` (Tailwind base + custom layers)
- HTML — `index.html` (single entry, Google Fonts preconnect)

**Module mode:**
- ESM throughout (`"type": "module"` in `package.json`)
- Frontend: `moduleResolution: "bundler"` (`tsconfig.app.json:8`)
- Backend: `moduleResolution: "NodeNext"` (`tsconfig.server.json:4`)

## Runtime

**Frontend:**
- Browser — iOS 17+ Safari, Chrome 109+, Firefox 115+ (locked floor in `.planning/PROJECT.md`)
- ES2022 target, DOM + DOM.Iterable lib (`tsconfig.app.json:3-5`)

**Backend:**
- Node.js — `tsx` (dev watch) or plain `node` (prod), `@types/node` ^22.9.0 pins surface to Node 22
- ES2022 target, ES2023 lib, NodeNext (`tsconfig.server.json:2-6`)

**Package Manager:**
- bun — locked decision in `.planning/PROJECT.md` ("install ~3x faster than npm cold")
- `scripts/dev.ts:18-19` invokes children as `bun x vite` and `bun x tsx watch server/index.ts`
- Lockfile: `bun.lock` committed at root

## Frameworks

**Frontend core:**
- React ^19.0.0 (`react`, `react-dom`) — `StrictMode` enabled in `src/main.tsx:11`
- React Router ^7.15.0 (data-router successor to RR6) — `useNavigate` used in `src/auth/AuthProvider.tsx:2`
- Framer Motion ^11 — motion primitives for cinematic transitions
- MapLibre GL JS ^5.0.0 — WebGL vector-tile renderer (NOT Leaflet, locked); CSS in `src/main.tsx:3`

**Backend core:**
- Hono ^4.12.18 — typed router; app in `server/index.ts:14`
- `@hono/node-server` ^2.0.1 — Node adapter (`serve()` at `server/index.ts:36`)
- Drizzle ORM ^0.45.2 + `drizzle-kit` ^0.31.10 — schema-as-code Postgres ORM
- `pg` ^8.20.0 (+ `@types/pg`) — Postgres driver underneath Drizzle
- `jose` ^6.2.3 — RS256 JWT/JWKS validation against Auth0 (`server/auth/jwt.ts:1,27`)
- Zod ^4.4.3 — server env validation at `server/env.ts:12-21`; also drives input contracts

**Auth:**
- `@auth0/auth0-react` ^2.16.2 — SPA Universal Login, mounted only inside `AppLayout` so the chunk doesn't load on public reels (`src/auth/AuthProvider.tsx:7-10`)
- Server: `jose` validates against `https://${AUTH0_DOMAIN}/.well-known/jwks.json` with 30s cooldown / 10min cache (`server/auth/jwt.ts:27-30`)

**Build/Dev:**
- Vite ^7.0.0 — dev server (port 5173, proxies `/api/*` → `http://localhost:8787` per `vite.config.ts:19-31`); prod bundler with `manualChunks: { maplibre: [...] }` (`vite.config.ts:38-42`)
- `@vitejs/plugin-react` ^5.0.0
- `tsx` ^4.21.0 — TS execution for `server/` and `scripts/`; `tsx watch` for API hot-reload
- TypeScript project references — root `tsconfig.json` references `tsconfig.app.json` (frontend), `tsconfig.node.json` (vite/scripts), `tsconfig.server.json` (server + scripts + drizzle.config)

**Testing:**
- Vitest ^4.1.5 (+ `@vitest/coverage-v8`) — unified runner for `src/**/*.test.{ts,tsx}` and `server/**/*.test.ts` (`vitest.config.ts:14-18`)
- `node` test environment, globals enabled (`vitest.config.ts:11-13`)
- Coverage excludes `src/main.tsx`, `src/data/**`, `src/vite-env.d.ts`, all test files (`vitest.config.ts:22-29`)
- E2E: Playwright planned per global rules; not wired yet

**Styling:**
- Tailwind CSS ^3.4.17 (locked at 3.x, NOT v4 — `.planning/PROJECT.md:77`)
- `@tailwindcss/container-queries` ^0.1.1 (`tailwind.config.ts:43`)
- PostCSS ^8.4.49 + Autoprefixer ^10.4.20
- Custom theme: `font-display` Inter Tight, single amber accent `#FFD470`, signature `transitionTimingFunction.arrival = cubic-bezier(0.16, 1, 0.3, 1)` (`tailwind.config.ts:24-40`)
- `darkMode: 'media'`

## Key Dependencies

**Critical:**
- `maplibre-gl` ^5.0.0 — cinematic thesis carrier; lazy-imported via `React.lazy()` in `Reel.tsx` and split into its own chunk via Rollup `manualChunks` (`vite.config.ts:38-42`)
- `framer-motion` ^11 — UI transitions
- `hono` ^4.12.18 — sole API framework
- `drizzle-orm` ^0.45.2 — sole DB access layer
- `jose` ^6.2.3 — chosen over `jsonwebtoken` (dual ESM+CJS, built-in `createRemoteJWKSet` rotation, exposes `SignJWT`/`generateKeyPair` for hermetic tests; rationale at `server/auth/jwt.ts:16-19`)

**Infrastructure:**
- `dotenv` ^17.4.2 — loads `.env.local` then `.env` without overriding existing `process.env`; used by `server/env.ts:7-8` and `drizzle.config.ts:4-5`

## Build Pipeline

**Commands:**
```bash
bun install
bun run dev            # scripts/dev.ts — vite + tsx watch in parallel
bun run dev:web        # vite only
bun run dev:api        # tsx watch server/index.ts only
bun run build          # tsc -b && vite build
bun run typecheck      # tsc -b --noEmit
bun run preview        # serve dist/, --host for LAN
bun run test           # vitest run
bun run test:watch     # vitest
bun run test:coverage  # vitest run --coverage
bun run db:up          # docker compose up -d postgres
bun run db:down        # docker compose down
bun run db:generate    # drizzle-kit generate
bun run db:migrate     # tsx server/db/migrate.ts
bun run db:studio      # drizzle-kit studio
```

**TypeScript project references (root `tsconfig.json:3-7`):**
- `tsconfig.app.json` — frontend (`src/`), bundler resolution, `verbatimModuleSyntax`, strict, `erasableSyntaxOnly`
- `tsconfig.server.json` — `server/` + `scripts/` + `drizzle.config.ts`, NodeNext, strict, isolatedModules
- `tsconfig.node.json` — Vite/Vitest config files

**Path aliases (mirrored across `vite.config.ts`, `vitest.config.ts`, both tsconfigs):**
- `@/*` → `src/*`
- `@server/*` → `server/*` — intentionally narrow door; frontend may only import `@server/handles/*` (rationale at `vite.config.ts:11-17`)

**Build output:**
- `dist/` — Rollup splits `maplibre-gl` into a stable cacheable chunk

## Dev Orchestration (Phase 4 addition)

**`scripts/dev.ts` (invoked by `bun run dev`):**
- Spawns Vite (`bun x vite`, label `[web]`) and Hono (`bun x tsx watch server/index.ts`, label `[api]`) as siblings via `node:child_process` (`scripts/dev.ts:17-20`)
- Line-buffered stdout/stderr prefixed with `[web]` / `[api]` (`scripts/dev.ts:27-44`)
- Forwards SIGINT/SIGTERM/SIGHUP; first-to-die triggers sibling shutdown with propagated exit code (`scripts/dev.ts:72-87`)
- Plain `node:child_process` chosen over `concurrently` to avoid signal-handling surprises on macOS (`scripts/dev.ts:5-7`)

## What's Locked vs What's Not

**Locked & wired:**
- React 19, Vite 7, TypeScript 5.6, Tailwind 3.4, MapLibre 5
- bun as package manager
- Hono + Drizzle + Postgres 16 (Phase 4 — backend now live)
- Auth0 Universal Login (Phase 4 — `@auth0/auth0-react` mounted, `jose` JWT middleware live)
- Vitest test runner

**Not yet wired (planned phases):**
- OCI Object Storage for photos (Phase 6)
- BullMQ / Redis / Puppeteer / FFmpeg (MP4 worker, Phase 10)
- Playwright E2E
- Docker Compose deploy on OCI Ampere A1 (Phase 8)

---

*Stack analysis: 2026-04-27*
