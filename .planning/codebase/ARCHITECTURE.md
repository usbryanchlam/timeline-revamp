# Architecture

**Analysis Date:** 2026-04-27
**Phase:** W1 (single-route SPA, no backend yet)

## Pattern Overview

**Overall:** Single-page React app, single route. Frontend-only at W1.

**Key Characteristics:**
- One root component decides between two reels (motion vs reduced-motion).
- Gesture handling is split into a **pure state machine module** + a **React hook** that owns DOM/timer side effects. This split is load-bearing — see CONVENTIONS.md.
- MapLibre is treated as a slave to the gesture state, not a peer. Gesture machine owns truth (current chapter, scrub fraction, interaction mode); MapCanvas reads it and reacts via `flyTo` / `enable`+`disable` calls.
- Tailwind utilities + a small `@layer components` for things that benefit from named CSS (`.glass-pill`, `.scrim-bottom`, `.scrim-top`, `.animate-arrival`).

## Layers

**Entry:**
- Files: `src/main.tsx`, `src/App.tsx`
- Purpose: mount React into `#root`, pick the reel variant via `usePrefersReducedMotion()`.
- Depends on: `Reel`, `ReducedMotionReel`, `usePrefersReducedMotion`.
- Used by: `index.html`.

**Reel (motion path):**
- Files: `src/reel/Reel.tsx`, `src/reel/MapCanvas.tsx`, `src/reel/ChapterOverlay.tsx`, `src/reel/ChapterRail.tsx`, `src/reel/CTAPill.tsx`, `src/reel/StateBadge.tsx`
- Purpose: full-bleed cinematic surface — map canvas + bottom overlay (city name, photos, caption) + bottom rail + top-right CTA pill + dev state badge.
- Depends on: gesture machine (state), MapLibre (rendering), seed data (chapters).
- Used by: `App.tsx` when `prefers-reduced-motion: no-preference`.

**Reduced-motion path:**
- File: `src/reel/ReducedMotionReel.tsx`
- Purpose: vertical scrolling chapter list, no map, no animation. Lighthouse-clean a11y fallback.
- Depends on: seed data only.
- Used by: `App.tsx` when `prefers-reduced-motion: reduce`.

**Gesture state machine (pure):**
- File: `src/gestures/stateMachine.ts`
- Purpose: defines `ReelState`, `ReelEvent`, `transition()`. No DOM, no timers, no React. Every transition returns a new state object.
- States: `IDLE | SCRUBBING | CHAPTER_SWIPE | MAP_INTERACT | PAUSED | SUSPENDED`.
- Depends on: `@/types/reel` only.
- Used by: `useGestureMachine.ts`. Independently testable.

**Gesture hook (effectful):**
- File: `src/gestures/useGestureMachine.ts`
- Purpose: bind PointerEvents + page lifecycle to `transition()`. Owns long-press, fly-done, map-idle, orientation-settle, auto-play timers. Detects clean tap (short, no travel, single finger). Returns `{ state, dispatch, bind }`.
- Critical detail: `pointerdown` is bound to the reel element, but `pointermove`/`up`/`cancel` are bound to **window with capture: true** so MapLibre's `setPointerCapture` cannot swallow them while in `MAP_INTERACT`.
- Depends on: `stateMachine.ts`.
- Used by: `Reel.tsx`.

**Data:**
- File: `src/data/seeded-cities.ts`
- Purpose: 10 hardcoded chapters with center, zoom, pitch, bearing, date, caption, photos. W6 replaces with backend fetch.
- Depends on: `@/types/reel`.

**Types:**
- File: `src/types/reel.ts`
- Defines: `Coordinates`, `PhotoSeed`, `CityChapter`, `ReelStateName`.

## Data Flow (W1 reel)

```
PointerEvent  ─┐
keydown       ─┤
visibilitychange├──► useGestureMachine (hook) ──► transition() ──► ReelState
orientationchange┤                                                  │
auto-play timer ─┘                                                  │
                                                                    │
                                              ┌─────────────────────┴────────────────────┐
                                              │                  │                       │
                                              ▼                  ▼                       ▼
                                        MapCanvas         ChapterOverlay /         ChapterRail
                                        (flyTo,           ChapterOverlay key=id    (active+scrub
                                         enable/disable)  re-fires arrival pulse)   gradient)
```

## Decisions and Why

**Pure state machine + hook, not useReducer-with-effects:**
- The transition logic must be testable in isolation (state machine spec is the design doc's load-bearing contract for v1 ship/die).
- Side effects (timers, listeners) live in one place — easier to audit lifecycle leaks.

**Window-level pointermove/up:**
- MapLibre claims pointer capture on its canvas during pan. Element-level listeners stop firing. Window + capture phase fires before the captured target.
- See `useGestureMachine.ts` § "Bind to element" comment.

**`touch-action: none` on `.reel-root`:**
- Tells iOS/Android: do not interpret any touch yourself, hand them all to JS. Required for custom gesture surfaces. `manipulation` is not enough — it still claims pan rights.

**MapLibre `interactive: false` by default:**
- Map only enables `dragPan` + `touchZoomRotate` while `state.name === 'MAP_INTERACT'`. Single-finger drags to the map are dead unless gesture machine has promoted to map-interact via two-finger landing.

**`prefers-reduced-motion` at the route level, not per-component:**
- One static path, no map, no animations. Cheaper than trying to scrub through the reel with no flyTo.

## Things Not Yet in This Architecture

- Routing (React Router v7 lands W3)
- Data fetching layer (W4+)
- Auth context provider (W4b — wraps private tree only, NOT public reel)
- API client (W4+)
- Detail sheet / photo gallery (W6)
- Notifications poller (W10)

## Out of Scope (v1)

- Service worker / offline mode (cut to preserve weekend budget)
- Full i18n
- Dedicated mobile back-button stack management beyond detail sheet
