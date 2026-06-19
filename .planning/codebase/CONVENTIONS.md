# Coding Conventions

**Analysis Date:** 2026-06-19

## Design Contract — Read DESIGN.md FIRST

**`DESIGN.md` is the canonical design contract.** Read it before any UI, motion, or color change. The runtime is downstream of the design contract — when constants here drift from DESIGN.md, fix DESIGN.md first or update both atomically.

Three load-bearing risks locked in DESIGN.md:
1. **Single amber accent** — `amber-400` (`#FFE4A0`), `amber-500` (`#FFD470`), `amber-600` (`#E8B040`). No other accent color is permitted. Amber is a brand color, not a theme color — it is intentionally NOT overridden in light mode (`src/index.css`).
2. **Arrival-pulse signature easing** — `cubic-bezier(0.16, 1, 0.3, 1)` exposed as `--ease-arrival` (`src/index.css:19`) / `theme.transitionTimingFunction.arrival` (`tailwind.config.ts:37`). Reserved for the amber-pin pulse on chapter landing. Distinct from `--ease-camera` (`cubic-bezier(0.22, 1, 0.36, 1)`), which is the long settling curve for the map flight.
3. **No empty-state illustrations on public surfaces.** Public reel routes must render content or a minimal text fallback — no decorative empty states.

**Public reel is always dark** (DESIGN.md:72). In `src/index.css` light-mode block, `--color-bg-map` is intentionally NOT overridden. Reel scrim utilities (`.scrim-bottom`, `.scrim-top`) carry comments `/* Reel surface — always dark per DESIGN.md:72. Do not theme. */` — preserve them on any edits.

## Single Source of Truth: Motion Constants

Two files own all reel motion constants. Importing the numbers anywhere else is forbidden — read from these modules.

**`src/reel/motion.ts`** — camera flight:
- `FLY_DURATION_MS = 8000` — MapLibre `flyTo` duration. Tuned UAT round v0.2.0 from `2400 → 8000` for the "taking flight" feel.
- `FLY_CURVE = 2.2` — MapLibre `curve` parameter.
- `easeCamera(t)` — Newton-Raphson bezier(0.25, 0.1, 0.25, 1.0) solver for the per-tick easing.
- Re-exported by `src/gestures/stateMachine.ts` so the gesture `CHAPTER_FLY_DONE` timer stays in lockstep with the visual flight (`stateMachine.ts:66`).

**`src/reel/timing.ts`** — autoplay & photo cycling:
- `AUTOPLAY_DWELL_MS = 8000` — per-chapter dwell after `CHAPTER_FLY_DONE`. UAT round v0.2.0 tuned `4500 → 8000`. Invariant: `AUTOPLAY_DWELL_MS >= FLY_DURATION_MS` (otherwise autoplay advances mid-fly).
- `CROSSFADE_MS = 200` — photo crossfade inside a chapter.
- `MIN_CYCLE_INTERVAL_MS = 800` — floor for per-photo display time.
- `cycleIntervalForPhotoCount(n, dwellMs?)` — clamped slice; returns `0` for `n <= 1`.

**Tuning rule:** When changing `FLY_DURATION_MS`, verify `AUTOPLAY_DWELL_MS >= FLY_DURATION_MS` and update DESIGN.md "Motion" section in the same commit.

## Design Tokens

**CSS variables** (`src/index.css:5-31`):
- Color: `--color-bg`, `--color-bg-elev`, `--color-bg-map`, `--color-ink`, `--color-ink-dim`, `--color-ink-mute`, `--color-amber-{400,500,600}`, `--color-line`.
- Easing: `--ease-camera`, `--ease-arrival`, `--ease-ui`, `--ease-exit`.
- Duration: `--dur-instant` (120ms), `--dur-fast` (200ms), `--dur-base` (320ms), `--dur-slow` (480ms), `--dur-flyto` (1400ms), `--dur-pulse` (720ms).

**Tailwind token aliases** (`tailwind.config.ts`):
- `text-ink` (white), `text-ink-dim`, `text-ink-mute`.
- `bg-bg`, `bg-bg-elev`, `bg-bg-map`.
- `text-amber-{400,500,600}` / `bg-amber-*`.
- `ease-camera`, `ease-arrival`, `ease-ui`, `ease-exit` (transition-timing-function utilities).
- `font-display` (Inter Tight), `font-sans` (Inter).
- `tracking-display` (`-0.035em`), `tracking-caps` (`0.06em`).

**Component utilities** (`src/index.css:100-126`):
- `.glass-pill` — translucent pill with `backdrop-filter: blur(16px) saturate(140%)`.
- `.scrim-bottom`, `.scrim-top` — reel scrim gradients (do NOT theme).

**Typography utilities** (`src/index.css:128-142`):
- `.text-display` — Inter Tight 800, tight tracking, line-height 0.95.
- `.text-caps` — Inter 600, uppercase, `0.06em` tracking.
- `.text-h1` — applied as Tailwind class combos inline; no global utility class.

**Animation utilities** (`src/index.css:144-161`):
- `.animate-arrival` — `arrival-pulse var(--dur-pulse) var(--ease-arrival)`.

## Naming Patterns

**Files:**
- React components: `PascalCase.tsx` (e.g., `PhotoUploader.tsx`, `ChapterRail.tsx`).
- Hooks: `useThing.ts` (e.g., `useAllPhotos.ts`, `useGestureMachine.ts`).
- Pure utilities: `camelCase.ts` (e.g., `cityToChapter.ts`, `groupChapters.ts`).
- Tests: co-located, suffix `.test.ts` / `.test.tsx`.
- Meta-test files (project-wide invariants): prefix `__` (e.g., `__no-bigdatacloud.test.ts`).

**Server modules:**
- One router per resource: `server/routes/<resource>.ts` exports `<resource>Router`.
- Tests sit beside source: `server/routes/cities.ts` + `server/routes/cities.test.ts`.

**Functions:**
- `camelCase` for runtime functions.
- `SCREAMING_SNAKE_CASE` for `as const` constants (`FLY_DURATION_MS`, `PER_CITY_LIMIT`, `SUB_A`).
- Test-only seams: `__setXForTest` (double-underscore prefix), e.g., `__setJwksGetterForTest`, `__setOciClientForTest`. NEVER use `__setXForTest` for production code paths.

**Types:**
- `PascalCase` interfaces (`ReelState`, `PhotoCard`, `CityDTO`).
- DTO suffix (`CityDTO`, `PhotoDTO`) for over-the-wire shapes.
- `Schema` suffix for Zod schemas (`createCitySchema`, `uploadUrlSchema`).

## Code Style

**Formatting:**
- No Prettier / ESLint / Biome config in the repo. Style is consistent across files but not tool-enforced.
- 2-space indent, single quotes for strings, trailing commas in multi-line literals, semicolons mandatory.
- 80–100 char soft wrap (followed in practice; not enforced).

**TypeScript strictness:**
- `import type` for type-only imports.
- `as const` for narrow literals where the constness is load-bearing (`FLY_DURATION_MS = 8000 as const`).
- `Readonly<T>` / `readonly` on all DTO and props interfaces.
- `satisfies` over `as` for config objects (`tailwind.config.ts:44`).

## Import Organization

Order in practice across `src/` and `server/`:
1. Node / framework built-ins (`'react'`, `'hono'`, `'node:url'`, `'zod'`).
2. Third-party SDKs (`'jose'`, `'drizzle-orm'`, `'@dnd-kit/sortable'`).
3. Path-aliased project imports (`'@/...'`, `'@server/...'`).
4. Relative sibling imports (`'./Module'`, `'../db/client.js'`).
5. Type-only imports last within each group when separated.

**Path aliases** (`vitest.config.ts:6-9` + `tsconfig.*.json`):
- `@/` → `src/`
- `@server/` → `server/`

**Server-side ESM gotcha:** Relative imports in `server/` must include the `.js` extension (e.g., `from '../db/client.js'`) because the server runs as ESM under `tsx watch`. Bare `require()` is undefined — use `createRequire(import.meta.url)` when bridging CJS-only SDKs (see `server/oci/parClient.ts:10`).

## Immutability

Mutation is forbidden in the gesture state machine and the reel pipeline. Use spread for object updates, `Array.prototype.map` for derived collections.

Canonical example — `src/gestures/stateMachine.ts`:
```ts
case 'CHAPTER_FLY_DONE': {
  if (state.name !== 'CHAPTER_SWIPE') return state;
  return { ...state, name: 'IDLE' };
}
```

Every `transition()` branch returns a NEW `ReelState` (never mutates). `env` is frozen at module load (`server/env.ts:42`: `Object.freeze(parsed.data)`).

## State Machine Purity

**`src/gestures/stateMachine.ts` is a pure function. No DOM, no timers, no React.**
- Single export `transition(state, event, totalChapters)` returns a new `ReelState`.
- All effects (timer scheduling, DOM listeners, requestAnimationFrame, autoplay) live in `src/gestures/useGestureMachine.ts`.
- This separation is load-bearing for the unit tests in `stateMachine.test.ts` — they exercise every transition with zero mocking.

When adding new gesture behavior:
1. Add the event variant to `ReelEvent` in `stateMachine.ts`.
2. Add a `case` returning a new state.
3. Add unit tests against `transition()` directly.
4. Wire the DOM-side trigger inside `useGestureMachine.ts`.

## Error Handling

**Client:**
- `try`/`catch` around `await` calls; mount-guard before any post-await `setState` or callback (see Mount Guard section).
- User-facing errors via narrow constants (`NETWORK_ERROR`, `CONFLICT_ERROR` in `CityForm.tsx`). Never raw exception messages in UI.
- Read error body shape from JSON envelope: `{ error?: string, issues?: Issue[] }`.

**Server:**
- Zod validation at every boundary; failure returns `c.json({ error: 'invalid_input', issues: parsed.error.issues }, 422)`.
- Catch only the specific pg error codes you're collapsing; re-throw everything else so it surfaces as 500 via the global `onErrorHandler` (`server/index.ts:102`).
- Global handler differentiates `HTTPException` (re-emit verbatim) from generic `Error` (log stack to stderr with request id, return sanitized JSON).

**Postgres error codes — REQUIRED helper `pgErrorCode`** (`server/db/pgError.ts`):

Drizzle wraps pg errors in `DrizzleQueryError`, placing the SQLSTATE on `err.cause.code`. Raw pg throws errors with `err.code` directly. **Naïve `err.code === '23505'` checks SILENTLY NEVER FIRE** in Drizzle paths. Always use:

```ts
import { pgErrorCode } from '../db/pgError.js';

try {
  await db.insert(cities).values(...);
} catch (err) {
  if (pgErrorCode(err) === '23505') return c.json({ error: 'conflict_retry' }, 409);
  if (pgErrorCode(err) === '22P02') return c.json({ error: 'not_found' }, 404);
  throw err; // bubble unknown failures to onErrorHandler
}
```

This is mandatory for every server catch block that branches on a pg SQLSTATE.

## Mount Guard Pattern (React 18 StrictMode)

**Re-anchor `mountedRef` to `true` inside the effect body — not cleanup-only.**

Under React 18 StrictMode dev double-invoke, a cleanup-only ref leaves `mountedRef.current = false` after the first cleanup, so the live second mount's post-await branches never run and Save buttons get stuck. The correct shape (canonical in `src/components/CityForm.tsx:106-116`):

```ts
const mountedRef = useRef(true);
useEffect(() => {
  // Reset on every (re-)mount — StrictMode double-invokes mount/cleanup in dev.
  mountedRef.current = true;
  return () => {
    mountedRef.current = false;
  };
}, []);
```

Mirror this verbatim in `src/components/PhotoUploader.tsx:30-38` and `src/components/PhotoDetailSheet.tsx`. Any new component with async submits + mid-submit cancel MUST use this pattern.

Then guard around every post-await access:
```ts
const res = await api(...);
if (!mountedRef.current) return;
// ... safe to setState here
```

## Date Input Timezone Anchor

Date inputs return `"YYYY-MM-DD"` with no timezone. The server's `z.coerce.date()` parses this as UTC midnight, which renders back one day off for users east/west of UTC. Anchor to LOCAL midnight before sending:

```ts
// src/components/CityForm.tsx:157
const arrivedAtIso = new Date(`${arrivedAt}T00:00:00`).toISOString();
```

The `T00:00:00` suffix (no `Z`) makes the `Date` constructor parse in local time. Required for every client POST/PATCH that ships a user-picked date.

## Auth0 SDK Scoping (AUTH-04)

**`@auth0/auth0-react` is forbidden in public routes.** Public surfaces (`/`, `/u/:handle`, `NotFound`) must not import from `@auth0/auth0-react` either directly or transitively. The SDK + `Auth0Provider` are scoped to `/app/*` only, mounted in `src/auth/AuthProvider.tsx` inside `AppLayout`.

Allowed import sites (audit list as of 2026-06-19):
- `src/auth/AuthProvider.tsx`
- `src/auth/HandlePickerGate.tsx`
- `src/auth/useApi.ts`
- `src/components/RequireAuth.tsx`
- `src/routes/MeRoute.tsx`

The grep-enforced architectural-invariant test pattern lives at `server/auth/__no-bigdatacloud.test.ts` — a walker over `server/**/*.ts` looking for a forbidden literal. Mirror that shape for any future grep-enforced invariants; the leading `__` prefix lets the walker skip itself.

## Hono Route Ordering — Literal Before Parameterized

Hono matches routes in registration order. Literal segments MUST be registered BEFORE pure-parameter catch-alls:

```ts
// server/routes/cities.ts (correct)
citiesRouter.patch('/reorder', ...);  // literal: registered first
citiesRouter.patch('/:id', ...);      // parameterized: registered second
```

If `/:id` registered first, `PATCH /reorder` would match `id="reorder"` and fail. Same pattern in `photos.ts` (`POST /:id/finalize` before `DELETE /:id`; `POST /upload-url` before any future parameterized routes in the nested router).

A regression-guard test for this lives in the cities suite. When adding new literal segments under any router, register them first and extend the guard test.

Same rule at the server-level mount order (`server/index.ts`): public auth-less routes (`/api/handles/check`, `/api/public/u/*`) MUST be registered BEFORE the `app.use('/api/me', requireJwt, ...)` middleware mounts.

## Logging

No `console.log`. Server-side logging goes to `process.stderr.write(...)` (for errors / per-request log lines) or `process.stdout.write(...)` (for the server-start banner). See:
- `server/auth/jwt.ts:85` — JWT validation failure logged to stderr without leaking which validation step failed.
- `server/index.ts:32-39` — custom logger middleware that includes `c.get('requestId')`.
- `server/index.ts:108` — global error handler logs stack + request id to stderr.

Each log line should include `c.get('requestId')` for correlation when emitted from a request handler.

## Validation

Zod is the only validation library. Schemas live in `server/validation/<resource>Input.ts`. Patterns:
- `.strict()` for create/update DTOs so unknown keys reject with 422 (prevents accidental client-side `orderIndex` smuggling, see `server/routes/cities.ts:73`).
- Path-param UUID checks use `z.string().uuid().safeParse(...)`; failures collapse to 404 (path structure is implementation detail, not user feedback).
- Body validation: read JSON with `c.req.json().catch(() => null)` then `schema.safeParse(raw)`.

## Function & File Size

- Functions: prefer < 50 lines. State machine `transition()` is the legitimate exception (~230 lines, structured as switch over event variants).
- Files: 200–400 lines typical; `server/routes/cities.ts` and `server/routes/photos.ts` push 500+ — at that size, factor into sub-handlers.
- Extract pure helpers into siblings (`groupChapters.ts`, `chaptersWithPhotos.ts`, `pgError.ts`) rather than inlining.

## Test Count Tracking

**415 tests as of UAT round close v0.2.4** (was 405 at v0.2.0 start; +8 PlayPauseIndicator + 3 mid-flight retarget +/− existing). Tracked per-phase in `.planning/STATE.md`. When adding tests, increment the STATE.md count in the same commit as the test.

## OCI Deploy Specifics

Container runs as uid 1001. On the VM:
- `.oci/` directory: **mode 711** (NOT 700). 711 lets the container traverse without leaking directory listing; 700 blocks the container's uid-1001 process from reading the PEM.
- PEM file inside `.oci/`: mode 400, owned by uid 1001.

Surfaced and fixed in UAT round v0.2.3.

## Release Flow

Single command — release uses `npm version` to atomically bump `package.json.version` and tag:

```bash
npm version <patch|minor|major> -m "chore: release v%s" && git push --follow-tags
```

The deploy workflow's tag-match guard (`.github/workflows/deploy.yml:108-116`) compares `$GITHUB_REF_NAME` to `v$(node -p "require('./package.json').version")` and fails the build if they diverge. This guard exists specifically to catch the "tagged but forgot to bump package.json" mistake — do NOT bypass it by tagging manually.

## Comments

Comments explain WHY, not WHAT. The codebase carries unusually rich comments that document:
- Architectural rationale (e.g., why `--color-bg-map` is excluded from light mode).
- Cross-file invariants (e.g., why `FLY_DURATION_MS` is re-exported from `stateMachine.ts`).
- Known pitfalls and the fix (e.g., the `createRequire` bridge in `server/oci/parClient.ts:5-10`).
- References to source-of-truth docs (`DESIGN.md`, `REQUIREMENTS.md`, phase plans, feedback memory).

When you remove or refactor code that a comment references, update the comment in the same edit.

## Code Quality Checklist

Before marking work complete:
- [ ] Followed DESIGN.md (or updated it intentionally).
- [ ] No new motion constants outside `src/reel/motion.ts` / `src/reel/timing.ts`.
- [ ] No `@auth0/auth0-react` imports in public-route files.
- [ ] Hono routes: literal paths registered before parameterized ones.
- [ ] Server catch blocks for pg codes use `pgErrorCode(err)` (not `err.code`).
- [ ] Mount-guard refs re-anchored to `true` inside the effect body.
- [ ] Date-input ISOs anchor to local midnight via `${ymd}T00:00:00`.
- [ ] No `console.log`; logs go to `process.stderr.write` / `process.stdout.write`.
- [ ] Zod schemas for all new request bodies; `.strict()` for create/update.
- [ ] STATE.md test count updated if test count changed.

---

*Convention analysis: 2026-06-19*
