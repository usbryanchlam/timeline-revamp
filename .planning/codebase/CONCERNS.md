# Codebase Concerns

**Analysis Date:** 2026-04-27
**Phase:** W1 — most concerns are intentional, scoped to be paid down in W2+ per the plan

## Tech Debt

**Bundle size — MapLibre in main chunk:**
- Issue: 1.27 MB JS / 351 KB gzipped, dominated by `maplibre-gl`.
- Why: W1 prioritized gesture validation, not perf budget.
- Impact: Lighthouse mobile perf score will fail the ≥90 acceptance criterion until split.
- Fix approach: dynamic-import `MapCanvas` after first paint, render an LCP poster image first. Pre-rendered 1280×720 of the opening frame, served as `<link rel="preload" as="image">`. WebGL init runs after LCP completes. Scheduled W2.

**Tile source — demotiles placeholder:**
- Issue: `https://demotiles.maplibre.org/style.json` ships only world-level vectors; past zoom ~5 it's solid colors.
- Why: free, no signup, unblocks W1.
- Impact: cannot demonstrate cinematic city-block landings. W1 zooms artificially capped at 4–5.
- Fix approach: sign up MapTiler (free 100k/mo), put key in `VITE_MAPTILER_KEY`, swap style URL in `MapCanvas.tsx`. Restore zooms to 12–13. ~10 minutes. Scheduled early W2.

**`StateBadge` is ungated:**
- Issue: `src/reel/StateBadge.tsx` always renders the dev-only state pill in production builds.
- Why: needed it visible during W1 acceptance testing on iPhone.
- Impact: ships a dev affordance to public visitors; small but visible.
- Fix approach: either gate behind `?debug=1` query param, behind `import.meta.env.DEV`, or remove entirely once W2 polish is complete. Scheduled W2.

**`src/motion/` is empty:**
- Issue: directory created in mental architecture, has no files.
- Why: motion tokens currently live as CSS custom properties in `index.css`; centralizing JS-side constants wasn't urgent.
- Impact: zero. Just a cleanup loose end.
- Fix approach: when Framer Motion lands in W2 with shared variants, consolidate; OR delete the directory if not needed.

**No backend, no auth, no tests:**
- Issue: W1 is intentionally frontend-only with no automated tests.
- Why: per the plan, gesture validation has higher info-value than backend stubs in week 1.
- Impact: cannot demonstrate full-stack capability yet; bug regressions only caught manually.
- Fix approach: W4a backbone, W4b auth, W2 first Vitest suite covering `stateMachine.ts`.

## Known Bugs / Quirks

**Auto-play wraps from last chapter to first:**
- Symptoms: After Banff (chapter 10), camera flies back to Tokyo and the loop continues.
- Trigger: leave reel idle past 4.5s on the final chapter.
- Workaround: this is intentional (loops the demo forever for recruiters). Not a bug per se.
- Note: when real users have <10 cities, the wrap behavior still works. With 1 city, the spec calls for a slow orbit instead — not yet implemented (planned: W7 with public per-handle reel).

**Initial render starts at zoom 1.4:**
- Symptoms: First frame shows world view before flyTo to chapter 0.
- Trigger: page load.
- Workaround: this is intentional — "first arrival is part of the show" — so the camera flies in, doesn't appear teleported.
- Risk: if LCP poster image is added in W2, the poster needs to match this first-frame world view OR cover the gap so users don't see two distinct visuals.

**`StrictMode` double-mount during dev:**
- Symptoms: in dev only, MapLibre `Map` may briefly init twice on mount.
- Trigger: `import.meta.env.DEV` reloads.
- Workaround: existing cleanup in `MapCanvas.tsx` `useEffect` return removes the old map; benign in practice.
- Note: production builds run with StrictMode but no double-effect call.

## Areas Requiring Care When Editing

**`src/gestures/stateMachine.ts`:**
- This is the load-bearing contract from the design doc. Every transition is intentional.
- DO NOT add side effects (timers, DOM, React) to this module — keep it pure so it stays trivially unit-testable.
- DO add new events as discriminated-union variants and handle them in `transition()`'s switch with explicit returns (no fall-through).
- New states require updating `ReelStateName` in `@/types/reel` AND every place that switches on it.

**`src/gestures/useGestureMachine.ts`:**
- The window-level `pointermove`/`up`/`cancel` listeners with `capture: true` are LOAD-BEARING for the MAP_INTERACT recovery path. If you change to element-level listeners, the bug "MAP_INTERACT can't return to IDLE" comes back.
- Do not add `e.preventDefault()` to any pointer handler. iOS accessibility (3-finger gestures) and back-edge-swipe behavior depend on us being passive.

**`src/index.css` § `.reel-root`:**
- `touch-action: none` is required, not `manipulation`. Reverting will break horizontal scrub on iOS.
- `-webkit-touch-callout: none` suppresses the iOS long-press menu — needed because long-press is our scrub trigger.

**`src/reel/MapCanvas.tsx`:**
- `interactive: false` on the MapLibre constructor is mandatory; we re-enable per-state via `dragPan.enable()/disable()`. If you flip to `interactive: true`, single-finger drags will hijack the gesture machine.
- The init effect intentionally has `[]` deps with an eslint-disable. Don't "fix" it — the map is constructed once, chapters update via the second effect.

**`src/data/seeded-cities.ts`:**
- Zooms are capped at 4–5 because of the demotiles ceiling. When the MapTiler swap lands in W2, restore to 12–13 with the original pitches (50–65). The original values are in git history (`git show fcd06ea -- src/data/seeded-cities.ts`).

## Performance Budgets (from docs/plan.md)

- Lighthouse mobile ≥ 90 (perf, a11y, best practices, SEO).
- Initial JS bundle ≤ 250 KB gzipped (excluding MapLibre, which is dynamic-imported after LCP).
- LCP ≤ 2.5s on Moto G4 3G.
- CLS ≤ 0.1.

W1 misses all of these. They're targeted by W2 polish, not before.

## Security / Privacy

**Currently:** No user data, no auth, no secrets. Only externally-loaded resources are Google Fonts + demotiles, both public.

**Planned threats to mitigate (W4+):**
- JWT validation against Auth0 JWKS, not against a hardcoded public key.
- PARs for OCI Object Storage are short-lived (download URLs); never log them.
- Public-read prefix for thumbnails has read-only ACL — verify in W6.
- No user input rendered as `dangerouslySetInnerHTML` anywhere; captions are text-only.
- Rate limit on MP4 render endpoint (5/24h per user, DB-enforced).

## Things That Could Surprise A New Reader

- **The chapter rail is a `progressbar` with ARIA**, but the `progressbar` semantics map awkwardly to "chapter N of M" — `aria-valuenow` is set to the chapter number. Could be reconsidered if VoiceOver testing in W12 reveals issues.
- **`StrictMode` is on** — double-effect in dev is expected, not a bug.
- **There is no router yet.** W3 adds React Router v7. Until then, `App.tsx` picks one of two reel components based on a media query.
- **gstack docs are primary, repo `docs/` is a snapshot.** Edits to `docs/plan.md` in the repo won't propagate to gstack; either edit the gstack source or sync afterward. README documents the pattern.
