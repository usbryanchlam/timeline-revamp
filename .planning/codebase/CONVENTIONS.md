# Coding Conventions

**Analysis Date:** 2026-04-27
**Phase:** W1

## Naming Patterns

**Files:**
- React components: `PascalCase.tsx` (e.g., `ChapterOverlay.tsx`, `MapCanvas.tsx`).
- Hooks: `useCamelCase.ts` (e.g., `useGestureMachine.ts`, `usePrefersReducedMotion.ts`).
- Pure modules: `camelCase.ts` (e.g., `stateMachine.ts`).
- Data modules: `kebab-case.ts` (e.g., `seeded-cities.ts`).
- Type modules: lowercase noun (e.g., `reel.ts`).

**Functions:**
- `camelCase` for all functions including React components used inline (e.g., `formatArrivedAt`, `transition`).
- Exported components are `export function PascalCase()` — named exports, no defaults.
- Event handlers in components are `onSomething` (`onPointerDown`, `onUserMapInteract`); the handler bodies refer to them as `handleXxx` only if the prop name is taken.

**Variables and constants:**
- `camelCase` for variables.
- `UPPER_SNAKE_CASE` for module-level constants intended as tunables (e.g., `LONG_PRESS_MS`, `FLICK_THRESHOLD_PX`, `FLY_DURATION_MS`).
- Refs are suffixed `Ref` (e.g., `pointersRef`, `mapRef`).

**Types and interfaces:**
- `PascalCase` for both `interface` and `type` aliases (e.g., `ReelState`, `CityChapter`, `Coordinates`).
- No `I` prefix on interfaces.
- Discriminated unions on `type` field (e.g., `ReelEvent`).

## Code Style

**Module shape:**
- One concept per file. Components, hooks, and pure modules each get their own.
- No barrel `index.ts` re-exports.
- No default exports — named exports only. Reason: better refactor/rename ergonomics, clearer call sites.

**Imports:**
- `@/...` path alias for cross-directory imports (e.g., `@/types/reel`, `@/data/seeded-cities`).
- Relative imports only inside the same directory (`./stateMachine`).
- `import type` is used wherever the symbol is purely structural (`verbatimModuleSyntax` is on, so this is required).

**Immutability:**
- Every state transition in `stateMachine.ts` returns a NEW object. Never mutate state in place.
- `as const` on top-level data tables (`SEEDED_CITIES`).
- `readonly` on every interface field that doesn't need to vary (e.g., all of `CityChapter`).
- Tuples typed `readonly [number, number]` not `[number, number]`.

**React patterns:**
- Hooks own all side effects (timers, listeners, MapLibre instance). Components are presentational where possible.
- `useReducer` is used for state machines (see `useGestureMachine`); `useState` for local UI flags only.
- Effects with timers always clean up via a single `clear(ref)` helper that nulls the ref.
- StrictMode is on (`src/main.tsx`); double-invocation behavior verified in dev.
- `key=` is used to force-remount when arrival animations need to re-fire (see `ChapterOverlay key={chapter.id}` in `Reel.tsx`).

**Refs vs state:**
- DOM nodes, MapLibre map instances, timer IDs, pointer Maps — all `useRef`.
- Anything that should trigger re-render — `useState` / `useReducer`.
- A `stateRef.current = state` mirror is used inside the gesture hook so imperative event handlers can read the latest state without re-binding listeners on every render.

## Comments

**Default: no comment.** Add one only when the WHY is non-obvious — a hidden constraint, a surprising platform behavior, a load-bearing decision.

**Examples in this codebase:**
- `useGestureMachine.ts` § "Bind to element" — explains the `window + capture: true` trick because it's not obvious from the code.
- `index.css` § `.reel-root` — comment names the platform reason for `touch-action: none`.
- `MapCanvas.tsx` § eslint-disable line — explains why `chapters` and `onUserMapInteract` are intentionally not deps of the init effect.

**Avoid:**
- "What" comments that restate the code.
- Reference to PR numbers, issue IDs, or session history. Those go in commit messages.

## TypeScript Specifics

**Strictness flags on:**
- `strict: true`
- `noUnusedLocals`, `noUnusedParameters`
- `noFallthroughCasesInSwitch`
- `noUncheckedSideEffectImports`
- `erasableSyntaxOnly` (no enums, no const enums, no namespaces)
- `verbatimModuleSyntax` (forces `import type` for type-only imports)

**Patterns this implies:**
- No `enum` — use string-literal unions (`ReelStateName = 'IDLE' | 'SCRUBBING' | ...`).
- No `namespace` — separate modules.
- Discriminated unions for events instead of class hierarchies.

## CSS / Tailwind

**Source-of-truth tokens:**
- CSS custom properties in `src/index.css` `:root` (colors, easings, durations).
- Tailwind theme extension mirrors a subset for utility-class access (colors, ease-* timings, font families).
- Components reference tokens via Tailwind utilities (`bg-amber-400`) where possible; fall back to inline `style={{ ... }}` for dynamic values (e.g., scrub cursor gradient stop).

**Layers:**
- `@layer base` — resets, root tokens, global typography, `.reel-root` lock CSS.
- `@layer components` — semi-named utilities like `.glass-pill`, `.scrim-bottom`, `.scrim-top`.
- `@layer utilities` — `.text-display`, `.text-caps`, `.animate-arrival` keyframes.

**Reduced motion:**
- `@media (prefers-reduced-motion: reduce)` block at the bottom of `index.css` zeroes all animation/transition durations as a defense in depth, even though the App-level branch already swaps to the static reel.

## Error Handling

**Currently minimal** — W1 is frontend-only with no network calls. Once W4 backend lands, conventions to enforce:
- Validate every API response with Zod.
- Try/catch only at boundary functions (data fetchers, event handlers); let the rest throw.
- User-facing error UI; never `console.error` and move on.

## Testing Conventions

**Not yet established** — first tests land in W2 (gesture state machine unit tests via Vitest). Conventions to lock at that time:
- Test files live next to source: `stateMachine.test.ts` next to `stateMachine.ts`.
- Pure modules get unit tests; React components get RTL tests; full flows get Playwright.

## Linting / Formatting

**Currently:** TypeScript compiler is the only enforcement. No ESLint or Prettier config yet.

**Planned (W2+):** ESLint with `@typescript-eslint`, `react-hooks`, possibly `eslint-plugin-react-refresh`. Prettier via `editorconfig` style.
