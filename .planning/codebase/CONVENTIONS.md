# Coding Conventions

**Analysis Date:** 2026-04-27
**Phase:** Post-Phase 4 (Vitest live, jose JWT validation tested)

## Naming Patterns

**Files:**
- React components: `PascalCase.tsx` (e.g., `ChapterOverlay.tsx`, `MapCanvas.tsx`, `HandlePickerModal.tsx`).
- Hooks: `useCamelCase.ts` (e.g., `useGestureMachine.ts`, `usePrefersReducedMotion.ts`, `useApi.ts`).
- Pure modules: `camelCase.ts` (e.g., `stateMachine.ts`, `lazyProvision.ts`).
- Server routes: noun module per resource (`server/routes/me.ts`).
- Data modules: `kebab-case.ts` (e.g., `seeded-cities.ts`).
- Tests: `<source>.test.ts` co-located beside the source (e.g., `stateMachine.test.ts`, `server/auth/jwt.test.ts`).

**Functions, variables, types:**
- `camelCase` for functions and variables; exported components are `export function PascalCase()` — named exports, no defaults.
- `UPPER_SNAKE_CASE` for tunable module-level constants (`LONG_PRESS_MS`, `FLICK_THRESHOLD_PX`, `ISSUER` in `server/auth/jwt.ts:22`).
- Refs suffixed `Ref` (e.g., `pointersRef`, `mapRef`).
- `PascalCase` for `interface` and `type` aliases. No `I` prefix. Discriminated unions on `type` field (`ReelEvent`, Auth0Payload extends `JWTPayload` at `server/auth/jwt.ts:44`).
- Test stubs use the `__doubleUnderscorePrefix` convention to flag a non-production export (`__setJwksGetterForTest` at `server/auth/jwt.ts:32`).

## Module Shape

- One concept per file. Components, hooks, pure modules, routes each get their own.
- No barrel `index.ts` re-exports.
- No default exports — named exports only.
- Files target ~200–400 lines; the only file pushing that envelope is `src/gestures/stateMachine.test.ts` (822 lines, intentional — exhaustive transition coverage).

## Imports

**Frontend (`src/**`)** — TypeScript project `tsconfig.app.json` uses `moduleResolution: "bundler"` and Vite resolves the alias:
- `@/...` for cross-directory imports (e.g., `import { initialState } from '@/gestures/stateMachine'` at `stateMachine.test.ts:1`).
- Relative `./` only inside the same directory.
- No file extension on imports — Vite/bundler resolves.

**Server (`server/**`, `scripts/**`)** — TypeScript project `tsconfig.server.json` uses `module: "NodeNext"`. The `@server/*` path alias is declared but **does not resolve at `tsx` runtime**. Phase 4 fell back to relative imports with explicit `.js` extensions:
- `import { env } from './env.js'` (`server/index.ts:4`).
- `import { requireJwt } from './auth/jwt.js'` (`server/index.ts:5`).
- The `.js` extension is mandatory under NodeNext even though source files end in `.ts`.
- Side-effect-only imports use the same form (`import './auth/context.js'` at `server/index.ts:12`) — comment must explain WHY.

**Type-only imports:** `verbatimModuleSyntax: true` is on in both project configs, so every type-only symbol must use `import type { ... }`. Mixed default+type imports are not allowed.

## Immutability

- Every state transition in `src/gestures/stateMachine.ts` returns a NEW object via spread; never mutate.
- Drizzle queries return new row objects — never mutated in place.
- `Object.freeze(parsed.data)` on the env export at `server/env.ts:32` to prevent runtime tampering.
- `as const` on top-level data tables (`SEEDED_CITIES`).
- `readonly` on every interface field that doesn't need to vary; tuples typed `readonly [number, number]`.

## React Patterns

- Hooks own all side effects (timers, listeners, MapLibre instance, fetch). Components stay presentational where possible.
- `useReducer` for state machines (see `useGestureMachine`); `useState` for local UI flags.
- Effects with timers always clean up via a `clear(ref)` helper that nulls the ref.
- StrictMode is on (`src/main.tsx`); double-invocation is expected in dev.
- `key=` is used to force-remount when arrival animations need to re-fire (`ChapterOverlay key={chapter.id}` in `Reel.tsx`).
- Custom hooks expose stable callbacks via `useCallback` (`src/auth/useApi.ts:13`).

## Refs vs State

- DOM nodes, MapLibre map instances, timer IDs, pointer Maps → `useRef`.
- Anything that should trigger re-render → `useState` / `useReducer`.
- A `stateRef.current = state` mirror lets imperative pointer handlers read the latest state without rebinding listeners every render.

## TypeScript Strictness (both projects)

- `strict: true`
- `noUnusedLocals`, `noUnusedParameters`
- `noFallthroughCasesInSwitch`
- `verbatimModuleSyntax: true` — forces `import type` for type-only symbols
- App also: `erasableSyntaxOnly`, `noUncheckedSideEffectImports`

**Implications:**
- No `enum` — use string-literal unions (`ReelStateName = 'IDLE' | 'SCRUBBING' | ...`).
- No `namespace` — separate modules instead.
- Discriminated unions for events instead of class hierarchies.

## Logging

**No `console.log` in production paths.** Server uses `process.stderr.write(...)` for error diagnostics (`server/env.ts:28`, `server/auth/jwt.ts:70`). The single Hono `logger()` middleware at `server/index.ts:17` handles request logs. Frontend uses `console.warn`/`console.error` only at boundaries; no `console.log`.

## Validation

Zod is the schema validator at every boundary:
- Server env validated at process start with `safeParse` then `process.exit(1)` on failure (`server/env.ts:24`).
- Future API request bodies will follow the same pattern.

## Dual Env-Var Convention

Server-only secrets use bare names; frontend (Vite) requires the `VITE_` prefix to be inlined into the bundle:

| Concern        | Server                  | Frontend                    |
|----------------|-------------------------|-----------------------------|
| Auth0 domain   | `AUTH0_DOMAIN`          | `VITE_AUTH0_DOMAIN`         |
| Auth0 audience | `AUTH0_AUDIENCE`        | `VITE_AUTH0_AUDIENCE`       |
| Auth0 client   | (n/a)                   | `VITE_AUTH0_CLIENT_ID`      |
| Database       | `DATABASE_URL`          | (never exposed)             |

Frontend env vars are typed in `src/vite-env.d.ts:4-6`. Server env is typed via the Zod schema in `server/env.ts:13`. **Never** expose a bare `AUTH0_*` to the client bundle and never put `DATABASE_URL` behind `VITE_`.

## CSS / Tailwind

- Source-of-truth tokens are CSS custom properties in `src/index.css :root` (colors, easings, durations).
- Tailwind theme extends a subset (`tailwind.config.ts`) for utility access (`bg-amber-400`, `ease-arrival`, font families).
- All frontend styling goes through Tailwind utilities; inline `style={{ ... }}` is reserved for genuinely dynamic values (e.g., scrub-cursor gradient stop).
- Layered: `@layer base` for resets/tokens, `@layer components` for `.glass-pill` / `.scrim-*`, `@layer utilities` for `.text-display` / `.animate-arrival`.
- `@media (prefers-reduced-motion: reduce)` zeroes durations as defense in depth even though `App.tsx` already swaps to the static reel.

## Comments

**Default: no comment.** Add one only when the WHY is non-obvious — a hidden constraint, a surprising platform behavior, or a load-bearing decision. Good examples: the trailing-slash explanation at `server/auth/jwt.ts:6-15`, the side-effect-import note at `server/index.ts:8-12`, the `touch-action: none` rationale in `src/index.css`. Avoid "what" comments and PR/issue references.

## Linting / Formatting

Still none. TypeScript compiler is the only enforcement. ESLint + Prettier remain a planned add (no phase commitment yet).

---

*Conventions refreshed: 2026-04-27*
