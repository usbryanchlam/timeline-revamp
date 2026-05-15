# Phase 7: Public URLs + handle reservation - Research

**Researched:** 2026-05-14
**Domain:** Unauthenticated public-read API + cinematic camera variants + Nginx HTTP caching + blocking modal UX
**Confidence:** HIGH (all integration points verified against existing code; library choices fixed by project; only unknown is iPhone-Safari RAF jank in long-running orbit, flagged as Wave-2 device check)

## Summary

Phase 7 ships three coordinated pieces: (1) upgrade Phase 4's already-shipped `HandlePickerGate`/`HandlePickerModal` from a one-shot validate-and-claim to a live debounced uniqueness check that talks to a new public `GET /api/handles/check`; (2) wire `/u/:handle` to a new public one-shot `GET /api/public/u/:handle` and branch the renderer on `cities.length` for 0-city (slow-rotating globe) and 1-city (continuous 360° orbit) cinematic variants; (3) commit `ops/nginx/timeline.conf` with `proxy_cache_path` + TTL-only invalidation, executed in Phase 8.

The architectural seams are already in place — `HandlePickerGate` mounts inside `AppLayout` (AUTH-04 boundary holds); `HandleReelRoute` is a known stub awaiting rewrite; `server/index.ts` has a clear public-vs-JWT mount pattern (`/health` is the precedent). The single live risk is the orbit-RAF lifecycle: MapLibre v5 `setBearing()` per `requestAnimationFrame` is the right primitive, but must integrate with `document.hidden` pause/resume and React 18 StrictMode's double-mount without leaking RAF handles.

**Primary recommendation:** Implement in three plans matching the CONTEXT.md breakdown — 07-01 (live-check endpoint + picker upgrade), 07-02 (public endpoint + route rewrite + 0/1-city cinematic variants), 07-03 (Nginx config file). Use the native `<dialog>` element for the picker modal upgrade (built-in focus trap, no library), reuse the project's `reqIdRef`-sentinel pattern (not `mountedRef` — that's a separate landmine for `useRef(true)` cleanup-only effects), and gate the orbit loop on `document.hidden` via the same `visibilitychange` listener the gesture machine already owns.

## Project Constraints (from CLAUDE.md)

- All web browsing through `/browse` skill, never `mcp__claude-in-chrome__*`.
- DESIGN.md is the source of truth for visual decisions. Public reel is **always dark** (DESIGN.md:72). Single amber accent (`#FFD470`); no empty-state illustrations on public surfaces (locked risk #3).
- Motion tokens: orbit duration `--motion-orbit: 8000ms`, linear easing (DESIGN.md:202–218).
- `prefers-reduced-motion: reduce` clamps all motion to 0ms (DESIGN.md:224) — applies to both orbit and globe.
- No `console.log` in production code (typescript/coding-style.md).
- Use Zod at all system boundaries (typescript/coding-style.md). The `?candidate=…` query string is one such boundary.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Blocking modal on first `/app/*` route visit when `users.handle IS NULL`. No close button; cannot dismiss until claimed. Modal renders ABOVE route content (route mounts behind modal so no flash on dismiss).
- **D-02:** Live uniqueness via `GET /api/handles/check?candidate=<input>` → `{ available: bool, reason?: 'too_short'|'too_long'|'invalid_chars'|'reserved'|'taken' }`. Debounce 300ms. Inline status icon (amber check / muted X). Server runs the same `validateHandle()` — single source of truth.
- **D-03:** `POST /api/me/handle` remains the authoritative claim path. Live check is advisory; server re-validates and re-checks on submit; race → 23505 → 409 via existing `pgErrorCode` path.
- **D-04:** `Cache-Control: no-store` on `/api/handles/check`.
- **D-05:** Picker copy minimal — title "Pick your handle", placeholder `e.g. bryan`, URL preview `timeline.bryanlam.dev/u/<input>`, primary button `Claim`. No close, no "skip for now".
- **D-06:** New `GET /api/public/u/:handle` mounted OUTSIDE JWT router. 200 → `{ user: { handle, displayName: null }, cities: City[], photos: Photo[] }`; 404 → `{ error: 'not_found' }`. Case-insensitive lookup; defer 301 normalization decision to plan.
- **D-07:** DTO shape matches authenticated `useCitiesQuery` + `useAllPhotos`. `photos[]` flat with `cityId`.
- **D-08:** App-layer headers — 200 → `Cache-Control: public, max-age=300, s-maxage=300`; 404 → `Cache-Control: public, max-age=60`. Nginx `proxy_cache_valid` matches.
- **D-09:** `displayName: null` for v1. Field exists in DTO so future addition doesn't break client.
- **D-10:** `HandleReelRoute.tsx` rewrite — calls `usePublicReel(handle)`. 404 → `NotFoundHandleRoute`. 0 cities → empty-state reel. 1 city → orbit reel. ≥2 → existing multi-chapter Reel.
- **D-11:** Separate `NotFoundHandleRoute` distinct from generic `NotFoundRoute`. 0-city case shares normal reel surface (different camera + caption), not a 404.
- **D-12:** Orbit at 45°/s = 8s/revolution. Loops until user input. Holds zoom 14, pitch 60.
- **D-13:** No inter-chapter `flyTo` in 1-city case. Single chapter rail still renders. Arrival pulse fires once on initial land.
- **D-14:** RAF loop updating `map.setBearing()`. Pauses on `document.hidden`; resumes on `visibilitychange`.
- **D-15:** `prefers-reduced-motion: reduce` → static single-photo card (reuse `ReducedMotionReel` pattern). Caption fades normally.
- **D-16:** Globe at zoom 1, pitch 0, bearing ~10°/s (~36s/revolution). Caption "No trips yet. Check back soon." bottom-anchored. No empty-state illustration.
- **D-17:** Reduced-motion globe → static globe, fixed bearing, caption unchanged.
- **D-18:** `ops/nginx/timeline.conf` ships in Phase 7. Directives: `proxy_cache_path /var/cache/nginx/public_reel levels=1:2 keys_zone=public_reel:10m max_size=1g inactive=24h;`; `location ~ ^/api/public/u/[^/]+$` with `proxy_cache public_reel`, `proxy_cache_key $scheme$host$uri`, `proxy_cache_valid 200 5m`, `proxy_cache_valid 404 1m`, `proxy_cache_bypass $http_x_no_cache`, `add_header X-Cache-Status $upstream_cache_status`. Also caches `^/u/[^/]+$` SPA HTML (5m TTL).
- **D-19:** Phase 8 symlinks the .conf to `/etc/nginx/conf.d/`.
- **D-20:** TTL-only invalidation, 5 minutes. No active purge.
- **D-21:** Cache key `$scheme$host$uri`. No Vary.
- **D-22:** Static `<title>@{handle} — Timeline</title>` + static description. OG image (PUBLIC-05) deferred to Phase 12.

### Claude's Discretion

- TanStack-Query-key shape for `usePublicReel(handle)` — **project does not actually use TanStack Query** (see Standard Stack below); follow the local `useApi + useState + reqIdRef` pattern from `useCitiesQuery`.
- Modal animation timing — DESIGN.md tokens apply (`--motion-quick: 240ms`, `--ease-ui`).
- 404 copy — terse, on-brand.
- Whether `/api/handles/check` also returns canonical lowercased form (current `HandlePickerModal` already surfaces "Will be saved as `<preview>`" client-side — keeping that local).
- Live-uniqueness fetch implementation — raw fetch + `AbortController` recommended (consistent with `HandlePickerGate`'s existing pattern).

### Deferred Ideas (OUT OF SCOPE)

- OG image rendering (PUBLIC-05) — Phase 12.
- Handle rename UI — v2.
- Owner-active cache invalidation / admin purge — rejected.
- 301 redirect for uppercase handles — defer (plan-decides).
- Live-check rate limit — Phase 8 (Nginx-level).
- Display name field — v2.
- Per-photo public/private flag — v2.
- `PublicReelRoute` (`/`) redesign — Phase 7 does NOT touch it.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-05 | Handles `[a-z0-9-]{3,20}`, lowercase, unique | Existing `validateHandle()` and `users.handle UNIQUE` (Phase 4) — reused as-is for `/api/handles/check` and on submit |
| AUTH-06 | Reserved-word list | Existing `RESERVED_HANDLES: ReadonlySet<string>` — reused via the same `validateHandle()` call |
| AUTH-07 | Handle picker UI on first authenticated visit | Upgrade existing `HandlePickerGate` + `HandlePickerModal` (Phase 4) to add live debounced check + URL preview line per D-02/D-05 |
| PUBLIC-01 | `/u/:handle` renders unauthenticated | New `GET /api/public/u/:handle` (D-06) + `usePublicReel(handle)` + `HandleReelRoute` rewrite (D-10) |
| PUBLIC-02 | Empty state (0 cities) shows world view + caption | Globe variant (D-16); MapLibre v5 `setProjection({ type: 'globe' })` after `style.load` event |
| PUBLIC-03 | 1-city orbit camera | Orbit variant (D-12, D-14); RAF loop updating `setBearing()` |
| PUBLIC-04 | Nginx caches public reels (vary on handle) | `ops/nginx/timeline.conf` (D-18); cache key `$scheme$host$uri` per-handle |
| REEL-08 | Single-city reel runs 8s orbit at zoom 14 / pitch 60 | Same as PUBLIC-03; D-12 locks the constants |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Handle live-availability check | API/Backend | — | Authoritative validation + DB lookup; reuses `validateHandle()` |
| Handle claim (POST) | API/Backend | — | Already shipped in Phase 4; 23505 → 409 collapse is server-only |
| Handle picker modal | Browser/Client | — | UX-only; submits to backend; lives behind `AppLayout` (AUTH-04 boundary) |
| Public reel data fetch | API/Backend | CDN/Nginx (Phase 8) | One-shot endpoint; Nginx layers 5m TTL cache on top |
| Public reel rendering (cinematic variants) | Browser/Client | — | MapLibre + RAF lives in the SPA bundle |
| Static SPA HTML for `/u/:handle` | CDN/Nginx (Phase 8) | Browser/Client | HTML identical across handles; cached cheaply at edge |
| Public route case-insensitive lookup | API/Backend | — | One SQL query; centralize to avoid future drift |
| Reduced-motion fallback | Browser/Client | — | `usePrefersReducedMotion()` already exists; static surfaces only |

## Standard Stack

### Core (already installed — no new deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | 4.12.18 | API router; public + JWT trees co-mount via `app.use()` ordering | Project convention; Phase 4 |
| Drizzle ORM | 0.45.2 | Public-route SELECT with explicit projection to avoid leaking private columns | Project convention; Phase 4 |
| Zod | 4.4.3 | Validate `?candidate=…` query input on the live-check endpoint | Project convention; CLAUDE.md guideline |
| MapLibre GL JS | 5.0.0 (latest 5.24.0 available) | Orbit (`setBearing`) + globe (`setProjection({ type: 'globe' })`) | Locked by PROJECT.md; v5 added globe support [VERIFIED: npm view, MapLibre docs] |
| React | 19.0.0 | Modal, hooks | Locked |
| react-router | 7.15.0 | `useParams`, `Navigate`, `Link` | Locked |
| Auth0 React SDK | 2.16.2 | Drives `useApi()` token attachment for authenticated calls only | Locked; public hook does NOT use this |
| `@auth0/auth0-react` | 2.16.2 | (Same as above) | Public hook is plain `fetch()` |
| Tailwind | 3.4.17 | Modal styling | Locked |
| Vitest + jsdom + @testing-library/react | 4.1.5 / 29.1.1 / 16.3.2 | Unit + integration tests for new endpoints/components | Phase 6 baseline |

### Supporting (no install required)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| native `<dialog>` element | browser-native | Blocking modal with built-in focus trap + Esc handling | Use `showModal()` on mount; intercept `cancel` event to prevent Esc-close per D-01 (blocking) |
| `AbortController` | browser-native | Cancel in-flight live-check on new keystroke | Replaces lodash-debounce-style libs; project pattern from `HandlePickerGate` |
| `requestAnimationFrame` / `cancelAnimationFrame` | browser-native | Orbit + globe rotation loop | Project pattern; no library needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `<dialog>` | Headless UI Dialog or Radix Dialog | Both add ~10-30 KB. Project ships zero UI libraries today (confirmed in package.json). Native `<dialog>` covers focus trap + Esc + backdrop natively in all project-target browsers [CITED: css-tricks.com]. **Recommend native.** |
| `map.setBearing(b)` in RAF loop | `map.rotateTo(b, { duration: Infinity })` or `easeTo({ bearing: ..., duration: 8000 }).repeat()` | `rotateTo` accepts duration but no loop primitive. Calling `easeTo` repeatedly in a `moveend` listener causes the gesture machine to see "moveend storms" and stutters interactions. **`setBearing()` is the standard primitive** because it's synchronous, doesn't fire `moveend`, and gives us frame-precise control over rate. [VERIFIED: MapLibre Map API docs] |
| TanStack Query for `usePublicReel` | Custom hook with `useApi`-style fetcher | **Project does not have TanStack Query installed** (verified in package.json). All existing data hooks use `useState` + `useEffect` + `reqIdRef` sentinel. Adding TanStack Query for one public hook is scope creep. **Reuse the `useCitiesQuery` shape**, just without the Authorization header. |
| `mountedRef` pattern | `reqIdRef` sentinel (existing) | The `mountedRef` memory is a *separate* footgun for `useRef(true) + cleanup-only effect`. The existing project pattern is `reqIdRef.current = ++count; if (myId !== reqIdRef.current) return;`. **Continue this pattern.** |
| Static `<dialog open>` | Programmatic `dialog.showModal()` | Only `showModal()` gives backdrop, focus trap, top-layer rendering, and inert-everything-else. `open` attribute alone is non-modal. [CITED: dev.to/link2twenty] |

**Installation:** No new dependencies. All needed libraries already in `package.json`.

**Version verification:**
- `maplibre-gl@5.0.0` installed; latest is `5.24.0` (published recent). v5.x line is stable; globe projection added in v5.0 [VERIFIED: `npm view maplibre-gl version` returned 5.24.0]. Phase 7 stays on the installed 5.0.0; if globe rendering glitches surface, bumping to 5.24 is a one-line lockfile change.
- `hono@4.12.18` is current.

## Architecture Patterns

### System Architecture Diagram

```
Public surface (unauthenticated)
────────────────────────────────
  Browser
    │  GET /u/:handle  (HTML — cached at Nginx, 5m)
    │  ↓ React mounts HandleReelRoute
    │  ↓ usePublicReel(handle) → plain fetch (no Auth header)
    │  GET /api/public/u/:handle   ─────────────► Nginx proxy_cache (5m on 200, 1m on 404)
    │                                              │ MISS → Hono /api/public/u/:handle (no JWT)
    │                                              │        └─ Drizzle: users WHERE LOWER(handle)=? → cities, photos
    │                                              │        ─ Cache-Control: public, max-age=300
    │  ↓ branch on cities.length
    │     0 → GlobeReel (slow-rotating globe + caption)
    │     1 → OrbitReel (continuous bearing rotation at 45°/s)
    │    ≥2 → existing Reel (multi-chapter flyTo)
    │  ↓ usePrefersReducedMotion → static fallback variants for 0/1 case

Authenticated surface
─────────────────────
  Browser
    │  /app/* enters AppLayout
    │  ↓ AuthProvider → RequireAuth → HandlePickerGate
    │     GET /api/me (Bearer Auth) → me.handle
    │     ├─ null → mount HandlePickerModal (BLOCKING)
    │     │           │  Type → debounce 300ms → AbortController.signal
    │     │           ↓  GET /api/handles/check?candidate=... (no-store, no JWT)
    │     │           ↓ inline icon (amber check / muted X / reason text)
    │     │           ↓ Submit → POST /api/me/handle (Bearer Auth)
    │     │              └─ Drizzle UPDATE users SET handle, 23505 → 409 via pgErrorCode
    │     └─ string → render Outlet (AppReelRoute / TripsRoute / MeRoute)

Public route mount (server/index.ts)
─────────────────────────────────────
  app.get('/health', ...)               (existing precedent — no auth)
  app.get('/api/health', ...)
  app.get('/api/handles/check', ...)    ◄── NEW (no auth)
  app.route('/api/public/u', publicReelRouter)  ◄── NEW (no auth)
  app.use('/api/me/*', requireJwt, lazyProvisionUser)   (existing)
  app.use('/api/cities/*', requireJwt, lazyProvisionUser)
  app.use('/api/photos/*', requireJwt, lazyProvisionUser)
  app.route('/api/me', meRouter); ... etc.
```

### Recommended Project Structure

```
server/
├── routes/
│   ├── handlesCheck.ts      # NEW — GET /api/handles/check
│   ├── publicReel.ts        # NEW — GET /api/public/u/:handle
│   ├── me.ts                # EXISTING — unchanged
│   ├── cities.ts            # EXISTING — DTO projection extracted (see Pattern 4)
│   └── photos.ts            # EXISTING — DTO projection extracted similarly
├── validation/
│   └── publicReel.ts        # NEW — Zod schema for the ?candidate=… query
└── index.ts                 # EDITED — mount handlesCheck + publicReel BEFORE the JWT-protected `app.use()` calls

src/
├── api/
│   ├── handlesCheck.ts      # NEW — fetcher + (optionally) typed result
│   ├── publicReel.ts        # NEW — usePublicReel(handle) hook + fetcher
│   ├── cities.ts            # EXISTING — unchanged
│   └── photos.ts            # EXISTING — unchanged
├── auth/
│   ├── HandlePickerModal.tsx  # EDITED — add live check, URL preview, native <dialog>
│   ├── HandlePickerGate.tsx   # MAYBE-EDITED — already covers gating
│   └── useApi.ts              # EXISTING — unchanged
├── routes/
│   ├── HandleReelRoute.tsx        # REWRITTEN — data-fetching + cinematic-variant branch
│   ├── NotFoundHandleRoute.tsx    # NEW — handle-specific 404
│   └── NotFoundRoute.tsx          # EXISTING — generic catch-all unchanged
├── reel/
│   ├── OrbitReel.tsx              # NEW — 1-city orbit camera variant
│   ├── GlobeReel.tsx              # NEW — 0-city globe variant
│   ├── ReducedMotionOrbit.tsx     # NEW (or merge into OrbitReel branch) — static fallback
│   ├── ReducedMotionGlobe.tsx     # NEW (or merge into GlobeReel branch)
│   ├── Reel.tsx                   # EXISTING — unchanged (≥2 city path)
│   └── usePrefersReducedMotion.ts # EXISTING — reuse
└── hooks/
    └── useDebouncedValue.ts       # NEW — 300ms debounce for live check input

ops/
└── nginx/
    └── timeline.conf              # NEW — committed but not deployed (Phase 8 wires)
```

### Pattern 1: MapLibre continuous orbit via `requestAnimationFrame`

**What:** Drive `map.setBearing()` once per animation frame, advancing bearing by `degrees_per_ms * elapsed_ms`. Pause on `document.hidden`. Cancel on unmount.

**When to use:** 1-city orbit (D-12 at 45°/s) and 0-city globe (D-16 at ~10°/s). Same primitive, different rate.

**Reference (project-internal):**
```typescript
// Pseudocode, plan will write the real version
import maplibregl from 'maplibre-gl';

function useBearingOrbit(
  mapRef: React.RefObject<maplibregl.Map | null>,
  degreesPerSecond: number,
  enabled: boolean,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !enabled) return;

    let rafId: number | null = null;
    let lastT: number | null = null;
    let bearing = map.getBearing();
    let paused = document.hidden;

    const step = (t: number) => {
      if (!paused) {
        if (lastT !== null) {
          const dt = t - lastT;
          bearing = (bearing + (degreesPerSecond * dt) / 1000) % 360;
          map.setBearing(bearing);
        }
        lastT = t;
      } else {
        lastT = null; // reset baseline so resume doesn't time-warp
      }
      rafId = requestAnimationFrame(step);
    };

    const onVis = () => {
      paused = document.hidden;
      if (paused) lastT = null;
    };

    rafId = requestAnimationFrame(step);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [mapRef, degreesPerSecond, enabled]);
}
```

**Notes:**
- `setBearing()` is the recommended primitive over `easeTo`/`rotateTo` for continuous animation — it doesn't fire `moveend`, doesn't compete with the gesture machine's MAP_INTERACT detection, and gives frame-rate-aware progress.
- Use `lastT = null` on pause/resume to prevent time-warp on resume.
- StrictMode: this hook is safe under StrictMode's double-mount because the cleanup function cancels the RAF and removes the listener; the second mount re-arms from scratch.
- iPhone Safari: `requestAnimationFrame` is throttled when tab is backgrounded (~1Hz), so the `visibilitychange` listener is belt-and-suspenders. No additional iOS-specific guard needed.

### Pattern 2: MapLibre globe projection (zoom 1)

**What:** Set `projection: { type: 'globe' }` either in the style JSON or via `map.setProjection({ type: 'globe' })` AFTER `style.load`. Then use zoom 1, pitch 0.

**When to use:** 0-city empty-state (D-16). MapLibre v5 added globe support; without `setProjection`, the map renders as flat mercator at zoom 1, which looks like a stretched rectangle, not a globe.

**Reference:**
```typescript
// Source: https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe-with-a-vector-map/
const map = new maplibregl.Map({
  container,
  style: STYLE_URL,
  center: [0, 20],
  zoom: 1,
  pitch: 0,
  bearing: 0,
  interactive: false, // user input gated by gesture machine (same as MapCanvas)
});

map.on('style.load', () => {
  map.setProjection({ type: 'globe' });
});
```

**LANDMINE:** Calling `setProjection` BEFORE the style loads throws [VERIFIED: MapLibre issue #5114]. Use the `style.load` event.

### Pattern 3: Native `<dialog>` blocking modal in React 19

**What:** Render `<dialog ref={dialogRef}>` and call `dialogRef.current?.showModal()` in `useEffect`. Intercept the `cancel` event (Esc) and `preventDefault()` to make it blocking.

**When to use:** Handle picker upgrade per D-01 ("no close, cannot dismiss until claimed"). Current `HandlePickerModal` uses a div-with-fixed-positioning approach — works but doesn't get the focus trap, top-layer rendering, or Esc semantics for free.

**Reference:**
```tsx
// Source: https://dev.to/link2twenty/react-using-native-dialogs-to-make-a-modal-popup-4b25
import { useEffect, useRef } from 'react';

export function HandlePickerModal({ onPicked }: { onPicked: (h: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => e.preventDefault(); // blocking: Esc won't close
    d.addEventListener('cancel', onCancel);
    return () => {
      d.removeEventListener('cancel', onCancel);
      if (d.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="bg-bg-elev rounded-2xl p-6 w-full max-w-sm space-y-4 border border-line backdrop:bg-black/60"
    >
      {/* form contents */}
    </dialog>
  );
}
```

**Why this is better than the current implementation:**
- Focus trap is free — Tab cycles within the dialog [CITED: css-tricks.com / no-need-to-trap-focus].
- Backdrop is styled via `::backdrop` pseudo-element (works in Tailwind via `backdrop:bg-black/60`).
- Top-layer rendering — modal sits above any z-index stacking conflicts.
- `aria-modal="true"` is implicit on a dialog opened via `showModal()`.

**Tailwind 3.4 caveat:** The `backdrop:` variant works in Tailwind 3.x out of the box; no plugin needed.

### Pattern 4: Public route mount outside JWT middleware (Hono)

**What:** Register the public routes BEFORE the `app.use('/api/me/*', requireJwt, ...)` block. Hono executes middleware in registration order.

**Reference (from existing server/index.ts):**
```typescript
// EXISTING — /health and /api/health already follow this pattern
app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// NEW — register public routes here, before the JWT block
app.get('/api/handles/check', handlesCheckHandler);
app.route('/api/public/u', publicReelRouter);  // GET /api/public/u/:handle

// EXISTING — JWT-protected tree below
app.use('/api/me', requireJwt, lazyProvisionUser);
app.use('/api/me/*', requireJwt, lazyProvisionUser);
app.route('/api/me', meRouter);
// ...
```

**LANDMINE:** The pattern `app.use('/api/*', requireJwt)` (a single bulk middleware) WOULD intercept the public routes if used. The existing code uses per-prefix `app.use('/api/me', ...)` + `app.use('/api/me/*', ...)` etc., which leaves `/api/handles/check` and `/api/public/u/*` untouched. **Plan must preserve this per-prefix middleware pattern** — don't refactor to a single `/api/*` middleware.

### Pattern 5: DTO compatibility — Drizzle `select()` projection

**What:** Both `/api/cities` (auth) and `/api/public/u/:handle` (public) must return the same `City[]` shape (`CityDTO` in `src/types/city.ts`). Use an explicit `select({...})` projection that omits `userId` from the public response.

**Reference:**
```typescript
// Public route — explicit projection to avoid leaking user_id
const cityCols = {
  id: cities.id,
  // userId: cities.userId,  // OMIT from public DTO; client doesn't need it
  orderIndex: cities.orderIndex,
  name: cities.name,
  tripLabel: cities.tripLabel,
  lat: cities.lat,
  lng: cities.lng,
  zoom: cities.zoom,
  pitch: cities.pitch,
  bearing: cities.bearing,
  arrivedAt: cities.arrivedAt,
  caption: cities.caption,
  createdAt: cities.createdAt,
  updatedAt: cities.updatedAt,
};

const rows = await db.select(cityCols).from(cities)
  .where(eq(cities.userId, user.id))
  .orderBy(cities.orderIndex);
```

**LANDMINE (D-07 compatibility):** `CityDTO.userId` is currently `readonly userId: string`. The public DTO will need to either (a) include `userId` (acceptable — it's a UUID, not PII), or (b) introduce a separate `PublicCityDTO` that omits it. **Recommend (a)** — keep `userId` for shape parity; the UUID alone is not a privacy concern, and renderer code already expects it.

Same for photos: ensure the public `photos[]` array uses `PhotoDTO` shape (id, masterUrl, thumbUrl, orderIndex — no `userId`, `status`, or `masterKey`/`thumbKey`). The public route MUST filter `status = 'ready'` to avoid surfacing pending or failed uploads.

### Pattern 6: Debounced live-check with AbortController + reqIdRef

**What:** As user types, debounce 300ms, then fire `GET /api/handles/check?candidate=…` with an `AbortController`. New keystroke aborts the in-flight request. Use the project's `reqIdRef` sentinel pattern so a slow response can't overwrite a fresh one.

**Reference:**
```typescript
import { useEffect, useRef, useState } from 'react';

export function useHandleCheck(candidate: string, enabled: boolean) {
  const [result, setResult] = useState<
    | { state: 'idle' }
    | { state: 'checking' }
    | { state: 'available' }
    | { state: 'unavailable'; reason: 'too_short' | 'too_long' | 'invalid_chars' | 'reserved' | 'taken' }
    | { state: 'error' }
  >({ state: 'idle' });
  const reqIdRef = useRef(0);

  // Sentinel -1 on unmount
  useEffect(() => () => { reqIdRef.current = -1; }, []);

  useEffect(() => {
    if (!enabled || candidate.length === 0) {
      setResult({ state: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    const myId = ++reqIdRef.current;
    setResult({ state: 'checking' });

    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/handles/check?candidate=${encodeURIComponent(candidate)}`,
          { signal: ctrl.signal },
        );
        if (myId !== reqIdRef.current) return;
        if (!res.ok) { setResult({ state: 'error' }); return; }
        const json = await res.json() as
          | { available: true }
          | { available: false; reason: 'too_short' | 'too_long' | 'invalid_chars' | 'reserved' | 'taken' };
        if (myId !== reqIdRef.current) return;
        if (json.available) setResult({ state: 'available' });
        else setResult({ state: 'unavailable', reason: json.reason });
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        if (myId !== reqIdRef.current) return;
        setResult({ state: 'error' });
      }
    }, 300);

    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [candidate, enabled]);

  return result;
}
```

**LANDMINE (project memory `feedback_mountedref_strictmode.md`):** Do NOT use `useRef(true)` + cleanup-only effect. The `reqIdRef` sentinel (`++count` then `=== current` check) is the project's invariant pattern. The cleanup-only `mountedRef.current = false` would leave the ref stuck at false on StrictMode's re-mount.

### Pattern 7: Nginx proxy_cache (TTL-only, negative caching)

**Reference:**
```nginx
# /etc/nginx/conf.d/timeline.conf  (committed at ops/nginx/timeline.conf)
proxy_cache_path /var/cache/nginx/public_reel
                 levels=1:2
                 keys_zone=public_reel:10m
                 max_size=1g
                 inactive=24h
                 use_temp_path=off;

# Backend upstream (Phase 8 wires the real host)
upstream timeline_api {
    server 127.0.0.1:3000;
}

server {
    listen 443 ssl http2;
    server_name timeline.bryanlam.dev;
    # TLS config delegated to certbot output — Phase 8

    # Public API endpoint — cached, no auth
    location ~ ^/api/public/u/[^/]+$ {
        proxy_pass http://timeline_api;
        proxy_cache public_reel;
        proxy_cache_key $scheme$host$uri;
        proxy_cache_valid 200 5m;
        proxy_cache_valid 404 1m;
        proxy_cache_bypass $http_x_no_cache;
        proxy_cache_use_stale error timeout updating;
        proxy_cache_lock on;
        proxy_cache_lock_timeout 5s;
        add_header X-Cache-Status $upstream_cache_status always;
    }

    # SPA HTML — same handle-keyed cache, same TTLs
    location ~ ^/u/[^/]+$ {
        try_files $uri /index.html;  # SPA fallback
        # (HTML is identical across handles; caching is just trim-the-hop)
        # Phase 8 may revisit if HTML serving moves behind a different upstream
    }

    # All other /api/* — pass through, no cache (auth-bearing)
    location /api/ {
        proxy_pass http://timeline_api;
        proxy_set_header Authorization $http_authorization;
        # explicitly no proxy_cache here
    }
}
```

**Notes:**
- `keys_zone=public_reel:10m` — 10 MB of zone metadata fits ~80k cache entries; way more than the portfolio-scale handle count needs.
- `inactive=24h` — entries unused for 24h are evicted, even if not expired.
- `proxy_cache_valid 404 1m` — short negative-cache TTL prevents enumeration brute-force from poisoning [VERIFIED: nginx docs / oneuptime.com], and lets a newly-claimed handle become public within ~60 seconds.
- `proxy_cache_use_stale error timeout updating` — serve stale during backend transient failure / during cache fill races. Combined with `proxy_cache_lock on`, only one request per key revalidates upstream.
- `add_header ... always` — critical; without `always`, the header is omitted for non-2xx responses, defeating the debugging-on-404 use case.
- `Cache-Control` from the app and `proxy_cache_valid` interact: by default, `proxy_cache_valid` is overridden by upstream `Cache-Control: max-age=…`. The two are set to the same values (300/60) so behavior is consistent whether nginx honors app headers or its own directive. App-layer headers also flow through to the *browser* cache (the recruiter's phone).
- `proxy_cache_bypass $http_x_no_cache` — sending `X-No-Cache: 1` from the app's authenticated edit path forces a re-fetch (not active invalidation, just a per-request bypass). Phase 7 doesn't wire this; reserved for v2.

### Anti-Patterns to Avoid

- **Hand-rolling a focus trap in JS for the modal.** Native `<dialog>` provides it; rolling it yourself is 200 lines of error-prone code (Tab + Shift+Tab loop, initial focus restore, etc.).
- **Setting `prefers-reduced-motion` via `window.matchMedia` directly in OrbitReel.** Reuse `usePrefersReducedMotion()` (already exists).
- **Calling `easeTo({ duration: Infinity })` for the orbit.** Not the right primitive; produces `moveend` storms that interfere with gesture state.
- **Using TanStack Query for `usePublicReel`.** Not installed; would be a 6-file refactor for no benefit at portfolio scale.
- **Adding a new `app.use('/api/*', ...)` bulk middleware.** Would inadvertently apply JWT to the new public routes.
- **Caching `/api/handles/check` at Nginx.** D-04 mandates `Cache-Control: no-store`; nginx will not cache a response with `no-store` by default, but plan should explicitly assert this in tests.
- **Returning `{ available: true }` for a candidate that fails local `validateHandle()`.** The endpoint must run the same `validateHandle` and return `{ available: false, reason: '<reason>' }` for length/regex/reserved failures before the DB query.
- **Empty-state illustration for the 0-city globe.** Locked design risk #3.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Focus trap inside modal | Custom Tab-cycle JS | Native `<dialog>.showModal()` | Built-in; aria-modal=true implicit; Tab cycles automatically [CITED: css-tricks.com] |
| Debounce | Lodash debounce | `setTimeout` in `useEffect` cleanup | Already a project pattern; 4 lines; saves a dep |
| RAF loop | `react-spring`, `framer-motion useTime` | Plain RAF | This is a uniform-velocity continuous loop, not a spring or easing; the simpler primitive matches |
| Globe rendering | Three.js sphere texture | MapLibre v5 `setProjection({ type: 'globe' })` | Built into the library we already ship; correct one-line API [VERIFIED: MapLibre v5 docs] |
| HTTP caching | Custom in-Hono LRU + ETag handshake | Nginx `proxy_cache` | Phase 8 ships Nginx anyway; double-caching is just complexity |
| Pg unique-violation translation | Naïve `err.code === '23505'` | `pgErrorCode(err)` helper (Phase 5) | Drizzle wraps errors; `err.code` is undefined on `DrizzleQueryError` [VERIFIED: project memory `project_drizzle_pg_error_wrapping.md`] |

**Key insight:** Phase 7 is mostly about composition of already-built primitives — `validateHandle`, `RESERVED_HANDLES`, `pgErrorCode`, `useApi`, `useCitiesQuery`'s pattern, `MapCanvas`, `usePrefersReducedMotion`, `HandlePickerGate`. The only genuinely new code is two new Hono routes, two new React components (OrbitReel + GlobeReel), one new hook (`useHandleCheck`), the modal upgrade, and one nginx config file.

## Common Pitfalls

### Pitfall 1: RAF loop leaks under React.StrictMode

**What goes wrong:** First mount starts RAF #1; cleanup runs but doesn't cancel because of a closure bug; second mount starts RAF #2; both update bearing each frame → twice the rotation rate.

**Why it happens:** Forgetting to capture `rafId` in a closure-stable place, or returning a cleanup that references the wrong `rafId`.

**How to avoid:** Pattern 1 above — keep `rafId` in a single `let` inside the effect; cleanup function captures it by closure. Verify under React.StrictMode dev mode: cycle a tab away/back, confirm bearing rate stays 45°/s.

**Warning signs:** Orbit appears to rotate at double speed in dev (production with StrictMode off would mask this).

### Pitfall 2: visibilitychange + RAF time-warp on resume

**What goes wrong:** Tab hidden for 30 seconds; on resume, the `dt` between last frame and current frame is 30,000ms; bearing jumps ~22 full rotations in one frame.

**Why it happens:** RAF is throttled (~1Hz) when hidden, so `lastT` is stale; on visibility resume, the next frame computes a huge `dt`.

**How to avoid:** Pattern 1 — set `lastT = null` whenever `document.hidden` becomes true; on the next non-hidden frame, skip the integration and re-baseline.

**Warning signs:** Map "spins" briefly when user comes back to the tab.

### Pitfall 3: `setProjection({ type: 'globe' })` called before style loads

**What goes wrong:** Map init throws `Cannot set projection before style is loaded` or silently falls back to mercator.

**Why it happens:** `new maplibregl.Map({...})` returns synchronously, but the style is fetched async. Calling `setProjection` immediately races the style fetch.

**How to avoid:** Wait for `map.on('style.load', () => map.setProjection({ type: 'globe' }))`.

**Warning signs:** Globe renders as a flat stretched mercator world map.

### Pitfall 4: Live-check race overwrites freshest answer

**What goes wrong:** User types `bryan` → slow request fires. User types `bryan2` → fast request fires and resolves. Slow `bryan` response arrives after, overwrites UI with stale "available".

**Why it happens:** Naïve `setState` on response without checking if a newer request is in flight.

**How to avoid:** `reqIdRef` sentinel pattern (Pattern 6). Combined with `AbortController.abort()`, slow requests both (a) get cancelled if the abort signal propagates and (b) are discarded if not.

**Warning signs:** Status flicker as user types fast — green check briefly on a candidate that's actually taken.

### Pitfall 5: Public route case-sensitivity drift

**What goes wrong:** User registers `bryan`; recruiter opens `/u/Bryan`; server does case-sensitive `WHERE handle = 'Bryan'` → 404.

**Why it happens:** `validateHandle` lowercases at claim time (Phase 4), so `users.handle` is always lowercase. But the public route's `handle` param comes from the URL, which can be mixed case.

**How to avoid:** In `/api/public/u/:handle` handler, lowercase the param before lookup: `WHERE LOWER(users.handle) = LOWER($1)`. Or simpler: lowercase in JS and `eq()`. Plan-time decision on 301 redirect is deferred (CONTEXT.md says defer).

**Warning signs:** Users report "my own URL gives 404" — they tested `/u/Bryan` instead of `/u/bryan`.

### Pitfall 6: Hono route ordering — public route caught by JWT middleware

**What goes wrong:** Adding `app.use('/api/*', requireJwt)` somewhere in the file means `/api/public/u/:handle` returns 401 even though it's mounted as a public route.

**Why it happens:** Hono runs middleware in registration order. The existing pattern uses per-prefix middleware (`/api/me`, `/api/cities`, `/api/photos`); adding a bulk `/api/*` middleware bypasses the per-prefix isolation.

**How to avoid:** Continue the per-prefix pattern. Register public routes (or at minimum, `app.get('/api/handles/check', ...)` and `app.route('/api/public/u', ...)`) at the top of the file, BEFORE the JWT middleware blocks. Add a regression test that calls `/api/public/u/anyhandle` WITHOUT an Authorization header and asserts the response is NOT 401 (it can be 404 — that's fine).

**Warning signs:** 401 from a route the docs say is public.

### Pitfall 7: REEL-09 photo cycling assumes ≥1 chapters with arrival pulse

**What goes wrong:** OrbitReel reuses `ChapterOverlay` / `chaptersWithPhotos`. If photo cycling logic from Phase 6 assumes a chapter-change event to advance the photo carousel, the 1-city case (no chapter changes) will never cycle.

**Why it happens:** Photo cycling was wired in Phase 6 around chapter transitions.

**How to avoid:** Read `src/reel/chaptersWithPhotos.ts` and Phase 6's photo-cycle hook closely during planning. The 1-city orbit needs an independent photo-cycle timer (probably the 4s interval already in use). D-13 says "photo cycling continues normally within the orbit" — confirm this primitive exists or budget for it.

**Warning signs:** 1-city reel shows the first photo forever.

### Pitfall 8: `<dialog>` element doesn't render inside the React tree as expected

**What goes wrong:** Backdrop styling doesn't apply, or modal renders in document flow without top-layer treatment.

**Why it happens:** `<dialog open>` does not trigger top-layer rendering; only `showModal()` does. Tailwind's `backdrop:` variant requires Tailwind 3.x (already shipped); if `backdrop:bg-black/60` doesn't fire, the modal will show without the dimmed background.

**How to avoid:** Confirm `showModal()` is called in `useEffect`. Test that `dialog::backdrop` styles apply — if not, fallback to fixed-positioned div approach (current implementation).

**Warning signs:** Modal floats over content without dimming the rest of the page.

## Code Examples

### Live-availability endpoint (server/routes/handlesCheck.ts)

```typescript
// Source: composed from Phase 4 validate.ts + me.ts patterns; no external citation
import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { validateHandle } from '../handles/validate.js';

const querySchema = z.object({
  candidate: z.string().min(1).max(64), // hard cap; validateHandle enforces semantic rules
});

export const handlesCheckHandler = async (c: Parameters<Parameters<Hono['get']>[1]>[0]) => {
  c.header('Cache-Control', 'no-store');
  const parsed = querySchema.safeParse({ candidate: c.req.query('candidate') });
  if (!parsed.success) {
    return c.json({ available: false, reason: 'invalid_chars' as const });
  }
  const v = validateHandle(parsed.data.candidate);
  if (!v.ok) {
    return c.json({ available: false, reason: v.reason });
  }
  // Case-insensitive uniqueness check. validateHandle has lowercased v.handle.
  const [row] = await db.select({ id: users.id }).from(users)
    .where(sql`LOWER(${users.handle}) = ${v.handle}`)
    .limit(1);
  if (row) return c.json({ available: false, reason: 'taken' as const });
  return c.json({ available: true as const });
};
```

### Public reel endpoint (server/routes/publicReel.ts)

```typescript
import { Hono } from 'hono';
import { eq, sql, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, cities, photos } from '../db/schema.js';
import { getPublicUrl } from '../oci/parClient.js'; // existing from Phase 6

export const publicReelRouter = new Hono();

publicReelRouter.get('/:handle', async (c) => {
  const handle = c.req.param('handle').toLowerCase();

  // Lookup user
  const [user] = await db.select({ id: users.id, handle: users.handle }).from(users)
    .where(sql`LOWER(${users.handle}) = ${handle}`)
    .limit(1);
  if (!user) {
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({ error: 'not_found' as const }, 404);
  }

  // Cities (explicit projection; userId included for DTO parity with CityDTO)
  const cityRows = await db.select({
    id: cities.id, userId: cities.userId, orderIndex: cities.orderIndex,
    name: cities.name, tripLabel: cities.tripLabel,
    lat: cities.lat, lng: cities.lng,
    zoom: cities.zoom, pitch: cities.pitch, bearing: cities.bearing,
    arrivedAt: cities.arrivedAt, caption: cities.caption,
    createdAt: cities.createdAt, updatedAt: cities.updatedAt,
  }).from(cities)
    .where(eq(cities.userId, user.id))
    .orderBy(cities.orderIndex);

  // Photos — flat, with cityId; only status='ready'
  const cityIds = cityRows.map((c) => c.id);
  const photoRows = cityIds.length === 0
    ? []
    : await db.select({
        id: photos.id, cityId: photos.cityId,
        masterKey: photos.masterKey, thumbKey: photos.thumbKey,
        orderIndex: photos.orderIndex,
      }).from(photos)
        .where(sql`${photos.cityId} IN ${inArray(photos.cityId, cityIds)} AND ${photos.status} = 'ready'`);

  const photoDtos = photoRows.map((p) => ({
    id: p.id,
    cityId: p.cityId,
    masterUrl: getPublicUrl(p.masterKey),
    thumbUrl: p.thumbKey ? getPublicUrl(p.thumbKey) : getPublicUrl(p.masterKey),
    orderIndex: p.orderIndex,
  }));

  c.header('Cache-Control', 'public, max-age=300, s-maxage=300');
  return c.json({
    user: { handle: user.handle, displayName: null },
    cities: cityRows,
    photos: photoDtos,
  });
});
```

### usePublicReel (src/api/publicReel.ts)

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CityDTO } from '@/types/city';

export interface PublicReelPhotoDTO {
  readonly id: string;
  readonly cityId: string;
  readonly masterUrl: string;
  readonly thumbUrl: string;
  readonly orderIndex: number;
}

export interface PublicReelDTO {
  readonly user: { readonly handle: string; readonly displayName: string | null };
  readonly cities: readonly CityDTO[];
  readonly photos: readonly PublicReelPhotoDTO[];
}

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: PublicReelDTO }
  | { kind: 'not_found' }
  | { kind: 'error'; error: Error };

export function usePublicReel(handle: string): State {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const reqIdRef = useRef(0);

  useEffect(() => () => { reqIdRef.current = -1; }, []);

  const refetch = useCallback(async () => {
    const myId = ++reqIdRef.current;
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/public/u/${encodeURIComponent(handle)}`);
      if (myId !== reqIdRef.current) return;
      if (res.status === 404) { setState({ kind: 'not_found' }); return; }
      if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
      const data = (await res.json()) as PublicReelDTO;
      if (myId !== reqIdRef.current) return;
      setState({ kind: 'ok', data });
    } catch (e) {
      if (myId !== reqIdRef.current) return;
      setState({ kind: 'error', error: e instanceof Error ? e : new Error(String(e)) });
    }
  }, [handle]);

  useEffect(() => { void refetch(); }, [refetch]);

  return state;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom focus-trap library (focus-trap-react, react-focus-lock) | Native `<dialog>` + `showModal()` | ~2023 with Chrome 108 / Firefox 98 / Safari 15.4 (all in project's browser floor) | Zero-dep modal with built-in focus trap |
| `mapboxgl.Map` proprietary | MapLibre GL JS v5 (open-source fork) | Library age | Same API surface; globe projection added in v5 (2024) |
| Hand-rolled debounce hooks | `setTimeout` in `useEffect` cleanup | React 18+ | One pattern; cleanup-safe |
| Naïve `err.code === '23505'` for pg unique violations | `pgErrorCode(err)` unwrap helper | Drizzle 0.45+ | DrizzleQueryError wraps; need `err.cause.code` (project memory) |
| `mountedRef.current = false` cleanup-only pattern | `reqIdRef = ++count; if (myId !== current) return` sentinel | StrictMode adoption | Project memory `feedback_mountedref_strictmode.md` |

**Deprecated/outdated:**
- `focus-trap-react` package — superseded by native `<dialog>` for the modal use case.
- Map projections via custom shaders / Three.js sphere texture — MapLibre v5 ships `setProjection({ type: 'globe' })`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Native `<dialog>` element's `::backdrop` pseudo-element + Tailwind `backdrop:` variant works on iPhone 14 Pro Safari (project's canonical device) | Pattern 3 | If backdrop styling silently fails on iOS Safari, modal lacks dimmed background. Fallback: keep the existing fixed-positioned div approach. **Verify in Phase 7 Wave 0 / Plan 07-01 manual test.** |
| A2 | MapLibre v5's `setProjection({ type: 'globe' })` works at zoom 1 with `interactive: false` and pitch 0 | Pattern 2 | If globe rendering breaks under these constraints, fall back to a flat mercator world view at zoom 1 (slightly less cinematic but still acceptable per D-16). |
| A3 | RAF-driven `setBearing()` at 45°/s sustains 60 FPS on iPhone 14 Pro Safari for ≥30s | Pitfall 1, 2 | Continuous WebGL rotation could thermal-throttle or jank. Mitigation: pause-on-hidden already in spec; orbit naturally stops on user interaction (D-12). **Verify with real-device perf check during 07-02 execution.** |
| A4 | Phase 6's photo-cycling primitive (cycle within a single chapter) is independent of chapter-transition events and will work in the 1-city orbit | Pitfall 7 | Photo cycling could be tied to chapter-change events; in 1-city case there are no transitions. Plan must read `chaptersWithPhotos.ts` and the Phase 6 cycle hook to confirm. |
| A5 | `proxy_cache_valid` interacts cleanly with app-layer `Cache-Control: public, max-age=N, s-maxage=N` headers | Pattern 7 | If nginx's default behavior surprises us (e.g., honoring `s-maxage` but not `max-age`), the cache could expire at unexpected times. Setting both to 300 mitigates the failure mode. |
| A6 | `users.handle` was stored lowercase during Phase 4 (so `LOWER(handle) = $1` matches) | Pitfall 5, publicReel code | Confirmed by reading `validateHandle()` — it lowercases at line 26 before insert. **Verified.** |
| A7 | Phase 6's `getPublicUrl(masterKey)` works without authentication context | publicReel code | The OCI bucket prefix is public-read per PROJECT.md decision; URL construction is pure (no API call). **Verified by reading Phase 6 architecture in STATE.md.** |
| A8 | The 0-city public reel surface should NOT render the `ChapterOverlay`, `ChapterRail`, or `CTAPill` (the standard reel chrome) since there are no chapters | GlobeReel component design | If user expectation is "reel chrome still appears", design needs adjustment. DESIGN.md says no empty-state illustrations on public; doesn't speak to chrome. **Confirm with user/CONTEXT-implied minimal-chrome reading.** D-16 caption "anchored bottom via existing ChapterOverlay-style layout slot" suggests we keep the layout slot but no chapter data. |

## Open Questions

1. **301 redirect for uppercase handles** (CONTEXT.md D-06 defers this)
   - What we know: `validateHandle` lowercases; `users.handle` is always lowercase; case-insensitive lookup handles the read correctly.
   - What's unclear: Whether to 301 `/u/Bryan` → `/u/bryan` for canonical URL, or quietly serve the same content at either case.
   - Recommendation: Defer to plan. Server-side 301 is one extra `if` in publicReel handler. Plan can decide; both options are trivial.

2. **CTAPill on public reel surfaces**
   - What we know: Existing `Reel.tsx` renders `<CTAPill />` ("Make your own →"). The 0-city and 1-city variants are new components — do they reuse it?
   - What's unclear: Whether OrbitReel/GlobeReel render the CTA. DESIGN.md says the public reel always has a CTA top-right.
   - Recommendation: Plan to include CTAPill in OrbitReel and GlobeReel; confirm in 07-02 implementation.

3. **Photo cycling in 1-city orbit (REEL-09 interaction)**
   - What we know: Phase 6 implemented photo cycling within a chapter group; D-13 says it should continue in orbit.
   - What's unclear: Whether the cycle primitive is event-driven (chapter-change) or timer-driven (4s interval per Phase 6 SUMMARY).
   - Recommendation: Plan 07-02 reads `src/hooks/useCyclingPhotoIndex.ts` (or whatever the Phase 6 hook is named) and confirms it timer-based. Budget half a task for an adapter if it's event-driven.

4. **Existing HandlePickerModal: rewrite vs extend?**
   - What we know: Phase 4 shipped a working modal with client-side validation and submit. Phase 7 adds the live debounced check + URL preview + (recommended) native `<dialog>`.
   - What's unclear: Whether plan 07-01 modifies the existing file or replaces it.
   - Recommendation: Modify in place. Diff is bounded: add `useHandleCheck` hook usage, add the URL preview `<p>`, swap the wrapper div for `<dialog>` with showModal effect. Keep the existing form-submit logic verbatim.

## Environment Availability

Phase 7 is mostly code-and-config. Probed dependencies:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + bun | All execution | ✓ | (project standard) | — |
| Postgres (running) | Live-check endpoint test, public endpoint test | (assumed via existing `bun run db:up`) | 16 | — |
| MapTiler API key | Globe + orbit map tiles | (existing `VITE_MAPTILER_KEY` in `.env.local` per Phase 2) | — | demotiles fallback (already wired in MapCanvas.tsx) |
| Nginx CLI for syntax check | Validating `ops/nginx/timeline.conf` locally | (optional) — | Phase 8 will validate on the VM; Phase 7 can ship the file without local install | `nginx -t -c ops/nginx/timeline.conf` if installed |
| OCI Object Storage bucket (public-read prefix) | `getPublicUrl()` returns reachable URLs | ✓ (Phase 6) | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** Local nginx — Phase 7 ships the file as data; Phase 8 wires it. If a contributor wants to syntax-check, `brew install nginx` is one command, but not required to complete the phase.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 + jsdom 29.1.1 + @testing-library/react 16.3.2 |
| Config file | `vitest.config.ts` (existing); per-file `// @vitest-environment jsdom` for DOM tests, default node for server tests |
| Quick run command | `bun run test -- <pattern>` |
| Full suite command | `bun run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-05 | handle pattern enforced server-side on POST claim | unit | `bun run test -- handles/validate` | EXISTING (Phase 4) |
| AUTH-06 | reserved-word blocks claim | unit | `bun run test -- handles/validate` | EXISTING (Phase 4) |
| AUTH-07 | Picker modal renders when handle null; submits POST | integration | `bun run test -- HandlePickerModal` | ❌ Wave 0 (new test file) |
| AUTH-07 | Live check debounces 300ms + aborts on new keystroke | unit (hook) | `bun run test -- useHandleCheck` | ❌ Wave 0 |
| PUBLIC-01 | GET /api/public/u/:handle returns 200 with DTO | integration | `bun run test -- publicReel` | ❌ Wave 0 |
| PUBLIC-01 | Unknown handle → 404 with Cache-Control: max-age=60 | integration | `bun run test -- publicReel` | ❌ Wave 0 (same file) |
| PUBLIC-01 | Mixed-case handle in URL → 200 (case-insensitive lookup) | integration | `bun run test -- publicReel` | ❌ Wave 0 |
| PUBLIC-01 | photos[] filters status='ready' (pending/failed excluded) | integration | `bun run test -- publicReel` | ❌ Wave 0 |
| PUBLIC-01 | Public endpoint reachable WITHOUT Authorization header (regression guard) | integration | `bun run test -- publicReel.public` | ❌ Wave 0 |
| PUBLIC-02 | HandleReelRoute renders globe variant on cities.length===0 | integration (jsdom) | `bun run test -- HandleReelRoute` | ❌ Wave 0 |
| PUBLIC-03 | HandleReelRoute renders orbit variant on cities.length===1 | integration (jsdom) | `bun run test -- HandleReelRoute` | ❌ Wave 0 (same file) |
| PUBLIC-04 | ops/nginx/timeline.conf exists and parses (manual / nginx -t) | manual | `nginx -t -c ops/nginx/timeline.conf` (if installed) | manual-only — file existence check is automatable: `test -f ops/nginx/timeline.conf` |
| REEL-08 | useBearingOrbit advances bearing at specified rate; pauses on hidden | unit | `bun run test -- useBearingOrbit` | ❌ Wave 0 |
| REEL-08 | OrbitReel cleans up RAF on unmount (no leak under StrictMode double-mount) | unit | `bun run test -- OrbitReel.lifecycle` | ❌ Wave 0 |
| GENERAL | /api/handles/check returns Cache-Control: no-store header | integration | `bun run test -- handlesCheck` | ❌ Wave 0 |
| GENERAL | /api/handles/check returns {available, reason} for all five reason codes | integration | `bun run test -- handlesCheck` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `bun run test -- <new-file-pattern>` (typically ~50ms-500ms)
- **Per wave merge:** `bun run test` (full suite, ~30s at current 235-test baseline)
- **Phase gate:** Full suite green + frontend + server typecheck (`bun run typecheck`)

### Wave 0 Gaps

- [ ] `server/routes/handlesCheck.test.ts` — covers AUTH-05, AUTH-06, AUTH-07-live-check
- [ ] `server/routes/publicReel.test.ts` — covers PUBLIC-01 (200, 404, ready-filter, case-insensitive, no-auth regression guard)
- [ ] `src/api/handlesCheck.test.ts` — unit tests for `useHandleCheck` hook (debounce, abort, reqIdRef sentinel, all five reason codes)
- [ ] `src/api/publicReel.test.ts` — unit tests for `usePublicReel` hook (states: loading, ok, not_found, error)
- [ ] `src/routes/HandleReelRoute.test.tsx` — branch logic on cities.length (0 → globe, 1 → orbit, ≥2 → standard reel)
- [ ] `src/reel/useBearingOrbit.test.ts` — bearing advance rate, pause-on-hidden, cleanup-on-unmount
- [ ] `src/auth/HandlePickerModal.test.tsx` — upgrade existing test (if any) to cover live-check integration + URL preview line + `<dialog>` showModal lifecycle
- [ ] Manual: visual check on iPhone 14 Pro Safari that orbit/globe render correctly and pause when tabbing away
- [ ] Manual: `nginx -t -c ops/nginx/timeline.conf` if nginx is installed locally (not blocking — Phase 8 will validate)

*(All test files are new; no existing infrastructure changes needed beyond the file creation.)*

## Security Domain

`security_enforcement` is enabled (no `.planning/config.json` override).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Public routes (`/api/public/u/*`, `/api/handles/check`) explicitly bypass JWT — by design. Test asserts they DON'T require auth. JWT-protected routes unchanged. |
| V3 Session Management | n/a | No session state introduced; modal mutates user state via existing POST /api/me/handle |
| V4 Access Control | yes | Public reel exposes data intentionally; private fields (userId, email, photo masterKey/thumbKey, status) MUST NOT leak through DTO projection (Pattern 5) |
| V5 Input Validation | yes | Zod schema on `?candidate=` query param; existing Zod on POST /api/me/handle; handle param in URL validated via `validateHandle` before DB lookup |
| V6 Cryptography | n/a | No new crypto; existing Auth0 JWT validation is untouched |
| V8 Data Protection | yes | DTO projection — public response must not include email, auth0Sub, or photo internal keys. Tests cover this. |
| V11 Business Logic | yes | Handle claim race (D-03) → uniqueness enforced by Postgres UNIQUE constraint + 23505 → 409 collapse. Live-check is advisory only. |
| V13 API & Web Service | yes | Cache-Control headers correct (D-04 `no-store` on live-check; D-08 `public, max-age=300` on public reel) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Handle enumeration via `/api/handles/check` brute-force | Information Disclosure | Acknowledged risk (CONTEXT.md deferred). Mitigated in Phase 8 via Nginx-level rate limit if needed. |
| 404 enumeration via `/api/public/u/:handle` to confirm which handles exist | Information Disclosure | Inherent to a public-handle product. Caching 404s for 60s slightly raises the cost. Acceptable risk. |
| SQL injection via `:handle` URL param | Tampering | Drizzle parameterizes via `sql\`LOWER(${users.handle}) = ${handle}\``; the handle is also lowercased in JS before query, but parameterization is the actual mitigation. |
| Cross-origin photo URL leak | Information Disclosure | OCI public-read prefix is intentional (Phase 6 decision). URLs include only the object key, not signing material. |
| XSS via handle param echoed back in 404 page | XSS | Handle param validated via the same regex pattern at lookup time; React's auto-escape protects the SPA 404 page. No SSR of the handle into HTML in Phase 7. |
| CSRF on POST /api/me/handle | Tampering | Existing Auth0 JWT in Authorization header (not cookie) prevents classic CSRF. Unchanged. |
| Negative-cache poisoning via crafted 404 | Tampering | Cache key includes `$scheme$host$uri`; no header-based variation; 1m TTL bounds damage. |
| Cache key collision with case variation | Information Disclosure | `/u/Bryan` and `/u/bryan` produce different cache keys but same content (case-insensitive server lookup). Acceptable — at most 2x cache space per popular handle. |
| Public response leaks private user fields | Information Disclosure | Explicit Drizzle `select({...})` projection in `publicReelRouter`; tests verify response shape. |

## Sources

### Primary (HIGH confidence)

- **Project codebase (verified by Read):**
  - `server/handles/validate.ts` — handle regex + reasons
  - `server/handles/reservedWords.ts` — 26-entry frozen Set
  - `server/routes/me.ts` — POST /api/me/handle 23505→409 pattern
  - `server/index.ts` — mount-point precedent (`/health` is public; `/api/me/*` is JWT)
  - `server/db/schema.ts` — `users.handle text unique` (nullable)
  - `server/routes/cities.ts` — Drizzle projection pattern; `pgErrorCode` usage
  - `src/api/cities.ts` — `useCitiesQuery` (the local pattern to mirror for `usePublicReel`)
  - `src/hooks/useAllPhotos.ts` — `reqIdRef` sentinel pattern
  - `src/auth/HandlePickerGate.tsx` + `HandlePickerModal.tsx` — Phase 4 baseline
  - `src/auth/useApi.ts` — auth callable wrapper (NOT used in public hook)
  - `src/reel/MapCanvas.tsx` + `Reel.tsx` + `ReducedMotionReel.tsx` — multi-chapter Reel pipeline
  - `src/gestures/useGestureMachine.ts` — visibilitychange + RAF lifecycle precedent
  - `src/routes/AppLayout.tsx` — modal sibling-to-Outlet composition
  - `src/types/city.ts` — `CityDTO` shape (DTO contract)
  - `package.json` — confirmed dependencies; NO TanStack Query, NO Headless UI / Radix
- **`.planning/PROJECT.md`** — locked stack (MapLibre v5, Hono, Drizzle, etc.)
- **`.planning/STATE.md`** — Phase 4–6 accumulated decisions (pgErrorCode helper, StrictMode mountedRef pitfall, dual `.env` keys)
- **`DESIGN.md`** — motion tokens, locked risks, public-reel-always-dark
- **`.planning/phases/07-public-urls-handle/07-CONTEXT.md`** — locked decisions D-01 through D-22
- **Project memory:**
  - `feedback_mountedref_strictmode.md` — why `mountedRef` is footgun, why `reqIdRef` is project pattern
  - `project_drizzle_pg_error_wrapping.md` — `err.cause.code` unwrap requirement
- **`npm view maplibre-gl version`** → 5.24.0 (installed: 5.0.0)
- **MapLibre official docs:** [Display a globe with a vector map](https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe-with-a-vector-map/), [Set pitch and bearing](https://maplibre.org/maplibre-gl-js/docs/examples/set-pitch-and-bearing/), [Map class](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/)
- **Nginx official docs:** [proxy_module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [Content Caching admin guide](https://docs.nginx.com/nginx/admin-guide/content-cache/content-caching/)

### Secondary (MEDIUM confidence)

- [css-tricks.com — There is No Need to Trap Focus on a Dialog Element](https://css-tricks.com/there-is-no-need-to-trap-focus-on-a-dialog-element/) — verified against current `<dialog>` spec behavior
- [dev.to / link2twenty — React: Using native dialogs to make a modal popup](https://dev.to/link2twenty/react-using-native-dialogs-to-make-a-modal-popup-4b25) — implementation pattern
- [Jawg — MapLibre GL JS Globe projection](https://www.jawg.io/docs/integration/maplibre-gl-js/globe-projection/) — confirms `style.load` ordering requirement
- [Stadia Maps — Turn your Maps into a 3D Globe with MapLibre](https://docs.stadiamaps.com/tutorials/3d-globe-view-with-maplibre-gl-js/) — alternative confirmation of `setProjection` syntax
- [GitHub maplibre/maplibre-gl-js #5114](https://github.com/maplibre/maplibre-gl-js/issues/5114) — projection transition landmines
- [NGINX Community Blog — Caching Guide](https://blog.nginx.org/blog/nginx-caching-guide) — `proxy_cache_lock`, `proxy_cache_use_stale` patterns
- [Hono docs — Routing](https://hono.dev/docs/api/routing) — middleware execution order in registration order

### Tertiary (LOW confidence — verify in execution)

- iPhone 14 Pro Safari sustained 60 FPS under continuous `setBearing()` RAF — based on MapLibre's general performance claims; needs real-device verification in 07-02 UAT.
- Tailwind 3.4 `backdrop:` variant works on iOS Safari ≥ 15.4 — Tailwind docs say yes; assumption A1 flags this for Wave 0 manual check.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and load-bearing in earlier phases; no version risk
- Architecture patterns: HIGH — every primitive (Hono mount, Drizzle projection, MapLibre `setBearing`/`setProjection`, native `<dialog>`, RAF) is documented and either already used in project or has a verified canonical example
- Pitfalls: HIGH — most pitfalls are project-memory-backed (StrictMode, Drizzle wrapping, Hono ordering); only A1 (`<dialog>::backdrop` on iOS) and A3 (orbit RAF perf on iPhone) are device-dependent assumptions, both flagged
- Security domain: HIGH — public-vs-private DTO projection is straightforward; no new auth surface

**Research date:** 2026-05-14
**Valid until:** 2026-06-13 (30 days — stack is stable; MapLibre v5 globe behavior is the only fast-moving piece)

## RESEARCH COMPLETE
