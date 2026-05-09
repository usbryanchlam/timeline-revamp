# Testing Patterns

**Analysis Date:** 2026-04-27
**Phase:** Post-Phase 4 (Vitest live; 88 tests across frontend + server)

## Test Framework

**Runner:** Vitest 4.1.5 (`devDependencies` in `package.json:52`).
**Coverage:** `@vitest/coverage-v8` 4.1.5 — v8 provider (`vitest.config.ts:20`).
**Config:** `/Users/bryanlam/Workspaces/timeline-revamp/vitest.config.ts` — Node environment, globals on, single suite spans both `src/**` and `server/**`.

## Run Commands

```bash
bun run test            # vitest run — single pass, what CI uses
bun run test:watch      # vitest — watch mode
bun run test:coverage   # vitest run --coverage — v8 lcov + text report
```

**CRITICAL: use `bun run test`, NOT `bun test`.** Bare `bun test` invokes Bun's native test runner which (a) doesn't load `vitest.config.ts` and therefore doesn't resolve the `@/` alias, and (b) doesn't recognize Vitest's `describe`/`it`/`expect` globals from the `vitest/globals` types. Always go through the npm script so `vitest` runs.

## Test Inventory (88 total)

| File                                          | Count | Coverage Target                               |
|-----------------------------------------------|-------|-----------------------------------------------|
| `src/gestures/stateMachine.test.ts`           | 85    | `stateMachine.ts` — 100% line + branch        |
| `server/auth/jwt.test.ts`                     |  3    | `requireJwt` middleware — AUTH-02 SC #4 gate  |

No e2e tests (no Playwright yet). No integration tests against Postgres yet. No React component tests (no jsdom/RTL configured — Vitest env is `node`).

## Test File Organization

- **Co-located with source:** `src/gestures/stateMachine.test.ts` sits beside `stateMachine.ts`; `server/auth/jwt.test.ts` sits beside `jwt.ts`.
- **Naming:** `<module>.test.ts` matches Vitest's default include and the `vitest.config.ts` patterns (`src/**/*.test.ts`, `src/**/*.test.tsx`, `server/**/*.test.ts`).
- **Coverage scope** (`vitest.config.ts:21-29`): includes `src/**/*.{ts,tsx}` and `server/**/*.ts`; excludes test files, `src/main.tsx` (entrypoint), `src/vite-env.d.ts`, and `src/data/**` (pure data tables).

## Patterns

### Pure-function unit tests (`stateMachine.test.ts`)

The state machine is a pure `(state, event, totalChapters) => state` function, so tests call it directly — no mocks, no setup. A `withState(overrides)` helper merges partial state over `initialState(TOTAL)` (`stateMachine.test.ts:10-12`):

```typescript
function withState(overrides: Partial<ReelState>): ReelState {
  return { ...initialState(TOTAL), ...overrides };
}
```

Suites are organized by event type (`describe('VIS_HIDDEN', ...)`, etc.), with one `it` per source/target state pair. This is what gets to 100% line + branch coverage on `stateMachine.ts` — every transition has a dedicated assertion.

### Middleware tests with in-memory JWKS (`server/auth/jwt.test.ts`)

The JWT middleware test mints real RS256 tokens against an in-memory keypair using `jose` — no live Auth0 tenant needed:

1. Set `process.env.{DATABASE_URL,AUTH0_DOMAIN,AUTH0_AUDIENCE}` BEFORE the dynamic import of `./jwt.js` (`jwt.test.ts:16-18`). Reason: `server/env.ts` validates synchronously at import time and calls `process.exit(1)` on failure — top-level static imports would race the env setup and kill the runner.
2. `beforeAll` generates an RS256 keypair with `jose.generateKeyPair`, exports the public half as a JWK with a fixed `kid`, and installs it via `__setJwksGetterForTest(createLocalJWKSet({ keys: [jwk] }))` (`jwt.test.ts:28-40`).
3. Each test uses a `mint(opts)` helper around `jose.SignJWT` to produce expired / wrong-audience / valid tokens, then exercises a fresh Hono app with `app.request('/me', { headers: { authorization: ... } })`.

Three assertions cover the AUTH-02 SC #4 gate: expired → 401, wrong audience → 401, valid → 200 with `c.var.auth0Sub` set.

**Why it's structured this way:**
- `__setJwksGetterForTest` is exported with a `__` prefix so it's visually flagged as test-only (`server/auth/jwt.ts:32`).
- The `localGetter as never` cast (`jwt.test.ts:39`) bridges `createLocalJWKSet` and `createRemoteJWKSet` getter types — runtime shape is identical, only the named type differs.
- Hono's built-in `app.request(...)` lets us run middleware against synthetic Requests without a server socket.

## Mocking Philosophy

- **Don't mock pure functions.** The state machine has no mocks anywhere — it's just called.
- **Don't mock at the network layer when you can swap a dependency.** `jwt.test.ts` swaps the JWKS getter, not `fetch`.
- **No MapLibre or React component mocks** — there are no component tests yet; when they land, RTL + a real DOM env (jsdom or happy-dom) will be required.

## Coverage

Run `bun run test:coverage`. Reports go to stdout (text) and `coverage/` (lcov + html). Current state machine coverage is 100% line + branch by design — every transition is asserted. JWT middleware coverage is partial (the three SC #4 paths) — the missing-bearer and missing-sub branches are not yet asserted but are easy adds.

The 80% project-wide target from `~/.claude/rules/common/testing.md` is not met overall (most of `src/**` and `server/**` is uncovered) — that's intentional for now, with component tests and Postgres integration tests gated on later phases.

## Anti-Patterns to Avoid

- **`bun test` instead of `bun run test`** — Bun's native runner doesn't resolve `@/` and ignores `vitest.config.ts`.
- **Top-level static `import` of `./jwt.js` in `jwt.test.ts`** — env validation will run before the test sets env vars and the runner dies. Use the `await import(...)` pattern.
- **Mocking the gesture state machine.** It's pure — call it directly.
- **Hitting real Auth0 in unit tests.** Use the in-memory JWKS pattern.
- **JSDOM for `prefers-reduced-motion`.** JSDOM's matchMedia is a stub; reach for Playwright `reducedMotion` emulation when component tests land.

## Planned Additions (not yet wired)

- React Testing Library for `ChapterRail`, `ChapterOverlay`, `ReducedMotionReel` (requires switching `vitest.config.ts:12` env to `jsdom` or per-file `// @vitest-environment jsdom`).
- Postgres integration tests using a Drizzle schema migration against a disposable Docker pg container.
- Playwright E2E for the public reel auto-play, reduced-motion fallback, and keyboard controls.

---

*Testing refreshed: 2026-04-27*
