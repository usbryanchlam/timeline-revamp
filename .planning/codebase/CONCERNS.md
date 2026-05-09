# Codebase Concerns

**Analysis Date:** 2026-04-27
**Phase context:** Phases 1-4 complete (reel + gestures, polish + perf, app shell + theme, backend skeleton + Auth0). Phase 5 (City CRUD + map picker) up next. Most W1 perf debt has been paid down; remaining items are smaller and well-scoped.

## Active Tech Debt

**Auth0 `redirect_uri` disagrees with plan 04-02 setup guidance:**
- Issue: `src/auth/AuthProvider.tsx:29` sends `redirect_uri: window.location.origin + '/app'`, but plan 04-02 (and the 04-02 SUMMARY's verification steps) tell the user to whitelist Allowed Callback URLs as origin-only (`http://localhost:5173`). User had to extend the Auth0 dashboard whitelist after first run.
- Files: `src/auth/AuthProvider.tsx:29`, `.planning/phases/04-backend-auth0/04-02-PLAN.md`, `.planning/phases/04-backend-auth0/04-02-SUMMARY.md`
- Impact: future fresh-tenant setup will hit the same dashboard landmine. Logged in `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/` Auth0 SPA feedback file.
- Fix approach: either (a) edit `redirect_uri` to `window.location.origin` (origin-only) and add a post-callback `Navigate to="/app"`, or (b) patch the plan/SUMMARY to instruct whitelisting `http://localhost:5173/app`. Option (a) keeps the dashboard config simpler across environments. Tracked in STATE.md "Pending Todos".

**Framer Motion in main chunk (not split):**
- Issue: Only `maplibre-gl` is in `manualChunks` (`vite.config.ts:39-41`). `framer-motion` rides in the main `index-*.js` bundle (~432 KB minified pre-gzip; framer is ~37 KB gzip of that on the LCP path).
- Files: `vite.config.ts:39-41`, `src/reel/ChapterOverlay.tsx:1`, `src/motion/variants.ts:16`
- Impact: bundle size on first visit to `/` includes Framer even though the public reel could theoretically defer it past LCP. Lighthouse mobile audit hasn't been run yet to confirm whether this trips the ≥90 perf budget.
- Fix approach: add `framer: ['framer-motion']` (and possibly `auth0: ['@auth0/auth0-react']`, since it's only used on `/app/*`) to `manualChunks`. Verify route-level code splitting still applies after the change. Tracked in STATE.md "Pending Todos".

**`usePrefersReducedMotion()` branching duplicated across three reel routes:**
- Issue: identical 3-line `const reduced = usePrefersReducedMotion(); if (reduced) return <ReducedMotionReel />; return <Reel />;` pattern in `PublicReelRoute.tsx:6`, `HandleReelRoute.tsx:10`, `AppReelRoute.tsx:13`.
- Files: `src/routes/PublicReelRoute.tsx:3-7`, `src/routes/HandleReelRoute.tsx:5-11`, `src/routes/AppReelRoute.tsx:3-14`
- Impact: low — three identical branches, no logic skew yet. Risk of skew once each route gets per-handle data inputs (Phase 9).
- Fix approach: extract `<ReelView seed={...} />` shared component once each route has distinct data. 03-01 explicitly chose to defer this until Phase 9 ("when each side has different data inputs"). Hold for now; revisit after Phase 9.

**BottomNav-vs-ChapterRail collision uses `!important`:**
- Issue: `src/index.css:96` has `bottom: calc(4rem + max(env(safe-area-inset-bottom), 32px)) !important` scoped to `.app-reel-host [data-chapter-rail]`. Required because `ChapterRail.tsx:35` sets `bottom` via inline `style={{ bottom: '...' }}` (inline > class specificity).
- Files: `src/index.css:92-96`, `src/reel/ChapterRail.tsx:35`
- Impact: works correctly; `!important` is scoped to the marker class so blast radius is one route subtree. Cosmetic / code-cleanliness only.
- Fix approach: refactor `ChapterRail` to read `bottom` from a CSS custom property (e.g. `--chapter-rail-bottom: max(env(safe-area-inset-bottom), 32px)`), then `.app-reel-host` overrides the variable instead of the property. Removes `!important`. Plan 03-02 explicitly considered and rejected this as too invasive for a layout-shell plan; revisit when ChapterRail is touched for other reasons.

## Brittle Patterns (Documented, Intentional)

**DATA-02 deferrable unique constraint owned by hand-authored migration:**
- Pattern: `cities (user_id, order_index)` UNIQUE constraint is `DEFERRABLE INITIALLY DEFERRED` and lives in `server/db/migrations/0001_cities_deferrable_unique.sql` — NOT declared in `server/db/schema.ts`.
- Files: `server/db/schema.ts:1-17` (DATA-02 OWNERSHIP NOTICE block), `server/db/migrations/0001_cities_deferrable_unique.sql`
- Why this is correct: Postgres forbids `CREATE UNIQUE INDEX` from being `DEFERRABLE`; only `ALTER TABLE … ADD CONSTRAINT … UNIQUE … DEFERRABLE` works. Drizzle Kit can only model unique INDEXes. If the constraint were declared via `uniqueIndex(...)` in schema.ts, every future `bun run db:generate` would diff against the live DB, see "no matching index," and silently re-introduce a non-deferrable index — breaking DATA-03's bulk reorder transaction.
- Constraint on future work: future developers MUST NOT add a `uniqueIndex(table.userId, table.orderIndex)` (or equivalent) declaration to `server/db/schema.ts`. The OWNERSHIP NOTICE comment block at the top of schema.ts is the canonical reminder. CI/code review should treat any reintroduction of that index as a regression.

**Drizzle journal required hand-edit for migration 0001:**
- Pattern: `server/db/migrations/meta/_journal.json:16` was hand-edited to register `0001_cities_deferrable_unique` (idx=1, version=7, breakpoints=true) because `drizzle-kit generate` only writes journal entries for migrations it produced itself.
- Files: `server/db/migrations/meta/_journal.json`
- Constraint: any future hand-authored SQL migration (e.g. for triggers, partial indexes, or other constraint types Drizzle can't model) needs the same hand-edit to `_journal.json`. Without it, `bun run db:migrate` silently skips the file. Auto-generated migrations from `db:generate` will keep advancing the journal correctly; mixed sequences are fine, but each hand-authored file must be appended manually.

**`@server/*` path alias resolves under TS + Vitest + Vite, but NOT under tsx runtime:**
- Pattern: server-internal code uses relative imports (`./reservedWords.js`, `../env.js`); only frontend (`src/auth/HandlePickerModal.tsx`) and tests (`server/auth/jwt.test.ts`) use `@server/*`.
- Files: `tsconfig.app.json` (`@server/*: ['./server/*']`), `vitest.config.ts` (`@server` alias), `vite.config.ts` (alias). The runtime tsx process resolves nothing.
- Constraint: server code must keep using relative imports with explicit `.js` extensions. Documented in 04-01 and 04-02 SUMMARYs as auto-fixed deviations. If a future plan tells the executor to use `@server/*` inside `server/`, the API will boot-crash with `ERR_MODULE_NOT_FOUND`.

## Forward-Looking Concerns for Phase 5

**Deferrable constraint gets its first real exercise:**
- Phase 5's drag-reorder feature triggers `PATCH /api/cities/reorder` which performs a bulk UPDATE inside a single transaction. The `cities_user_id_order_index_unique` constraint being `DEFERRABLE INITIALLY DEFERRED` is what allows mid-transaction order_index swaps without intermediate uniqueness violations.
- Files: `server/db/migrations/0001_cities_deferrable_unique.sql`, `server/db/schema.ts:1-17`
- Risk: Phase 5 plan must explicitly cite the OWNERSHIP NOTICE and walk through the transaction pattern. If the executor wraps the update set in a non-transaction context, or uses `SET CONSTRAINTS ALL IMMEDIATE` accidentally, the bulk reorder will fail with constraint violations on the first swap.
- Mitigation: STATE.md "Session Continuity" already flags this. The Phase 5 planner should reference DATA-02 explicitly and include a smoke test where the reorder swaps two adjacent rows.

**BigDataCloud reverse-geocoding rate limits and key management:**
- Phase 5 prereq: a BigDataCloud API key (or chosen provider) for click-on-map → city name lookup. Free tier limits unverified.
- Files: not yet — will land in `.env.local` (likely as `VITE_BIGDATACLOUD_KEY` or proxied through the server to keep the key off the client).
- Risk: rate-limit pattern, error-on-failure UX, and whether to proxy through Hono (to keep key server-side) all need to be decided in Phase 5 planning. Free-tier check before signing up.

## Deferred to v2

These items are explicitly acknowledged in `.planning/STATE.md` ("Deferred Items") and re-listed here for continuity. Cross-reference STATE.md for the canonical list:

- Manual theme toggle UI (override of `prefers-color-scheme`) — deferred Phase 3, 4-step pickup plan recorded in `.planning/TODOS.md`.
- Per-reel server-side poster generation (first-frame render at save time) — deferred Phase 9+.
- Lighthouse mobile audit on `bun run preview` (LCP element verification, perf score ≥ 90, CLS ≤ 0.1) — Phase 2 deferred check, still not run.
- Visual review of Phase 2 motion choreography (Apple-Weather pace check on Framer + tuned flyTo) — deferred to user.
- Visual review of Phase 3 routes on iPhone (`/`, `/u/foo`, `/app/`, `/app/trips`, `/app/me`, OS dark/light toggle) — deferred to user.
- Live expired-token rejection test using natural Auth0 TTL — not feasible in one weekend; AUTH-02 SC #4 is covered by `server/auth/jwt.test.ts` using in-memory keypair injection instead.

## Resolved Since Previous Map

Items closed out during Phases 2-4 (moved here from previous CONCERNS.md):

- **W1 MapLibre-in-main-chunk bundle bloat** — resolved Phase 2 via `manualChunks: { maplibre: ['maplibre-gl'] }` (`vite.config.ts:39-41`) and dynamic import of `MapCanvas`. MapLibre is now a separate ~283 KB gzip chunk. (Verified: `dist/assets/maplibre-wqmL2Hxp.js` 1.05 MB).
- **Demotiles tile-source ceiling** — resolved Phase 2 via MapTiler `streets-v2-dark` (env-keyed `VITE_MAPTILER_KEY`), demotiles retained as fallback when key absent.
- **Empty `src/motion/` directory** — resolved Phase 2; `src/motion/variants.ts` now houses the Framer Motion shared variants.
- **No backend, no auth, no tests** — resolved across Phases 2-4: 88 vitest tests including in-memory JWT validation; full Hono + Drizzle + Postgres backend at `server/`; Auth0 wired into `/app/*` only.
- **`StateBadge` ungated in production** — resolved Phase 2 plan 02-05; StateBadge now self-gates via `import.meta.env.PROD`.
- **MapLibre lazy-CSS race** — resolved Phase 2 plan 02-07 hotfix; MapLibre's CSS imported eagerly in `src/main.tsx` instead of inside the lazy `MapCanvas` chunk, so the JS-runs-before-CSS race no longer occurs.
- **Amber token drift between `index.css` and `tailwind.config.ts`** — resolved Phase 3 plan 03-03; both files now match `DESIGN.md:85-87` exactly (`#FFE4A0`, `#FFD470`, `#E8B040`). `grep -rniE "(F5B83A|C28A1E)" src/ tailwind.config.ts` returns zero matches.
- **REQUIREMENTS.md AUTH-05..07 traceability typo** — resolved Phase 4 plan 04-02 Task 6; `.planning/REQUIREMENTS.md:152` now correctly maps AUTH-05..07 to Phase 4 (W4).
- **Phase 1/2 known quirks** (auto-play wrap, world-view first frame, StrictMode dev double-mount, gesture state-machine pure-function lock, `touch-action: none` requirement, MapLibre `interactive: false` requirement, seeded-cities zoom values) — all stable through Phase 4. No further action needed unless behavior regresses.

## Things That Could Surprise A New Reader

- **Public reel is intentionally always dark** (`DESIGN.md:72`). `--color-bg-map` is NOT in the light-mode override block in `src/index.css`. Reel surfaces stay dark even when OS is in light mode. Don't "fix" this.
- **`AuthProvider` mounts inside `AppLayout`, not `main.tsx` or `App.tsx`** — AUTH-04 grep-enforced. The only files that may import `@auth0/auth0-react` are `src/auth/AuthProvider.tsx`, `src/auth/useApi.ts`, and `src/components/RequireAuth.tsx`. Importing it elsewhere (especially in any public route) breaks AUTH-04 and ships the SDK on the public reel.
- **Dual env-var sets are by design**: `.env.local` carries both `AUTH0_*` (server reads) and `VITE_AUTH0_*` (frontend reads). SPAs ship `client_id` in JS bundles by definition; duplicating the value is not a secret leak.
- **`src/components/RequireAuth.tsx`** is no longer a Phase-3 stub — Phase 4 replaced its body with the real Auth0 session check + `<Navigate to="/" />` redirect. Check the file before assuming any "stub" behavior.
- **gstack docs are primary, repo `docs/` is a snapshot.** Edits to `docs/plan.md` won't propagate to gstack — edit the gstack source or sync afterward.
