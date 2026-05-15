# Phase 7: Public URLs + handle reservation — Pattern Map

**Mapped:** 2026-05-14
**Files analyzed:** 18 (new + modified)
**Analogs found:** 17 / 18 (only `ops/nginx/timeline.conf` has no analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server/routes/handlesCheck.ts` | route (Hono handler, no auth) | request-response | `server/routes/me.ts` (POST /handle) | role-match (different verb/path, same validate+lookup shape) |
| `server/routes/publicReel.ts` | route (Hono sub-router, no auth) | CRUD-read | `server/routes/cities.ts` (GET /) | role-match (auth-stripped, explicit projection) |
| `server/index.ts` | config (route mounting) | n/a | itself (lines 23-49) | exact (extend existing precedent) |
| `server/validation/publicReel.ts` (or inline Zod) | validation schema | input-validate | `server/validation/cityInput.ts` (referenced from `cities.ts:6`) | role-match |
| `src/api/handlesCheck.ts` | api hook (debounced fetch) | request-response | `src/api/cities.ts` `useCitiesQuery` | role-match (no auth, adds debounce + AbortController) |
| `src/api/publicReel.ts` | api hook (one-shot fetch) | CRUD-read | `src/api/cities.ts` `useCitiesQuery` | exact (drop auth header) |
| `src/auth/HandlePickerModal.tsx` | component (modal) | request-response | itself (current contents) + RESEARCH Pattern 3 | exact-self (incremental upgrade) |
| `src/auth/HandlePickerGate.tsx` | component (gate) | request-response | itself (current contents) | exact-self (likely unchanged) |
| `src/routes/HandleReelRoute.tsx` | route component | request-response | `src/routes/AppReelRoute.tsx` | exact (data-fetching reel w/ branch on cities.length) |
| `src/routes/NotFoundHandleRoute.tsx` | route component | static | `src/routes/NotFoundRoute.tsx` | exact |
| `src/reel/OrbitReel.tsx` | component (cinematic variant) | event-driven (RAF) | `src/reel/Reel.tsx` + `MapCanvas.tsx` | role-match (new RAF-driven branch) |
| `src/reel/GlobeReel.tsx` | component (cinematic variant) | event-driven (RAF) | `src/reel/MapCanvas.tsx` init + RESEARCH Pattern 2 | partial (no existing globe analog) |
| `src/reel/OrbitReducedMotionReel.tsx` | component (static fallback) | static | `src/reel/ReducedMotionReel.tsx` | role-match |
| `src/reel/GlobeReducedMotionReel.tsx` | component (static fallback) | static | `src/reel/ReducedMotionReel.tsx` | role-match |
| `ops/nginx/timeline.conf` | ops config | n/a | none (see RESEARCH §Pattern 7) | NO ANALOG |
| `server/routes/handlesCheck.test.ts` | server integration test | test | `server/routes/cities.test.ts` (NO-JWT regression) | role-match |
| `server/routes/publicReel.test.ts` | server integration test | test | `server/routes/cities.test.ts` | exact |
| `src/auth/HandlePickerModal.test.tsx` (NEW) | client integration test | test | `src/reel/PhotoCycle.test.tsx` (mock + timers) | role-match (no existing test) |
| `src/routes/HandleReelRoute.test.tsx` | client integration test | test | `src/reel/PhotoCycle.test.tsx` | role-match |
| `src/reel/OrbitReel.test.tsx` + `GlobeReel.test.tsx` | client unit test | test | `src/reel/PhotoCycle.test.tsx` (fake timers + RAF) | role-match |

---

## Pattern Assignments

### `server/routes/handlesCheck.ts` (route, request-response, NO JWT)

**Analog:** `server/routes/me.ts` lines 1-7 (imports) + 34-44 (validateHandle), `server/routes/cities.ts` lines 22-28 (Drizzle SELECT shape).

**Imports pattern** (copy from `server/routes/me.ts:1-6`):

```typescript
import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { validateHandle } from '../handles/validate.js';
```

**Note:** Do NOT import `pgErrorCode` (no write path) and do NOT import `lazyProvisionUser` (public).

**validateHandle reuse pattern** (from `server/routes/me.ts:41-44`):

```typescript
const result = validateHandle(candidate);
if (!result.ok) {
  return c.json({ error: 'invalid_handle', reason: result.reason }, 422);
}
```

Adapt this to return `{ available: false, reason: result.reason }` (200, not 422 — the endpoint always returns 200 with availability info).

**Uniqueness SELECT pattern** (composed from `me.ts:60-66` claim path + RESEARCH §Code Examples):

```typescript
// Case-insensitive uniqueness — validateHandle already lowercased v.handle.
const [row] = await db.select({ id: users.id }).from(users)
  .where(sql`LOWER(${users.handle}) = ${v.handle}`)
  .limit(1);
if (row) return c.json({ available: false, reason: 'taken' as const });
return c.json({ available: true as const });
```

**Cache-Control header** (D-04 — set first, before any branch):

```typescript
c.header('Cache-Control', 'no-store');
```

**Project-specific patterns to preserve:**
- Discriminated-union return shape `{ available: true } | { available: false; reason: '...' }` — mirrors the existing `HandleValidation` shape in `server/handles/validate.ts:13-15`.
- The single source of truth is `validateHandle()` — do NOT duplicate the regex/reserved check.
- Zod the `?candidate=` query at the boundary (CLAUDE.md global rule); use `z.string().min(1).max(64)` and treat parse failure as `{ available: false, reason: 'invalid_chars' }`.

---

### `server/routes/publicReel.ts` (route, CRUD-read, NO JWT)

**Analog:** `server/routes/cities.ts` lines 1-28 (router setup + GET /).

**Router skeleton** (copy structure from `server/routes/cities.ts:1-16`):

```typescript
import { Hono } from 'hono';
import { eq, sql, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, cities, photos } from '../db/schema.js';
import { getPublicUrl } from '../oci/parClient.js';

export const publicReelRouter = new Hono();
```

**Drizzle SELECT projection pattern** (composed from `cities.ts:22-28` shape + RESEARCH §Pattern 5):

```typescript
// Explicit column projection — never select() with no args on a public route.
// Mirrors the implicit shape from server/routes/cities.ts:24 (`db.select().from(cities)`)
// but enumerates each column so a future column add doesn't auto-leak.
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
```

**Case-insensitive lookup** (RESEARCH §Pitfall 5):

```typescript
const handle = c.req.param('handle').toLowerCase();
const [user] = await db.select({ id: users.id, handle: users.handle }).from(users)
  .where(sql`LOWER(${users.handle}) = ${handle}`)
  .limit(1);
if (!user) {
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({ error: 'not_found' as const }, 404);
}
```

**Photos status='ready' filter** (RESEARCH §Pattern 5 — security: do NOT surface pending/failed):

```typescript
const photoRows = cityIds.length === 0
  ? []
  : await db.select({
      id: photos.id, cityId: photos.cityId,
      masterKey: photos.masterKey, thumbKey: photos.thumbKey,
      orderIndex: photos.orderIndex,
    }).from(photos)
      .where(sql`${photos.cityId} IN ${inArray(photos.cityId, cityIds)} AND ${photos.status} = 'ready'`);
```

**Cache-Control header on 200** (D-08):

```typescript
c.header('Cache-Control', 'public, max-age=300, s-maxage=300');
```

**Project-specific patterns to preserve:**
- Hono parameterized route registration — `.get('/:handle', ...)` is fine because no literal siblings exist under `/api/public/u/`. Document this in a code comment to prevent regression (cities.ts:112-114).
- Photo URL transformation via `getPublicUrl(masterKey)` is auth-free (Phase 6 decision; OCI bucket is public-read).
- DTO shape parity: `cityRows` includes `userId` for CityDTO compatibility (RESEARCH §Pattern 5 recommends option (a) — keep userId for parity).
- Final response shape: `{ user: { handle, displayName: null }, cities, photos }` — `displayName: null` placeholder per D-09.

---

### `server/index.ts` (config — mount points)

**Analog:** itself, lines 20-49 (existing precedent).

**Existing public mount pattern** (`server/index.ts:23-24`):

```typescript
// PUBLIC — no auth. /health is for direct API probes...
app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/api/health', (c) => c.json({ status: 'ok' }));
```

**New mount additions** (insert BEFORE line 34 — before any `app.use('/api/me', requireJwt, ...)`):

```typescript
// PUBLIC — no auth. Handle availability check + public reel payload.
// MUST be registered before the JWT-protected blocks below (Hono runs
// middleware in registration order).
app.get('/api/handles/check', handlesCheckHandler);
app.route('/api/public/u', publicReelRouter);
```

**LANDMINE (RESEARCH §Pitfall 6):** Do NOT add `app.use('/api/*', requireJwt, ...)` as a bulk middleware. The existing code uses per-prefix `app.use('/api/me', ...)`, `app.use('/api/cities', ...)`, `app.use('/api/photos', ...)` (lines 34, 38, 42). Preserve this per-prefix pattern; adding a bulk `/api/*` middleware would intercept the new public routes.

---

### `src/api/handlesCheck.ts` (NEW api hook — debounced + AbortController)

**Analog:** `src/api/cities.ts` `useCitiesQuery` lines 21-60 (reqIdRef sentinel + state machine) + `src/auth/HandlePickerGate.tsx:32-46` (AbortController pattern).

**reqIdRef sentinel pattern** (copy verbatim from `src/api/cities.ts:29-35`):

```typescript
const reqIdRef = useRef(0);

useEffect(() => {
  return () => {
    reqIdRef.current = -1;
  };
}, []);
```

**Stale-response guard pattern** (copy from `src/api/cities.ts:38-52`):

```typescript
const myId = ++reqIdRef.current;
try {
  const res = await fetch(...);
  if (myId !== reqIdRef.current) return;
  if (!res.ok) { /* setError */ return; }
  const json = await res.json();
  if (myId !== reqIdRef.current) return;
  // setData(json)
} catch (e) {
  if (myId !== reqIdRef.current) return;
  // setError(e)
}
```

**AbortController + debounce shape** (RESEARCH §Pattern 6 — verbatim suggested):

```typescript
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
      // ... handle response
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
```

**Project-specific patterns to preserve:**
- NO `useApi()` — this endpoint is public; use bare `fetch()` (matches RESEARCH §Standard Stack note "public hook does NOT use Auth0 token getter").
- NO TanStack Query (RESEARCH §Alternatives Considered — project doesn't have it installed).
- `mountedRef` is a footgun (project memory `feedback_mountedref_strictmode.md`). Use `reqIdRef` with `-1` sentinel on unmount, increment on each request.
- Discriminated-union state machine `{ state: 'idle' } | { state: 'checking' } | { state: 'available' } | { state: 'unavailable'; reason } | { state: 'error' }` — mirrors the `validateHandle` return shape so the UI can render reason-specific messages.

---

### `src/api/publicReel.ts` (NEW api hook — one-shot public fetch)

**Analog:** `src/api/cities.ts` `useCitiesQuery` (almost verbatim, drop `useApi`, add 404 branch).

**State machine shape** (RESEARCH §Code Examples — `usePublicReel`):

```typescript
type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: PublicReelDTO }
  | { kind: 'not_found' }
  | { kind: 'error'; error: Error };
```

**Fetch + reqIdRef + 404 branch** (composed from `cities.ts:37-53`):

```typescript
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
```

**Project-specific patterns to preserve:**
- Same reqIdRef discipline as `useCitiesQuery`.
- NO `useApi()` — bare `fetch()` (no Authorization header).
- DTO shape: `{ user: { handle, displayName }, cities: readonly CityDTO[], photos: readonly PublicReelPhotoDTO[] }` — must be assignment-compatible with `useCitiesQuery` payload + `useAllPhotos` flat shape (D-07).

---

### `src/auth/HandlePickerModal.tsx` (MODIFY — incremental upgrade)

**Analog:** itself (current contents above, lines 1-117). Diff is bounded; do NOT rewrite.

**Current pattern to PRESERVE** (lines 23-71 — the validate + submit flow is correct):
- `validateHandle()` call before submit (line 46) — keep.
- POST `/api/me/handle` body shape (lines 53-57) — keep.
- 409/422 → user-friendly message (lines 58-65) — keep.
- `preview = input.trim().toLowerCase()` (line 41) — keep; surfaces the lowercased form.

**Changes to APPLY:**

1. **Wrap outer div in `<dialog>` + `showModal()` effect** (RESEARCH §Pattern 3):

```tsx
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
    {/* existing <form> contents */}
  </dialog>
);
```

Replaces the current `<div className="fixed inset-0 z-50 bg-black/60 ...">` wrapper (line 74).

2. **Add `useHandleCheck(preview, enabled)` hook usage** (from `src/api/handlesCheck.ts`):

```tsx
const check = useHandleCheck(preview, localValidation?.ok === true);
// Render an inline status icon next to the input:
//   check.state === 'checking' → muted spinner
//   check.state === 'available' → amber check (single amber accent only — DESIGN locked risk #1)
//   check.state === 'unavailable' → muted X + reason
```

3. **Add URL preview line** (D-05 — replaces the conditional "Will be saved as" hint on line 95-99):

```tsx
{preview && (
  <p className="text-xs text-ink-mute">
    timeline.bryanlam.dev/u/<code>{preview || '<input>'}</code>
  </p>
)}
```

4. **Update primary button text** (D-05 — change "Claim handle" to "Claim", disable when `check.state !== 'available'`):

```tsx
disabled={status === 'submitting' || check.state !== 'available'}
```

**Project-specific patterns to preserve:**
- Single amber accent only (DESIGN locked risk #1). The current `text-amber-500` for error text and the new check icon must both use the same amber token.
- `validateHandle` is the single source of truth — keep the local pre-check on submit (defense in depth even with live check).
- No "close" button, no "skip for now" (D-01, D-05).

---

### `src/auth/HandlePickerGate.tsx` (MAYBE-MODIFY — likely unchanged)

**Analog:** itself (current contents, lines 1-56).

**Gate logic to PRESERVE** (lines 27-56):

```tsx
const ctrl = new AbortController();
api('/api/me', { signal: ctrl.signal })
  .then(async (res) => {
    if (!res.ok) throw new Error(`me failed: ${res.status}`);
    const m = (await res.json()) as MeResponse;
    setMe(m);
    setLoaded(true);
  })
  .catch((err: unknown) => {
    if ((err as { name?: string }).name !== 'AbortError') setLoaded(true);
  });
return () => ctrl.abort();
```

**Confirmation:** This file likely needs ZERO changes for Phase 7. The gate decision (`me.handle === null`) is correct as-is. Plan should verify and only touch this file if upgrading the modal requires a prop-shape change (it does not, per the plan above).

---

### `src/routes/HandleReelRoute.tsx` (REWRITE — data-fetching reel with branch)

**Analog:** `src/routes/AppReelRoute.tsx` lines 1-103 (the canonical data-fetching reel route with cities.length branch).

**Imports + hook shape** (adapt from `AppReelRoute.tsx:1-26`):

```typescript
import { useEffect } from 'react';
import { useParams, Navigate } from 'react-router';
import { usePublicReel } from '@/api/publicReel';
import { groupChapters } from '@/reel/groupChapters';
import { chaptersWithPhotos } from '@/reel/chaptersWithPhotos';
import { Reel } from '@/reel/Reel';
import { OrbitReel } from '@/reel/OrbitReel';
import { GlobeReel } from '@/reel/GlobeReel';
import { ReducedMotionReel } from '@/reel/ReducedMotionReel';
import { usePrefersReducedMotion } from '@/reel/usePrefersReducedMotion';
```

**Branching pattern** (adapt from `AppReelRoute.tsx:24-74`):

```typescript
export function HandleReelRoute() {
  const { handle = '' } = useParams<{ handle: string }>();
  const reduced = usePrefersReducedMotion();
  const result = usePublicReel(handle);

  // Title side-effect — keep from current stub (lines 12-18)
  useEffect(() => {
    const previous = document.title;
    document.title = `@${handle} — Timeline`;
    return () => { document.title = previous; };
  }, [handle]);

  if (result.kind === 'loading') {
    return <div className="h-[100dvh] bg-bg-map" />;
  }
  if (result.kind === 'not_found') {
    return <NotFoundHandleRoute handle={handle} />;
  }
  if (result.kind === 'error') {
    // mirror AppReelRoute.tsx:34-49 error UI
  }

  const { cities, photos } = result.data;

  // Branch on cities.length (D-10)
  if (cities.length === 0) {
    return reduced ? <GlobeReducedMotionReel /> : <GlobeReel />;
  }
  if (cities.length === 1) {
    return reduced ? <OrbitReducedMotionReel city={cities[0]} photos={photos} /> : <OrbitReel city={cities[0]} photos={photos} />;
  }
  // ≥2 cities → use existing Reel pipeline
  const photosByCityId = groupPhotosByCityId(photos); // adapt from useAllPhotos shape
  const groups = groupChapters(cities);
  const chapters = chaptersWithPhotos(groups, photosByCityId);
  return reduced ? <ReducedMotionReel chapters={chapters} /> : <Reel chapters={chapters} />;
}
```

**Project-specific patterns to preserve:**
- React rules-of-hooks: hooks must be at the top of the component, NOT after early returns. `AppReelRoute.tsx:80` extracts the inner `AppReelContent` to call `useAllPhotos` unconditionally. For the public reel, since the flat `photos` array comes pre-fetched in `usePublicReel`, just group it inline (no extra hook fan-out needed).
- The `.app-reel-host` marker class (referenced in `AppReelRoute.tsx:13`) is for `/app/` only; HandleReelRoute does NOT add it.

---

### `src/routes/NotFoundHandleRoute.tsx` (NEW — handle-specific 404)

**Analog:** `src/routes/NotFoundRoute.tsx` (lines 1-13, full file).

**Full pattern to adapt** (`NotFoundRoute.tsx:1-13`):

```tsx
import { Link } from 'react-router';

export function NotFoundRoute() {
  return (
    <main className="min-h-dvh bg-bg text-ink flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-display text-2xl">Not found</h1>
      <Link to="/" className="underline underline-offset-4">
        Back to reel
      </Link>
    </main>
  );
}
```

**Adapt for handle-specific copy** (per D-11):

```tsx
export function NotFoundHandleRoute({ handle }: { readonly handle?: string }) {
  return (
    <main className="min-h-dvh bg-bg text-ink flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-display text-2xl">No reel at @{handle}</h1>
      <p className="text-ink-mute">That handle doesn&apos;t exist yet.</p>
      <Link to="/" className="underline underline-offset-4">Back to home</Link>
    </main>
  );
}
```

---

### `src/reel/OrbitReel.tsx` (NEW — 1-city continuous orbit)

**Analog:** `src/reel/MapCanvas.tsx` lines 41-84 (map init), `src/reel/Reel.tsx` lines 70-110 (overlay composition) + RESEARCH §Pattern 1 (RAF bearing orbit).

**Map init pattern** (copy structure from `MapCanvas.tsx:47-84`):

```typescript
useEffect(() => {
  const container = containerRef.current;
  if (!container) return;

  const map = new maplibregl.Map({
    container,
    style: STYLE_URL,
    center: [city.lng, city.lat],
    zoom: 14,    // D-12: zoom 14
    pitch: 60,   // D-12: pitch 60
    bearing: 0,
    interactive: false,
    pitchWithRotate: false,
    cooperativeGestures: false,
  });
  mapRef.current = map;

  return () => {
    map.remove();
    mapRef.current = null;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

**RAF bearing orbit pattern** (RESEARCH §Pattern 1 — verbatim):

```typescript
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  let rafId: number | null = null;
  let lastT: number | null = null;
  let bearing = map.getBearing();
  let paused = document.hidden;

  const DEGREES_PER_SECOND = 45;  // D-12: 8s per revolution

  const step = (t: number) => {
    if (!paused) {
      if (lastT !== null) {
        const dt = t - lastT;
        bearing = (bearing + (DEGREES_PER_SECOND * dt) / 1000) % 360;
        map.setBearing(bearing);
      }
      lastT = t;
    } else {
      lastT = null;
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
}, []);
```

**Overlay composition** (copy chrome from `Reel.tsx:70-110` minus ChapterRail dynamics):
- Render `ChapterOverlay` for the single chapter (D-13: single chapter rail still renders).
- Render `CTAPill` (RESEARCH §Open Q 2 — yes, CTA on public surfaces).
- Skip `ChapterRail` scrubbing logic (no transitions); render a static single-dot rail.

**Project-specific patterns to preserve:**
- `setBearing()`, not `easeTo({ duration: Infinity })` (RESEARCH §Alternatives Considered — `moveend` storms).
- `lastT = null` on `document.hidden` to prevent time-warp on resume (RESEARCH §Pitfall 2).
- RAF cleanup function captures `rafId` in closure-stable `let` (RESEARCH §Pitfall 1).
- StrictMode-safe: cleanup cancels RAF + removes listener; second mount re-arms from scratch.
- DO NOT use `mountedRef` here — pure RAF lifecycle; cleanup handles everything.

---

### `src/reel/GlobeReel.tsx` (NEW — 0-city slow-rotating globe)

**Analog:** `MapCanvas.tsx:47-84` (init) + RESEARCH §Pattern 2 (globe projection) + RESEARCH §Pattern 1 at 10°/s instead of 45°/s.

**Map init with globe** (RESEARCH §Pattern 2 — LANDMINE: `setProjection` AFTER `style.load`):

```typescript
const map = new maplibregl.Map({
  container,
  style: STYLE_URL,
  center: [0, 20],
  zoom: 1,       // D-16: zoom 1
  pitch: 0,      // D-16: pitch 0
  bearing: 0,
  interactive: false,
});

map.on('style.load', () => {
  map.setProjection({ type: 'globe' });
});
```

**LANDMINE:** Calling `setProjection` BEFORE the style fetches resolves throws (RESEARCH §Pitfall 3). Must wait for `style.load` event.

**RAF orbit at 10°/s** — reuse the exact pattern from OrbitReel above, but `const DEGREES_PER_SECOND = 10` (D-16: ~36s per revolution).

**Overlay** (D-16):
- Caption "No trips yet. Check back soon." bottom-anchored via the same layout slot as `ChapterOverlay` (per CONTEXT D-16 phrasing).
- NO empty-state illustration (DESIGN locked risk #3).
- Render `CTAPill` (RESEARCH §Open Q 2).

---

### `src/reel/OrbitReducedMotionReel.tsx` + `src/reel/GlobeReducedMotionReel.tsx` (NEW)

**Analog:** `src/reel/ReducedMotionReel.tsx` (lines 1-99, full file).

**Pattern to follow** (from `ReducedMotionReel.tsx:20-99`):
- No map, no animation, native scroll.
- `<main className="reel-static-root bg-bg text-ink">` root.
- For **OrbitReducedMotionReel**: render a single chapter card (city name, caption, photos as static `<img>`). Reuse `ReducedMotionReel`'s `<li>` body for the single chapter.
- For **GlobeReducedMotionReel**: render the caption "No trips yet. Check back soon." centered, no photos, no chapter list.
- D-15 / D-17: caption fades in normally but no motion otherwise.

**Project-specific patterns to preserve:**
- Same CTAPill footer (`a href="/signup"` link) as `ReducedMotionReel.tsx:89-96`.
- `isPhotoCard()` discriminator (line 58) when rendering photo grid in OrbitReducedMotionReel.

---

### `ops/nginx/timeline.conf` (NEW — NO ANALOG)

**Analog:** none. Project has no existing nginx config in the repo.

**Reference RESEARCH §Pattern 7 directly** (lines 481-528 of 07-RESEARCH.md). Key directives the planner should copy verbatim:

```nginx
proxy_cache_path /var/cache/nginx/public_reel
                 levels=1:2
                 keys_zone=public_reel:10m
                 max_size=1g
                 inactive=24h
                 use_temp_path=off;

upstream timeline_api { server 127.0.0.1:3000; }

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

location ~ ^/u/[^/]+$ {
    try_files $uri /index.html;
}

location /api/ {
    proxy_pass http://timeline_api;
    proxy_set_header Authorization $http_authorization;
    # explicitly no proxy_cache here
}
```

**Project-specific patterns to preserve:**
- File is COMMITTED but NOT executed in Phase 7 (D-19: Phase 8 symlinks). No runtime risk in Phase 7.
- `add_header ... always` is critical (RESEARCH §Pattern 7 Notes — without `always`, omitted on non-2xx).
- App-layer `Cache-Control` from `server/routes/publicReel.ts` must match `proxy_cache_valid` (300/60).

---

### Tests — Server

#### `server/routes/handlesCheck.test.ts` (NEW)

**Analog:** `server/routes/cities.test.ts` lines 1-95 (test harness setup + auth boundary regression).

**Test harness setup pattern** (copy from `cities.test.ts:1-52`):

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
// ... same SignJWT / generateKeyPair setup if JWT-related;
// for /api/handles/check (PUBLIC), the JWT setup can be omitted —
// just instantiate the route directly.
```

**For `handlesCheck.ts` specifically (PUBLIC — no JWT setup needed):**

```typescript
const { handlesCheckHandler } = await import('./handlesCheck.js');

function buildApp(): Hono {
  const app = new Hono();
  app.get('/api/handles/check', handlesCheckHandler);
  return app;
}
```

**Test cases to cover** (RESEARCH §Validation Architecture, Wave 0 Gaps):
- Returns `{ available: true }` for valid + unique candidate.
- Returns `{ available: false, reason: 'too_short' }` for 1-char candidate.
- Returns `{ available: false, reason: 'too_long' }` for 21-char candidate.
- Returns `{ available: false, reason: 'invalid_chars' }` for "Bryan!".
- Returns `{ available: false, reason: 'reserved' }` for "admin".
- Returns `{ available: false, reason: 'taken' }` when DB row exists.
- Response has `Cache-Control: no-store` header (D-04).

---

#### `server/routes/publicReel.test.ts` (NEW)

**Analog:** `server/routes/cities.test.ts` (full structure — DB seed + assert response shape).

**Key adaptation:** No JWT minting; the route is public. Build the app without any `app.use(...requireJwt...)`:

```typescript
function buildApp(): Hono {
  const app = new Hono();
  app.route('/api/public/u', publicReelRouter);
  return app;
}
```

**Test cases to cover** (RESEARCH §Validation Architecture):
- Returns 200 with `{ user, cities, photos }` DTO for existing handle.
- Returns 404 with `{ error: 'not_found' }` for unknown handle.
- Mixed-case URL `/api/public/u/Bryan` returns 200 (case-insensitive lookup — RESEARCH §Pitfall 5).
- `photos[]` filters `status = 'ready'` (pending/failed excluded).
- 200 has `Cache-Control: public, max-age=300, s-maxage=300` (D-08).
- 404 has `Cache-Control: public, max-age=60` (D-08).
- **No-auth regression guard:** call without Authorization header → response is NOT 401 (RESEARCH §Pitfall 6 — explicit regression test).
- Response does NOT include `userId` of OWNER user (`users.id`) or `email`, `auth0Sub`, or photo `masterKey`/`thumbKey` raw (only `masterUrl`/`thumbUrl`).

**Cleanup pattern** (copy from `cities.test.ts:78-81`):

```typescript
async function cleanup(): Promise<void> {
  await db.delete(users).where(inArray(users.auth0Sub, [SUB_A, SUB_B]));
}
```

---

### Tests — Client

#### `src/auth/HandlePickerModal.test.tsx` (NEW — no existing test)

**Analog:** `src/reel/PhotoCycle.test.tsx` lines 1-22 (mock setup pattern) + 41-78 (fake timer + render flow).

**Mock + fake timer pattern** (copy from `PhotoCycle.test.tsx:1-22, 41-78`):

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

// Mock useApi so tests don't need Auth0
vi.mock('@/auth/useApi', () => ({
  useApi: () => (url: string, init?: RequestInit) => fetch(url, init),
}));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });
```

**Test cases to cover:**
- Modal renders with input, URL preview line, Claim button.
- Typing → 300ms debounce → live-check fetch fires (mock `global.fetch`).
- Live-check 'taken' → button stays disabled, muted X icon shown.
- Live-check 'available' → button enabled, amber check icon shown.
- Submit on 'available' → POST `/api/me/handle` → onPicked callback fired with handle.
- `<dialog>` element has `open` attribute after mount (showModal called).
- Esc key event does NOT close the dialog (cancel preventDefault).

---

#### `src/routes/HandleReelRoute.test.tsx` (NEW)

**Analog:** `src/reel/PhotoCycle.test.tsx` for mock+render pattern; no existing route test.

**Mock `usePublicReel` hook** (analog to `PhotoCycle.test.tsx:10-14`):

```typescript
const mockUsePublicReel = vi.fn();
vi.mock('@/api/publicReel', () => ({
  usePublicReel: (handle: string) => mockUsePublicReel(handle),
}));

vi.mock('@/reel/Reel', () => ({ Reel: () => <div data-testid="reel" /> }));
vi.mock('@/reel/OrbitReel', () => ({ OrbitReel: () => <div data-testid="orbit" /> }));
vi.mock('@/reel/GlobeReel', () => ({ GlobeReel: () => <div data-testid="globe" /> }));
```

**Branch tests:**
- `cities.length === 0` → renders globe variant.
- `cities.length === 1` → renders orbit variant.
- `cities.length === 2` → renders standard `Reel`.
- `result.kind === 'not_found'` → renders `NotFoundHandleRoute`.
- `result.kind === 'loading'` → renders loading skeleton.

---

#### `src/reel/OrbitReel.test.tsx` + `GlobeReel.test.tsx` (NEW)

**Analog:** `src/reel/PhotoCycle.test.tsx:118-145` (setInterval spy + fake timer pattern). For RAF, use `vi.spyOn(window, 'requestAnimationFrame')` instead of `setInterval`.

**RAF + visibility mock pattern:**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock maplibre-gl so the test doesn't need WebGL
const mockSetBearing = vi.fn();
const mockGetBearing = vi.fn(() => 0);
const mockOn = vi.fn();
const mockRemove = vi.fn();
vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(() => ({
      setBearing: mockSetBearing,
      getBearing: mockGetBearing,
      on: mockOn,
      remove: mockRemove,
    })),
  },
}));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });
```

**Test cases (OrbitReel):**
- After mount, RAF is scheduled (`requestAnimationFrame` called).
- `setBearing` advances by `(45 * dt) / 1000` per RAF tick.
- `visibilitychange` with `document.hidden = true` → next RAF does NOT advance bearing.
- Unmount cancels RAF and removes listener.
- StrictMode double-mount → no leak, bearing rate stays 45°/s (RESEARCH §Pitfall 1).

**Test cases (GlobeReel):**
- After mount, `setProjection({ type: 'globe' })` is called inside the `style.load` callback, NOT synchronously (RESEARCH §Pitfall 3).
- RAF advances bearing at 10°/s rate.

---

## Shared Patterns

### Auth boundary (server)

**Source:** `server/index.ts:23-49`
**Apply to:** `server/index.ts` modifications

```typescript
// Public routes — register BEFORE any app.use(..., requireJwt, ...)
app.get('/health', ...);
app.get('/api/health', ...);
app.get('/api/handles/check', handlesCheckHandler);   // NEW
app.route('/api/public/u', publicReelRouter);          // NEW

// Authenticated — per-prefix middleware (DO NOT collapse to /api/*)
app.use('/api/me', requireJwt, lazyProvisionUser);
app.use('/api/me/*', requireJwt, lazyProvisionUser);
// ... etc
```

### Drizzle error unwrapping

**Source:** `server/db/pgError.ts` (referenced from `me.ts:5`, `cities.ts:5`)
**Apply to:** any new route doing INSERT/UPDATE. Phase 7's new routes are READ-ONLY, so `pgErrorCode` is NOT used in `handlesCheck.ts` or `publicReel.ts`. Pattern documented for completeness:

```typescript
import { pgErrorCode } from '../db/pgError.js';

try {
  await db.update(...).returning();
} catch (err) {
  // err.code is undefined under DrizzleQueryError wrapping;
  // pgErrorCode unwraps err.cause.code → '23505' etc.
  if (pgErrorCode(err) === '23505') return c.json({ error: 'taken' }, 409);
  throw err;
}
```

### reqIdRef stale-response guard (client)

**Source:** `src/api/cities.ts:29-52`, `src/hooks/useAllPhotos.ts:25-56`
**Apply to:** `src/api/handlesCheck.ts`, `src/api/publicReel.ts`

```typescript
const reqIdRef = useRef(0);

useEffect(() => () => { reqIdRef.current = -1; }, []);

const myId = ++reqIdRef.current;
// ... after await
if (myId !== reqIdRef.current) return;  // newer request in flight or unmounted
```

**Why NOT `mountedRef`** (project memory `feedback_mountedref_strictmode.md`):
- `useRef(true)` + cleanup-only effect leaves the ref stuck at `false` after StrictMode's double-mount.
- The `reqIdRef` sentinel pattern is the project's invariant — increment on each request, set to `-1` on unmount. Slow responses with stale `myId` are dropped.

### `prefers-reduced-motion` branching (client)

**Source:** `src/routes/AppReelRoute.tsx:25, 95-101`, `src/reel/MapCanvas.tsx:95-104`
**Apply to:** `HandleReelRoute.tsx`, `OrbitReel.tsx`, `GlobeReel.tsx`

```typescript
const reduced = usePrefersReducedMotion();
return reduced ? <ReducedMotionVariant /> : <MotionVariant />;
```

### Validation source of truth

**Source:** `server/handles/validate.ts:25-32` — `validateHandle()` discriminated union
**Apply to:**
- `server/routes/handlesCheck.ts` (server-side check)
- `src/auth/HandlePickerModal.tsx` (client-side pre-check via `@server/handles/validate.js` import — already done; line 2 of current modal)
- `server/routes/me.ts` (claim path — already done; line 41)

Three callers, one implementation. Same `reason` strings flow back to UI.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `ops/nginx/timeline.conf` | ops config | n/a | No existing nginx config in repo; use RESEARCH §Pattern 7 directives directly. |

---

## Metadata

**Analog search scope:** `server/routes/`, `server/handles/`, `server/index.ts`, `src/api/`, `src/auth/`, `src/routes/`, `src/reel/`, `src/hooks/`

**Files scanned:**
- `server/index.ts`, `server/routes/me.ts`, `server/routes/cities.ts`, `server/routes/cities.test.ts`, `server/handles/validate.ts`
- `src/api/cities.ts`, `src/auth/HandlePickerModal.tsx`, `src/auth/HandlePickerGate.tsx`, `src/hooks/useAllPhotos.ts`
- `src/routes/HandleReelRoute.tsx`, `src/routes/AppReelRoute.tsx`, `src/routes/NotFoundRoute.tsx`
- `src/reel/Reel.tsx`, `src/reel/MapCanvas.tsx`, `src/reel/ReducedMotionReel.tsx`, `src/reel/PhotoCycle.test.tsx`

**Pattern extraction date:** 2026-05-14

## PATTERN MAPPING COMPLETE
