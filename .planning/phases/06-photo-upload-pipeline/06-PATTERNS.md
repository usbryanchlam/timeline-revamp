# Phase 6: Photo Upload Pipeline — Pattern Map

**Mapped:** 2026-05-12
**Files analyzed:** 13 new/modified files across 4 plans
**Analogs found:** 12 / 13 (1 file has no direct codebase analog)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/routes/photos.ts` | route | write-side + read-side | `server/routes/cities.ts` | exact |
| `server/validation/photoInput.ts` | utility | pure | `server/validation/cityInput.ts` | exact |
| `server/db/schema.ts` (photos table delta) | config | write-side | `server/db/schema.ts` (cities table, lines 53–70) | exact |
| `server/oci/parClient.ts` | service | request-response | `server/db/pgError.ts` (singleton utility shape) | partial |
| `server/routes/photos.test.ts` | test | orchestration | `server/routes/cities.test.ts` | exact |
| `src/photos/heicToJpeg.ts` | utility | pure | `src/components/MapPicker.tsx` (dynamic import pattern, lines 100–153) | role-match |
| `src/photos/canvasResize.ts` | utility | pure | `src/components/MapPicker.tsx` (async IIFE + cancelled flag, lines 100–153) | partial |
| `src/photos/uploadQueue.ts` | utility | event-driven | (no analog — XHR + p-limit semaphore, new pattern) | none |
| `src/hooks/usePhotosQuery.ts` | hook | read-side | `src/api/cities.ts` (`useCitiesQuery` function, lines 21–60) | exact |
| `src/components/PhotoDetailSheet.tsx` | component | request-response | `src/components/CityForm.tsx` | exact |
| `src/reel/chaptersWithPhotos.ts` | utility | pure | `src/reel/groupChapters.ts` (`groupsToChapters`, lines 72–74) | exact |
| `src/reel/chaptersWithPhotos.test.ts` | test | pure | `src/reel/groupChapters.test.ts` | exact |
| `src/types/reel.ts` (PhotoCard addition) | config | pure | `src/reel/groupChapters.ts` (`ChapterGroup` interface, lines 5–9) | role-match |

---

## Pattern Assignments

### `server/routes/photos.ts` (route, write-side + read-side)

**Analog:** `server/routes/cities.ts`

**Imports pattern** (lines 1–7):
```typescript
import { Hono } from 'hono';
import { and, eq, sql, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { photos, cities } from '../db/schema.js';
import { pgErrorCode } from '../db/pgError.js';
import { uploadUrlSchema, finalizeSchema } from '../validation/photoInput.js';
import { createPar, fetchMasterBuffer, putThumb } from '../oci/parClient.js';
```

**Router declaration + authorization model comment** (lines 14–16 in analog):
```typescript
// /api/photos sub-router. Mounted in server/index.ts behind the
// requireJwt + lazyProvisionUser middleware chain, so c.var.user is
// always populated here.
export const photosRouter = new Hono();
```

**Route registration order rule** (lines 112–114 in analog — CRITICAL):
```typescript
// ORDERING: literal paths BEFORE parameterized paths.
// POST /upload-url MUST come before POST /:id/finalize BEFORE DELETE /:id.
// Hono matches routes in registration order — "upload-url" would be
// captured as :id = "upload-url" if parameterized route is first.
photosRouter.post('/upload-url', ...);      // literal first
photosRouter.post('/:id/finalize', ...);    // param second
photosRouter.delete('/:id', ...);           // param third
```

**Auth/ownership scope** (lines 43–59 in analog):
```typescript
// Authorization: every query scopes to c.var.user.id. A photo owned by
// another user reads as "not found" — no cross-user existence leak.
const me = c.var.user;
const [row] = await db.select().from(photos)
  .where(and(eq(photos.id, id), eq(photos.userId, me.id)))
  .limit(1);
if (!row) return c.json({ error: 'not_found' }, 404);
```

**JSON body parse + Zod safeParse pattern** (lines 74–78 in analog):
```typescript
const raw = await c.req.json().catch(() => null);
const parsed = uploadUrlSchema.safeParse(raw);
if (!parsed.success) {
  return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 422);
}
```

**Transaction + pgErrorCode error handling** (lines 81–109 in analog):
```typescript
try {
  const inserted = await db.transaction(async (tx) => {
    // ... queries using tx ...
  });
  return c.json(inserted, 201);
} catch (err) {
  if (pgErrorCode(err) === '23505') return c.json({ error: 'conflict_retry' }, 409);
  throw err;   // real DB failures bubble to Hono's global 500 handler
}
```

**22P02 UUID malformed collapse pattern** (lines 52–59 in analog):
```typescript
} catch (err) {
  if (pgErrorCode(err) === '22P02') return c.json({ error: 'not_found' }, 404);
  throw err;
}
```

**DELETE with 204 + empty body** (lines 224–238 in analog):
```typescript
const result = await db.delete(photos)
  .where(and(eq(photos.id, id), eq(photos.userId, me.id)))
  .returning({ id: photos.id });
if (result.length === 0) return c.json({ error: 'not_found' }, 404);
c.status(204);
return c.body(null);
```

**Photo-specific: count guard for 10-photo limit** (photo route only):
```typescript
// Pre-flight ownership + limit check (outside transaction — cheap path)
const [cityRow] = await db.select({ userId: cities.userId })
  .from(cities)
  .where(and(eq(cities.id, parsed.data.cityId), eq(cities.userId, me.id)))
  .limit(1);
if (!cityRow) return c.json({ error: 'not_found' }, 404);

const [countRow] = await db.select({ n: count() }).from(photos)
  .where(and(eq(photos.cityId, parsed.data.cityId), sql`${photos.status} != 'failed'`));
if ((countRow?.n ?? 0) >= 10) return c.json({ error: 'photo_limit_reached' }, 422);
```

---

### `server/validation/photoInput.ts` (utility, pure)

**Analog:** `server/validation/cityInput.ts`

**File header + convention comment** (lines 1–10 in analog):
```typescript
import { z } from 'zod';

// Zod schemas for /api/photos request bodies. Both schemas use .strict()
// to reject unknown keys — this enforces server-authoritative fields
// (id, userId, status, orderIndex, createdAt, updatedAt, masterKey, thumbKey)
// are absent from any client-supplied body.
```

**Schema with .strict() + allowed contentType enum** (mirrors createCitySchema, lines 11–23):
```typescript
export const uploadUrlSchema = z.object({
  cityId: z.string().uuid(),
  contentType: z.enum(['image/jpeg', 'image/png']),
  sizeBytes: z.number().int().gte(1).lte(5_242_880),
}).strict();

export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
```

**superRefine pattern for cross-field validation** (lines 46–68 in analog — use for finalize body):
```typescript
export const finalizeSchema = z.object({
  photoId: z.string().uuid(),
}).strict();

export type FinalizeInput = z.infer<typeof finalizeSchema>;
```

**Key rule from analog:** server-controlled fields (`status`, `masterKey`, `thumbKey`, `orderIndex`, `userId`, `createdAt`, `updatedAt`) are absent by construction — `.strict()` rejects any attempt to send them.

---

### `server/db/schema.ts` — photos table delta

**Analog:** `server/db/schema.ts`, cities table (lines 53–70) and pgTable import block (lines 19–28)

**Import block to mirror** (lines 19–28 in analog):
```typescript
import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
} from 'drizzle-orm/pg-core';
```

**Table definition style** (lines 53–70 in analog — cities as model):
```typescript
// ─── photos (updated Phase 6) ─────────────────────────────────────────
// FK cascade on city_id: deleting a city cascades to its photos.
// userId is denormalized for query simplicity (avoids join on every
// upload-url ownership check). Both FKs are enforced separately.
// status lifecycle: pending → ready (finalize success) | failed (finalize error)
export const photos = pgTable('photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  cityId: uuid('city_id')
    .notNull()
    .references(() => cities.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'ready', 'failed'] as const })
    .notNull()
    .default('pending'),
  masterKey: text('master_key').notNull(),
  thumbKey: text('thumb_key'),
  caption: text('caption'),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Type export pattern** (lines 110–114 in analog):
```typescript
export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
```

**DATA-02 OWNERSHIP NOTICE:** Do NOT declare a `uniqueIndex` for `(city_id, order_index)` in schema.ts if a deferrable constraint is needed — use a hand-authored migration instead. See top-of-file comment in `server/db/schema.ts` lines 1–17.

---

### `server/oci/parClient.ts` (service, request-response)

**Analog:** `server/db/pgError.ts` (singleton utility shape, lines 1–18)

No direct codebase analog for OCI client wrapper. Use `pgError.ts` as the shape template for a singleton exported utility, plus RESEARCH.md patterns for the OCI SDK specifics.

**Shape to follow from `server/db/pgError.ts`** (lines 1–18):
```typescript
// Single exported function, no class, no state leakage.
// Export what callers need; keep implementation details private.
export function pgErrorCode(err: unknown): string | undefined {
  // ...
}
```

**OCI singleton initialization pattern** (from RESEARCH.md — no codebase analog):
```typescript
// server/oci/parClient.ts
import objectStorage from 'oci-objectstorage';
import common from 'oci-common';
import { env } from '../env.js';

// Singleton — constructed once at module load, reused across requests.
const provider = new common.SimpleAuthenticationDetailsProvider(
  env.OCI_TENANCY_OCID,
  env.OCI_USER_OCID,
  env.OCI_FINGERPRINT,
  env.OCI_PRIVATE_KEY,  // PEM string; alt: fs.readFileSync(env.OCI_PRIVATE_KEY_PATH)
  null,
  common.Region.fromRegionId(env.OCI_REGION),
);

const client = new objectStorage.ObjectStorageClient({
  authenticationDetailsProvider: provider,
});
```

---

### `server/routes/photos.test.ts` (test, orchestration)

**Analog:** `server/routes/cities.test.ts`

**Full bootstrap pattern** (lines 1–73 in analog — entire top of file):
```typescript
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  type CryptoKey,
  type JWK,
} from 'jose';

// MUST set env BEFORE dynamic imports. server/env.ts validates synchronously.
process.env.AUTH0_DOMAIN = 'test.auth0.com';
process.env.AUTH0_AUDIENCE = 'https://api.test.example';

const { requireJwt, __setJwksGetterForTest } = await import('../auth/jwt.js');
const { lazyProvisionUser } = await import('../auth/lazyProvision.js');
const { photosRouter } = await import('./photos.js');
const { db } = await import('../db/client.js');
const { photos, cities, users } = await import('../db/schema.js');
await import('../auth/context.js');
```

**Key generation + JWKS injection** (lines 43–52 in analog):
```typescript
beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  signKey = privateKey;
  const jwk: JWK = await exportJWK(publicKey);
  jwk.kid = KID;
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const localGetter = createLocalJWKSet({ keys: [jwk] });
  __setJwksGetterForTest(localGetter as never);
});
```

**JWT mint helper** (lines 54–63 in analog):
```typescript
async function mint(opts: { sub: string; email: string }): Promise<string> {
  return await new SignJWT({ email: opts.email })
    .setProtectedHeader({ alg: 'RS256', kid: KID, typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(opts.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(signKey);
}
```

**buildApp() helper** (lines 65–74 in analog):
```typescript
function buildApp(): Hono {
  const app = new Hono();
  app.use('/api/photos', requireJwt, lazyProvisionUser);
  app.use('/api/photos/*', requireJwt, lazyProvisionUser);
  app.route('/api/photos', photosRouter);
  return app;
}
```

**cleanup helper + beforeEach/afterEach** (lines 76–91 in analog):
```typescript
async function cleanup(): Promise<void> {
  // FK CASCADE: deleting users cascades to cities which cascades to photos.
  await db.delete(users).where(inArray(users.auth0Sub, [SUB_A, SUB_B]));
}

beforeEach(async () => { await cleanup(); });
afterEach(async () => { await cleanup(); });
```

**OCI mock injection:** photos.test.ts adds a module-level OCI mock setter that cities.test.ts does not need:
```typescript
// At module level in server/routes/photos.ts (export for test injection):
let ociClientOverride: OciClientInterface | null = null;
export function __setOciClientForTest(mock: OciClientInterface) {
  ociClientOverride = mock;
}
// Inside handlers: const ociClient = ociClientOverride ?? defaultOciClient;
```

---

### `src/photos/heicToJpeg.ts` (utility, pure)

**Analog:** `src/components/MapPicker.tsx`, dynamic import pattern (lines 100–153)

**Dynamic import with `cancelled` flag + module cache** (lines 104–112 in analog):
```typescript
// MapPicker analog:
let cancelled = false;
void (async () => {
  const maplibregl = (await import('maplibre-gl')).default as unknown as MaplibreModule;
  if (cancelled || !containerRef.current) return;
  maplibreGlRef.current = maplibregl;  // cache — avoids re-import
  // ...
})();
return () => { cancelled = true; /* ... */ };
```

**heicToJpeg pattern to copy from this shape:**
```typescript
// src/photos/heicToJpeg.ts
// Module-level cache — WASM loads once, reused for subsequent conversions.
let heicToModule: typeof import('heic-to') | null = null;

async function loadHeicTo() {
  if (!heicToModule) {
    heicToModule = await import('heic-to');
  }
  return heicToModule;
}

export async function convertHeicToJpeg(file: File): Promise<Blob> {
  const { heicTo } = await loadHeicTo();
  return heicTo({ blob: file, type: 'image/jpeg', quality: 0.88 });
}

export async function detectIsHeic(file: File): Promise<boolean> {
  const ext = file.name.toLowerCase();
  if (ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png')) return false;
  if (file.type === 'image/heic' || file.type === 'image/heif') return true;
  if (ext.endsWith('.heic') || ext.endsWith('.heif')) return true;
  const { isHeic } = await loadHeicTo();
  return isHeic(file);
}
```

**CSS landmine note:** `heic-to` has no CSS — no lazy-CSS race condition (unlike maplibre-gl which requires CSS hoisted to main entry per `feedback_lazy_chunk_css.md`). Safe to dynamic-import without moving CSS.

---

### `src/photos/canvasResize.ts` (utility, pure)

**Analog:** `src/components/MapPicker.tsx` (async IIFE + object-URL cleanup pattern, lines 107–113)

**Object-URL create + revoke pattern** (lines 109 in analog — `URL.createObjectURL` is browser API, not in MapPicker, but the cleanup discipline is):
```typescript
// MapPicker uses cancelled flag to guard against stale async results.
// canvasResize.ts borrows the same "create resource, use, revoke" discipline:
const url = URL.createObjectURL(blob);
const img = await loadImage(url);
URL.revokeObjectURL(url);   // always revoke — memory leak otherwise
```

**Canvas encode + Promise wrapper** (no direct codebase analog — from RESEARCH.md):
```typescript
return new Promise<Blob>((resolve, reject) => {
  canvas.toBlob(
    (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))),
    'image/jpeg',
    JPEG_QUALITY,
  );
});
```

---

### `src/photos/uploadQueue.ts` (utility, event-driven)

**No direct codebase analog.** This is the only Phase 6 file with no existing pattern in the codebase. Use RESEARCH.md patterns exclusively.

Key patterns from RESEARCH.md:
- XHR upload with progress: lines 717–737 in RESEARCH.md
- p-limit concurrency: lines 742–749 in RESEARCH.md
- Per-file state machine: `Queued → Converting → Uploading → Done | Failed`

**Design note from RESEARCH.md:** `fetch()` has no upload progress API in any browser as of 2026. XHR is mandatory for per-file progress bars.

---

### `src/hooks/usePhotosQuery.ts` (hook, read-side)

**Analog:** `src/api/cities.ts` — `useCitiesQuery` function (lines 21–60)

**Full hook shape** (lines 21–60 in analog):
```typescript
export function usePhotosQuery(cityId: string): {
  readonly data: readonly PhotoCard[] | undefined;
  readonly error: Error | null;
  readonly refetch: () => Promise<void>;
} {
  const api = useApi();
  const [data, setData] = useState<readonly PhotoCard[] | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const reqIdRef = useRef(0);

  // Unmount guard: set reqIdRef to sentinel -1 on unmount so any in-flight
  // request check (myId !== reqIdRef.current) always fails after teardown.
  useEffect(() => {
    return () => { reqIdRef.current = -1; };
  }, []);

  const refetch = useCallback(async () => {
    const myId = ++reqIdRef.current;
    try {
      const res = await api(`/api/cities/${cityId}/photos`);
      if (myId !== reqIdRef.current) return;  // stale-response guard
      if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
      const json = (await res.json()) as readonly PhotoCard[];
      if (myId !== reqIdRef.current) return;
      setData(json);
      setError(null);
    } catch (e) {
      if (myId !== reqIdRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [api, cityId]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { data, error, refetch };
}
```

**`fetchPhotos` escape hatch** (lines 68–76 in analog — same pattern for non-hook call sites):
```typescript
export async function fetchPhotos(
  api: ReturnType<typeof useApi>,
  cityId: string,
): Promise<readonly PhotoCard[]> {
  const res = await api(`/api/cities/${cityId}/photos`);
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
  return (await res.json()) as readonly PhotoCard[];
}
```

---

### `src/components/PhotoDetailSheet.tsx` (component, request-response)

**Analog:** `src/components/CityForm.tsx`

**Discriminated props union** (lines 31–48 in analog):
```typescript
// CityForm analog — PhotoDetailSheet uses same discriminated-union pattern:
type PhotoDetailSheetProps =
  | {
      readonly mode: 'view';
      readonly city: CityDTO;
      readonly photos: readonly PhotoCard[];
      readonly onClose: () => void;
      readonly onAddPhotos: () => void;
    }
  | {
      readonly mode: 'upload';
      readonly city: CityDTO;
      readonly onClose: () => void;
      readonly onUploaded: (photos: readonly PhotoCard[]) => void;
    };
```

**mountedRef StrictMode-safe pattern** (lines 106–116 in analog — CRITICAL):
```typescript
const mountedRef = useRef(true);
useEffect(() => {
  // Re-anchor to true on EVERY mount. Without this, StrictMode's
  // double-invoke leaves mountedRef.current=false after the first cleanup,
  // and the live second mount's post-await branches never fire (buttons
  // stuck in loading state in dev).
  mountedRef.current = true;
  return () => { mountedRef.current = false; };
}, []);
```

**Initial focus + Escape-to-close** (lines 119–133 in analog):
```typescript
const closeButtonRef = useRef<HTMLButtonElement>(null);
useEffect(() => { closeButtonRef.current?.focus(); }, []);

const onClose = props.onClose;
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !uploading) onClose();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [uploading, onClose]);
```

**Backdrop + stop-propagation** (lines 248–255 in analog):
```typescript
function handleBackdropClick() {
  if (uploading) return;
  props.onClose();
}
function stopPropagation(e: MouseEvent) { e.stopPropagation(); }
```

**Bottom-sheet mobile / centered modal desktop layout** (lines 270–286 in analog):
```typescript
<div
  className="fixed inset-0 z-50 bg-black/40"
  onClick={handleBackdropClick}
  role="presentation"
>
  <div
    onClick={stopPropagation}
    role="dialog"
    aria-modal="true"
    aria-label="City photos"
    className="
      fixed inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto
      rounded-t-3xl bg-bg-elev border border-line p-6 space-y-4
      md:inset-0 md:max-w-md md:mx-auto md:my-auto md:rounded-3xl md:max-h-[80vh]
    "
  >
```

**DESIGN.md tokens for PhotoDetailSheet:**
- Sheet border-radius: `rounded-t-3xl` (24px top corners only) — `border-radius: 24px 24px 0 0`
- Photo thumbnail border-radius: `rounded-xl` (12px) per DESIGN.md layout table
- Amber CTA button: `bg-amber-500 text-black font-semibold py-2 rounded-lg`
- Focus ring: `focus:ring-2 focus:ring-[--color-focus-ring]` (rgba(255,212,112,0.25), 3px)
- Error text: `text-amber-500` (matches CityForm line 356)
- Microcopy rule: "Upload failed. Tap to retry." not "Oops! Something went wrong."

**Error handling shape** (lines 191–208 in analog):
```typescript
// Mount-guard after network round-trip — if user closed the sheet mid-upload,
// drop the result instead of mutating state or notifying parent.
if (!mountedRef.current) return;

if (res.status === 422) {
  const body = await readErrorBody(res);
  if (!mountedRef.current) return;
  setError(body?.issues?.[0]?.message ?? NETWORK_ERROR);
  return;
}
if (!res.ok) { setError(NETWORK_ERROR); return; }
```

---

### `src/reel/chaptersWithPhotos.ts` (utility, pure)

**Analog:** `src/reel/groupChapters.ts`, `groupsToChapters` function (lines 72–74)

**Function signature shape** (lines 72–74 in analog):
```typescript
// groupsToChapters analog:
export function groupsToChapters(groups: readonly ChapterGroup[]): readonly CityChapter[] {
  return citiesToChapters(groups.map((g) => g.members[0]!));
}
```

**chaptersWithPhotos extension:**
```typescript
// src/reel/chaptersWithPhotos.ts
import { cityToChapter } from '@/data/cityToChapter';
import type { ChapterGroup } from '@/reel/groupChapters';
import type { CityChapter } from '@/types/reel';
import type { PhotoCard } from '@/types/reel';

export function chaptersWithPhotos(
  groups: readonly ChapterGroup[],
  photosByCityId: ReadonlyMap<string, readonly PhotoCard[]>,
): readonly CityChapter[] {
  return groups.map((g) => {
    const base = cityToChapter(g.members[0]!);
    // Aggregate photos across all members of a collapsed group.
    // Immutable: flatMap returns new array; no mutation of base or g.
    const photos = g.members.flatMap(
      (m) => photosByCityId.get(m.id) ?? [],
    );
    return { ...base, photos };   // immutable spread — NEVER mutate base
  });
}
```

**Immutability rule from CLAUDE.md:** always `{ ...base, photos }` spread — never `base.photos = photos`.

---

### `src/reel/chaptersWithPhotos.test.ts` (test, pure)

**Analog:** `src/reel/groupChapters.test.ts`

**Test file shape** (lines 1–22 in analog):
```typescript
import { chaptersWithPhotos } from '@/reel/chaptersWithPhotos';
import type { ChapterGroup } from '@/reel/groupChapters';
import type { PhotoCard } from '@/types/reel';

function makeGroup(id: string, memberIds: string[]): ChapterGroup {
  return {
    id,
    center: [0, 0],
    members: memberIds.map((mid) => ({
      id: mid,
      userId: 'user-1',
      orderIndex: 0,
      name: mid,
      tripLabel: null,
      lat: 0, lng: 0, zoom: 10, pitch: 45, bearing: 0,
      arrivedAt: '2026-01-01T00:00:00.000Z',
      caption: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  };
}

function makePhoto(id: string): PhotoCard {
  return { id, thumbUrl: `https://cdn/thumb/${id}.jpg`, masterUrl: `https://cdn/master/${id}.jpg`, alt: '' };
}
```

**describe/it style** (lines 23–119 in analog — groupChapters.test.ts):
```typescript
describe('chaptersWithPhotos', () => {
  it('returns empty array for empty groups input', () => { ... });
  it('injects photos for single group from photosByCityId', () => { ... });
  it('aggregates photos across multi-member collapsed group', () => { ... });
  it('uses empty array when cityId not found in photosByCityId', () => { ... });
  it('does not mutate the base chapter returned by cityToChapter', () => { ... });
});
```

---

## Shared Patterns

### Authentication guard (applied to all `server/routes/photos.ts` handlers)

**Source:** `server/routes/cities.ts` authorization model comment + `c.var.user` usage (lines 8–15)
**Apply to:** All photo route handlers

```typescript
// Every handler starts with:
const me = c.var.user;  // populated by requireJwt + lazyProvisionUser middleware
// Every query ends with:
.where(and(eq(photos.userId, me.id), ...))  // never query without the user scope
```

### pgErrorCode error handling (applied to all DB catch blocks)

**Source:** `server/db/pgError.ts` (lines 1–18), used throughout `server/routes/cities.ts`
**Apply to:** All catch blocks in `server/routes/photos.ts`

```typescript
import { pgErrorCode } from '../db/pgError.js';

} catch (err) {
  if (pgErrorCode(err) === '22P02') return c.json({ error: 'not_found' }, 404);
  if (pgErrorCode(err) === '23505') return c.json({ error: 'conflict_retry' }, 409);
  throw err;  // real failures bubble to Hono global 500 handler
}
```

**Critical:** `err.code` is undefined for Drizzle errors — `pgErrorCode` unwraps `err.cause.code`. Direct `err.code === '23505'` check will always miss. See `feedback_drizzle_pg_error_wrapping.md`.

### StrictMode-safe mountedRef (applied to all stateful React components with async ops)

**Source:** `src/components/CityForm.tsx` (lines 106–116)
**Apply to:** `PhotoDetailSheet.tsx` and any component that sets state after `await`

```typescript
const mountedRef = useRef(true);
useEffect(() => {
  mountedRef.current = true;          // re-anchor on EVERY mount (not just initial)
  return () => { mountedRef.current = false; };
}, []);
// After every await: if (!mountedRef.current) return;
```

### reqIdRef stale-response guard (applied to all data-fetching hooks)

**Source:** `src/api/cities.ts`, `useCitiesQuery` (lines 29–53)
**Apply to:** `usePhotosQuery.ts`

```typescript
const reqIdRef = useRef(0);
useEffect(() => {
  return () => { reqIdRef.current = -1; };  // sentinel on unmount
}, []);
// Inside refetch:
const myId = ++reqIdRef.current;
// After every await: if (myId !== reqIdRef.current) return;
```

### Immutable updates (applied to all files)

**Source:** CLAUDE.md coding style rules
**Apply to:** All Phase 6 files

```typescript
// WRONG: mutation
base.photos = photos;

// CORRECT: spread
return { ...base, photos };
```

### DESIGN.md amber accent (applied to all UI components)

**Source:** `DESIGN.md` color tokens + `src/components/CityForm.tsx` (line 364)
**Apply to:** `PhotoDetailSheet.tsx`, upload queue card states

```typescript
// CTA button
className="bg-amber-500 text-black font-semibold py-2 rounded-lg disabled:opacity-50"
// Error text
className="text-amber-500"  // amber for errors, NOT red
// Success
className="text-[--success-500]"  // #4ADE80 for "photo uploaded"
// Focus ring: --color-focus-ring = rgba(255,212,112,0.25)
```

### prefers-reduced-motion clamp (applied to all animated components)

**Source:** `DESIGN.md` motion section + accessibility section
**Apply to:** photo cycling in `ChapterOverlay`, crossfade in `PhotoDetailSheet`

```typescript
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Crossfade duration: reducedMotion ? 0 : 200  (ms)
// Cycling interval: 2500ms regardless; only crossfade is clamped
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/photos/uploadQueue.ts` | utility | event-driven | No XHR + semaphore upload queue exists in the codebase. No p-limit usage exists. Use RESEARCH.md patterns exclusively (lines 717–749). |

---

## Key Pitfalls (from RESEARCH.md — copy into each plan's risk section)

| # | Pitfall | Affected Files | Mitigation |
|---|---|---|---|
| P1 | Hono route ordering: literal before parameterized | `server/routes/photos.ts` | Register `/upload-url` before `/:id/finalize` before `/:id` |
| P2 | DrizzleQueryError wraps pg error codes | `server/routes/photos.ts` all catch blocks | Use `pgErrorCode(err)` — never `err.code` directly |
| P3 | StrictMode mountedRef stuck at false | `PhotoDetailSheet.tsx`, any async component | Re-anchor `mountedRef.current = true` inside `useEffect` body |
| P4 | OCI `accessUri` is one-time only | `server/routes/photos.ts` upload-url handler | Return full URL to client immediately; do not store PAR URL in DB |
| P5 | `fetch()` has no upload progress API | `src/photos/uploadQueue.ts` | Use `XMLHttpRequest.upload.onprogress` — not fetch |
| P6 | `p-limit` v7+ is ESM-only | `src/photos/uploadQueue.ts` | Use `import pLimit from 'p-limit'` — never `require()` |
| P7 | sharp on Alpine Docker (Phase 8) | Dockerfile | Use `node:20-slim` base or `npm install sharp` in Docker context |
| P8 | EXIF orientation on canvas.drawImage | `src/photos/canvasResize.ts` | iOS 17+ / Chrome 109+ auto-apply; test on real portrait JPEG |

---

## Metadata

**Analog search scope:** `server/routes/`, `server/validation/`, `server/db/`, `src/components/`, `src/api/`, `src/hooks/`, `src/reel/`
**Files read:** 12 (cities.ts, cities.test.ts, cityInput.ts, schema.ts, pgError.ts, CityForm.tsx, MapPicker.tsx, useCitiesQuery.ts / cities.ts hook, groupChapters.ts, groupChapters.test.ts, CONTEXT.md, RESEARCH.md)
**Pattern extraction date:** 2026-05-12
