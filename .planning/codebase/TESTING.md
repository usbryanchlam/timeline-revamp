# Testing

**Analysis Date:** 2026-06-19

## Framework

**Vitest 4.x** is the single test runner. No Jest, no Bun's built-in `bun test`.

**Critical:** Run tests via `bun run test` (which invokes `vitest run`). Do NOT run `bun test` directly — Bun's built-in runner does not resolve the `@/` path alias from `vite.config.ts` and the import-graph will fail with `Cannot find module '@/...'`.

Scripts in `package.json`:
- `bun run test` — `vitest run` (CI mode, one-shot)
- `bun run test:watch` — `vitest` (watch mode for development)
- `bun run test:coverage` — `vitest run --coverage`
- `bun run typecheck` — `tsc -b --noEmit`

**Total test count: 415** as of UAT round close (v0.2.4). Growth trajectory:
- Post-Phase 4: 88 tests
- Post-Phase 5: 140 tests (+52)
- Post-Phase 6: 235 tests (+95)
- Post-Phase 7: 348 tests (+113)
- Post-Phase 9 + UAT: 415 tests (+67 across UAT for PlayPauseIndicator + mid-flight retarget tests + workflow-fix tests)

## Environment Selection (Per-File, Not Global)

`vitest.config.ts` defaults to the **Node** environment. Browser-dependent tests opt in to **jsdom** via a per-file annotation at the top of the file:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
```

**Why per-file, not global:** the `jose` library (used by `server/auth/jwt.ts` for JWKS validation) does Uint8Array coercion that fails inside jsdom's environment. Server tests therefore stay in node; only frontend component tests opt in to jsdom.

**Examples:**
- Node (default): `server/routes/*.test.ts`, `src/data/*.test.ts`, `src/gestures/stateMachine.test.ts`, `src/reel/timing.test.ts`, `src/photos/*.test.ts`.
- jsdom: `src/reel/PlayPauseIndicator.test.tsx`, `src/components/PhotoUploader.test.tsx`, `src/auth/HandlePickerModal.test.tsx`, `src/routes/TripsRoute.test.tsx`, etc.

## Mock Injection Pattern (`__setXClientForTest`)

Server modules that depend on lazily-constructed external clients expose a test-only injection hook so tests can substitute fakes without monkey-patching globals.

**Examples:**
- `server/oci/parClient.ts` — `__setOciClientForTest(client | null)` overrides `getOciClient()`. The PEM file is read only at first call; if a test imports any route that calls `getOciClient()` during module load, the test MUST inject a fake BEFORE the import resolves, or it'll `EACCES` on the missing PEM in CI. See `server/routes/publicReel.test.ts` for the pattern.
- `server/auth/jwt.ts` — `__setJwksGetterForTest(getter)` overrides the JWKS fetch. Tests use `jose.SignJWT` + `createLocalJWKSet` to mint test tokens with no live Auth0 needed.

**Critical lesson** (memory: `feedback_we_dont_need_the_mock_is_usually_wrong.md`): lazy SDK getters fire BEFORE method calls. A route that does `import { citiesRouter }` triggers any `getOciClient()` at the top level of dependent modules. **Always inject `__setXClientForTest` mocks unless you've personally verified the import graph never reaches the getter.**

## StrictMode-Aware Test Patterns

React 18 StrictMode double-invokes effects in dev. Two patterns to know:

**`mountedRef` re-anchor inside effect body** (memory: `feedback_mountedref_strictmode.md`):

```ts
const mountedRef = useRef(true);
useEffect(() => {
  mountedRef.current = true;          // re-anchor on (re-)mount
  return () => { mountedRef.current = false; };
}, []);
```

Tests that exercise StrictMode (e.g. `PhotoDetailSheet.test.tsx`) double-mount via `<StrictMode>` wrapper and assert the Save button does not get stuck in "Saving" state — the bug class this pattern guards against.

**Timer cleanup in async effects** — when a hook schedules `setTimeout` / `setInterval`, the test must verify cleanup runs on unmount. Most reel tests use `vi.useFakeTimers()` + `vi.advanceTimersByTime(N)` to step through timers deterministically.

## Hermetic-Constant Tests

When a test depends on a UAT-tunable constant (e.g., `AUTOPLAY_DWELL_MS`, `FLY_DURATION_MS`), it MUST pin the constant explicitly via prop rather than read the module's exported value.

**Example** (`src/reel/PhotoCycle.test.tsx`):

```ts
// Bad — breaks when UAT tunes AUTOPLAY_DWELL_MS:
render(<PhotoCycle photos={twoPhotos} />);
vi.advanceTimersByTime(2250); // 4500/2 from a past constant

// Good — hermetic against tuning:
render(<PhotoCycle photos={twoPhotos} dwellMs={4500} />);
vi.advanceTimersByTime(2250);
```

This pattern was introduced in UAT round v0.2.0 when bumping `AUTOPLAY_DWELL_MS` 4500 → 8000 broke `PhotoCycle.test.tsx`'s hardcoded `2250ms` and `1500ms` expectations.

`src/reel/timing.test.ts` similarly tests the `cycleIntervalForPhotoCount` formula by passing explicit `dwellMs` arguments rather than relying on the default `AUTOPLAY_DWELL_MS`.

## Grep-Enforced Project Invariants (Meta-Tests)

Files named `__*.test.ts` (double-underscore prefix) are project invariants enforced by code-search. They walk the codebase and fail the build if a forbidden pattern is present.

**Example** — `server/auth/__no-bigdatacloud.test.ts`:
- Walks `server/**/*.ts` and fails if any file mentions the string `bigdatacloud`.
- Enforces the Phase 5 decision: BigDataCloud reverse-geocoding is client-side only per the provider's Fair Use Policy.

**Hazard** (memory: `feedback_grep_guard_vs_comments.md`): grep-based acceptance guards count comment text. If you want to discuss a banned pattern in a comment, **paraphrase** or **strip the literal** — `// uses the geocoding service that begins with B` rather than `// not bigdatacloud`. The double-underscore meta-test would fail on the latter.

## CI Test Environment (GHA `verify` job)

`.github/workflows/deploy.yml` `verify` job:
- Runs on `ubuntu-latest` with `actions/checkout@v5` + `oven-sh/setup-bun@v2` (bun-version: `1.3.12`).
- Postgres 16 service container at `localhost:5432` with `timeline:timeline_ci_pw@timeline`.
- Stub env vars set in `env:` block: `AUTH0_DOMAIN=test.example.auth0.com`, `AUTH0_AUDIENCE=https://api.test.example.com` (memory: `feedback_module_load_env_validation_blocks_ci.md` — Zod parse at module load needs these stubs even for unit tests that mock auth).
- Steps: `bun install --frozen-lockfile` → `bun run typecheck` → `bun run db:migrate` (against the service Postgres) → `bun run test`.
- `db:migrate` is needed because integration tests (`publicReel.test.ts`, `cities.test.ts`, `photos.test.ts`) require a migrated schema.

## Coverage Targets

- `stateMachine.ts`: **100% line + branch coverage** (Phase 2 decision; pure-function-easy goal).
- Other modules: no formal threshold; coverage check on critical paths is the practice (cities CRUD, photos pipeline, gesture transitions).
- `bun run test:coverage` generates the report; not enforced in CI yet.

## Naming + Layout Conventions

- Co-located: `src/reel/timing.ts` + `src/reel/timing.test.ts`. Server: `server/routes/cities.ts` + `server/routes/cities.test.ts`.
- Component tests: `.test.tsx` (TSX needed for JSX in tests). Pure-logic tests: `.test.ts`.
- File-size ceiling: ~800 lines for test files. **`server/routes/cities.test.ts` is at 945 lines** (over) — flagged in CONCERNS.md for natural splits (`cities.read.test.ts`, `cities.write.test.ts`, `cities.reorder.test.ts` + shared `cities.test.helpers.ts`).
- React Testing Library is the component-testing primitive. `render`, `screen.getByRole/Text/TestId`, `userEvent` for interactions.
- `data-testid` used sparingly — prefer role/text queries. Allowed where the visual element has no semantic role (e.g. `data-testid="play-pause-transient"` in `PlayPauseIndicator.tsx`).

## Stream-Watchdog Recovery (Operational Pattern)

When executor agents stall mid-test-suite (observed in Phases 5/6/7 — 4 occurrences), atomic-per-task commits make recovery trivial: `git log --oneline` shows the last completed task, `ls` shows what made it to disk, fresh agent can resume from the next task. This is a workflow-level pattern, not a test framework concern, but it has shaped the per-task commit discipline that lets tests serve as the source of truth on recovery.
