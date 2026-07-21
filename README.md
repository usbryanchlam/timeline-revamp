# Timeline

> Your travels, as a movie.

A cinematic mobile-first travel-memory reel where the map is the canvas and time is the axis you scrub. Open the link on your phone and within 30 seconds you see actual trips already playing — camera flying between cities with pitch and bearing, photos popping in as it lands, chapters ticking by like an Instagram Story made of geography.

**Live:** [timeline.bryanlam.dev](https://timeline.bryanlam.dev)

## Why this exists

Portfolio piece. Built solo across 12 weekends to demonstrate a modern React + TypeScript stack, a full-stack owned deployment (auth, database, object storage, CI/CD — no Vercel, no Supabase), and a design bar most travel apps skip: the motion itself has to feel like Apple Maps Flyover.

The core value is **the motion**. If everything else fails, the cinematic `flyTo` between chapters must feel like a movie.

## What it does

- **Public reel** at `/` and `/u/:handle` — no login, no signup wall. Just the reel.
- **Personal reel** at `/app/reel` — your cities, your photos, your captions.
- **City CRUD** — click on a map, reverse-geocode, save. Drag to reorder. Concurrent-write-safe via a `DEFERRABLE INITIALLY DEFERRED` unique constraint (arguably the most fun bit of the schema).
- **Photo pipeline** — HEIC → JPEG in the browser, EXIF strip, resize to 2048px, upload direct to object storage via pre-authenticated request (PAR), server-side thumbnail via `sharp`.
- **Reduced-motion path** — swaps to a static chapter list; passes axe-core with zero violations.
- **Keyboard-only** — Tab through the whole "add a city" flow without a mouse. `←/→ ↑/↓` walk chapters, `Space` toggles play, `Enter` opens detail.

## Stack

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | React 19 + TypeScript strict + Vite 7 | Current, no legacy weight |
| **Map** | MapLibre GL JS v5 | DOM renderers (Leaflet) can't do the cinematic thesis |
| **Motion** | Framer Motion 11 | Overlay staggering + arrival-pulse easing |
| **Styling** | Tailwind 3.4 (`darkMode: 'media'`) | System theme; public reel locked dark |
| **Backend** | Hono on Bun, at `server/` (single repo, no monorepo) | One `bun run dev` runs both |
| **Database** | Postgres 16 + Drizzle ORM | Hand-authored migrations for the deferrable constraint |
| **Auth** | Auth0 Universal Login (SPA SDK) | Owned tenant; JWT via `jose` + JWKS |
| **Object storage** | Oracle Cloud Object Storage (S3-compat) | Free tier; pre-authenticated requests |
| **Infra** | Terraform-managed OCI Ampere A1 (2 OCPU / 8 GB, ARM64) | Free tier; not a serverless bill surprise |
| **Runtime** | Docker Compose + Nginx + Let's Encrypt | On the VM; simple |
| **CI/CD** | GitHub Actions → OIDC-authenticated push to OCIR → SSH deploy | Tag `v*` to ship |
| **Tests** | Vitest 4 + `@testing-library/react` + `jsdom` + Playwright + axe-core + Lighthouse | 463 tests |
| **Runtime + tooling** | Bun everywhere (install, dev, test, build) | Fast, single-binary |

## Shipped

9 of 12 phases complete. 16 of 46 requirements formally closed (many more shipped and awaiting the v1.0.0 verification sweep). Highlights:

- Full cinematic reel with flyTo tuning, arrival-pulse easing, photo overlay choreography, chapter grouping for co-located cities, mid-flight swipe retarget
- Auth0 end-to-end + handle picker + lazy user provisioning
- Cities CRUD with drag-reorder + optimistic updates + tz-safe date handling
- Photo upload pipeline (HEIC convert, resize, EXIF strip, PAR upload, `sharp` thumbnails)
- Public per-handle reel at `/u/:handle` with lowercase URL normalization
- Terraform-first OCI infra (compute, storage, IAM, GHA OIDC trust)
- GitHub Actions CI/CD with tagged auto-deploy to production
- Live at `timeline.bryanlam.dev` since 2026-05-30
- Full axe-core + keyboard-only a11y audit; native `<dialog>` focus traps
- v1.0.0 Lighthouse mobile baseline captured (perf follow-ups filed for v1.1)
- iPhone visual-review matrix (5 routes × 2 themes) via Playwright webkit emulation

## Cut from v1

Owned decisions, documented in [`TODOS.md`](./TODOS.md):

- **MP4 export** — server ladder rung 1 stalled; client `MediaRecorder` + GIF fallback rungs cut from v1, deferred to v2
- Trip entity (flat cities with optional `trip_label` covers v1)
- AI captions, Google Takeout import, social graph, GDPR export
- Service worker / offline mode
- 3D terrain
- i18n (English only)
- Manual theme toggle (system preference only)

## Live

- Site: [timeline.bryanlam.dev](https://timeline.bryanlam.dev)
- Best viewed on iPhone (portrait). Desktop works; the design bar is mobile.

## Docs

- [`DESIGN.md`](./DESIGN.md) — visual/UX design system. Single amber accent, arrival-pulse signature easing, no empty-state illustrations on public surfaces. Read before any UI change.
- [`docs/plan.md`](./docs/plan.md) — master implementation plan, W1–W12 schedule, locked decisions.
- [`docs/test-plan.md`](./docs/test-plan.md) — affected pages, key interactions, edge cases.
- [`docs/lighthouse/v1.0.0-baseline.json`](./docs/lighthouse/) — mobile perf baseline + diagnosis.
- [`docs/visual-review/v1.0.0/INDEX.md`](./docs/visual-review/v1.0.0/) — iPhone visual-review matrix.
- [`TODOS.md`](./TODOS.md) — v2 backlog.
- `.planning/` — GSD workflow artifacts (per-phase CONTEXT, RESEARCH, PLAN, SUMMARY, VERIFICATION).

## Develop

```sh
bun install
bun run dev         # http://localhost:5173 (vite) + :8787 (Hono)
bun run test        # vitest, 463 tests
bun run typecheck   # tsc -b --noEmit
bun run build       # tsc -b && vite build
bun run e2e         # Playwright (iPhone 13 webkit emulation)
```

Requires: Bun, Docker (for Postgres via `bun run db:up`), a `.env.local` with `VITE_MAPTILER_KEY`, Auth0 keys (both `AUTH0_*` and `VITE_AUTH0_*`), and OCI credentials. See `.env.example`.

### Map tiles

By default, MapLibre falls back to public demotiles (gray world-level polygons — fine for offline dev, not cinematic). For the real experience, get a free key at [maptiler.com](https://www.maptiler.com/) (100k requests/month free) and set `VITE_MAPTILER_KEY` in `.env.local`.

### iPhone dev over LAN

Auth0's SPA SDK requires a secure origin. On iPhone hitting `http://192.168.x.x:5173`, you'll see `auth0-spa-js must run on a secure origin`. Fix: `mkcert` + Vite HTTPS (Vite auto-detects `.dev/certs/localhost+2.pem` per `vite.config.ts:11-18`).

## Reference

Old React-Leaflet travel tracker at `~/Workspaces/timeline/` — retained for reference only. This is a greenfield reimagining, not a migration.
