# Phase 6: Photo Upload Pipeline — Research

**Researched:** 2026-05-12
**Domain:** Client-side image processing (HEIC, canvas resize, EXIF) + OCI Object Storage PARs + server-side thumbnail generation (sharp + Bun) + upload queue UX + photo detail sheet + reel photo cycling
**Confidence:** HIGH (stack + patterns), MEDIUM (OCI CORS exact steps), MEDIUM (sharp+Bun install nuance)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **HEIC conversion library:** `heic-to` (WASM, ~600KB, lazy-loaded behind `/app/`). Wrapper module `src/photos/heicToJpeg.ts`. Detection: `file.type === 'image/heic'` || `file.type === 'image/heif'` || extension `.heic`/`.heif` (Safari may report `application/octet-stream`). Non-HEIC files skip conversion.

2. **Thumbnails:** Server-side via `sharp` on Hono+Bun. Endpoint `POST /api/photos/:id/finalize` reads master from OCI, runs `sharp(buffer).resize(400, 400, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()`, PUTs thumb to thumb key. Both keys under public-read prefix.

3. **PAR scope:** Per-upload, short-lived (5 min), exact object key (not folder-scope). `POST /api/photos/upload-url` validates ownership + limits, creates `photos` row (status `pending`), mints write-scoped PAR, returns `{ photoId, uploadUrl }`. Client PUTs master, then calls `/finalize`. Orphan cleanup deferred.

4. **Upload UX:** Multi-select, parallel uploads (concurrency 3), per-file progress, retry-on-fail. States: Queued → Converting → Uploading X% → Done / Failed (retry). Aggregate count header. Add-photos button disabled if `current + selected > 10`.

5. **Plan structure:** 4 plans — 06-01 (client pipeline), 06-02 (server PAR + sharp), 06-03 (detail sheet UI), 06-04 (REEL-09 photo cycling).

### Claude's Discretion
(None specified — all gray areas resolved in discussion.)

### Deferred Ideas (OUT OF SCOPE)
- Photo reorder UI
- Stale pending sweeper cron
- Photo captions on reel overlay
- Live Photo motion track playback
- Photo metadata edit (EXIF re-attach)
- Bulk delete UI
- Photo dedup on upload
- Image format negotiation (AVIF/WebP)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-05 | Photo upload pipeline: HEIC detect + convert to JPEG, client-side resize to 2048px max, EXIF strip, OCI PAR upload, thumbnail generation | heic-to API + canvas resize pattern + sharp thumbnail + OCI PAR creation |
| DATA-06 | Photo limits: 10 per city, 5 MB per photo, single combined .heic/.jpg/.png accepted | Zod schema enforcement + server-side validation pattern + client pre-check |
| DATA-07 | Photos served from public-read OCI bucket prefix (single PAR for thumbnails) | OCI PAR AccessType research + bucket structure |
</phase_requirements>

---

## Summary

Phase 6 delivers the full photo upload pipeline in four plans. The client pipeline (06-01) uses `heic-to` 1.4.2 (WASM, lazy-loaded via dynamic import) for HEIC→JPEG conversion, then a canvas-based 2048px resize that respects EXIF orientation before stripping all metadata. Upload progress requires XHR (not fetch — fetch has no upload progress API). Concurrency is capped at 3 using `p-limit`. The server pipeline (06-02) uses `sharp` 0.34.5 to generate 400px thumbnails after the master upload, with OCI Object Storage PARs (AccessType: `ObjectWrite`, exact key, 5-minute TTL) for the upload URLs. Sharp officially supports Bun through Node-API v9 as of v0.33.0; `bun add sharp` works on Linux/macOS but may have install-script edge cases in Alpine/Docker environments — document for Phase 8. The photo detail sheet (06-03) follows the CityForm pattern exactly: bottom sheet mobile / centered modal desktop, `mountedRef` StrictMode-safe, discriminated props. Photo cycling (06-04) extends `groupsToChapters` into a new `chaptersWithPhotos` helper that adds real photo URLs to the `CityChapter.photos` array (replacing `PhotoSeed` gradient placeholders).

**Primary recommendation:** Build in plan order — 06-01 (pure client code, testable offline), 06-02 (server + OCI, needs credentials), 06-03 (UI, depends on 06-02 for real photo URLs), 06-04 (reel wiring, depends on 06-02 for data).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HEIC → JPEG conversion | Browser (client) | — | Files never leave the device until already JPEG; WASM runs in-browser |
| Canvas resize + EXIF strip | Browser (client) | — | Same pipeline step as HEIC conversion; result is the upload payload |
| XHR upload to OCI | Browser (client) | — | Client PUTs directly to PAR URL; server never proxies the bytes |
| PAR minting | API / Backend | — | Server-authoritative; only server holds OCI signing key |
| Ownership + limit validation | API / Backend | — | Never trust client count claims; server enforces DATA-06 |
| Thumbnail generation (sharp) | API / Backend | — | CPU-bound; runs in Hono handler after finalize call |
| Photo rows (DB) | Database / Storage | — | Drizzle/Postgres; `photos` table already defined in schema.ts |
| Photo serving (master + thumb) | CDN / Static | — | Public-read OCI bucket prefix; no server proxying needed |
| Photo detail sheet | Browser (client) | — | React component; reads photo URLs from API |
| Photo cycling in reel | Browser (client) | — | Pure front-end state machine; reads photo URLs from chapter data |

---

## Standard Stack

### Core (new additions for Phase 6)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `heic-to` | 1.4.2 | Client-side HEIC→JPEG conversion via WASM (libheif 1.21.2) | LOCKED decision; actively maintained; `heic-to/next` supports Web Workers |
| `sharp` | 0.34.5 | Server-side thumbnail resize (400px, JPEG q80, EXIF stripped by default) | LOCKED decision; libvips-backed; fastest Node image processing; officially supports Bun via Node-API v9 |
| `oci-objectstorage` | 2.131.1 | OCI SDK for TypeScript — `ObjectStorageClient.createPreauthenticatedRequest()` | Official Oracle SDK; already pinned version in registry |
| `oci-common` | 2.131.1 | OCI SDK auth providers (`SimpleAuthenticationDetailsProvider`) | Required peer of oci-objectstorage |
| `p-limit` | 7.3.0 | Bound concurrency-3 upload queue (30-line semaphore alternative if bundle-size sensitive) | Sindre Sorhus standard; ESM-native; zero deps |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.4.3 | `photoUploadSchema.strict()` for upload-url request, `finalizeSchema.strict()` for finalize | Mirror cityInput.ts pattern |
| `framer-motion` | 11 | Photo card arrival animation (--ease-arrival) in detail sheet + reel cycling crossfade | Already in bundle; no new dep |
| `vitest` | 4.1.5 | Unit tests for photo route handlers, client pipeline utils | Already configured |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `heic-to` | `heic-convert` (Node) | heic-convert is Node-only; heic-to is designed for browser WASM |
| `sharp` | `@napi-rs/canvas`, `jimp` | jimp is pure JS (slower, larger memory); @napi-rs/canvas is primarily a canvas API, not an image-processing pipeline |
| `oci-objectstorage` SDK | Signed REST requests manually | SDK handles request signing (OCI uses custom HTTP Signature auth, not Bearer); manual implementation is error-prone |
| `p-limit` | Hand-rolled semaphore | p-limit is 30 lines anyway; acceptable if bundle size critical; p-limit is ESM-compatible with Vite |
| `XMLHttpRequest` for upload | `fetch` | fetch has no upload progress API in any browser as of 2026; XHR is the only option for per-file progress bars |

**Installation (Wave 0 of 06-01 and 06-02):**
```bash
# Client
bun add heic-to p-limit

# Server (may require npm install as fallback for sharp's postinstall scripts)
bun add sharp oci-objectstorage oci-common
# If bun add sharp fails: npm install sharp  (sharp postinstall needs Node-compatible script runner)
```

**Version verification performed:**
- `heic-to` 1.4.2 — confirmed via `npm view heic-to version` on 2026-05-12 [VERIFIED: npm registry]
- `sharp` 0.34.5 — confirmed via `npm view sharp version` on 2026-05-12 [VERIFIED: npm registry]
- `oci-objectstorage` 2.131.1 — confirmed via `npm view oci-objectstorage version` on 2026-05-12 [VERIFIED: npm registry]
- `p-limit` 7.3.0 — confirmed via `npm view p-limit version` on 2026-05-12 [VERIFIED: npm registry]

---

## Architecture Patterns

### System Architecture Diagram

```
Browser                             Hono API (Bun)              OCI Object Storage
─────────                           ──────────────              ──────────────────
File input (multi)
  │
  ├─ isHeic(file)?
  │     YES → heicTo(blob, 'image/jpeg') [WASM]
  │     NO  → use as-is (JPEG/PNG)
  │
  ├─ canvasResize(blob, 2048px max longest-edge)
  │     ├─ read EXIF orientation from file
  │     ├─ drawImage with rotation correction
  │     └─ canvas.toBlob('image/jpeg', 0.88) → stripped JPEG
  │
  │  POST /api/photos/upload-url { cityId, contentType, sizeBytes }
  │  ──────────────────────────────────────────────────────────────►
  │                                validate ownership (city.userId == me.id)
  │                                validate count < 10 (DATA-06)
  │                                validate sizeBytes <= 5MB (DATA-06)
  │                                INSERT photos row (status='pending')
  │                                createPreauthenticatedRequest(
  │                                   accessType: ObjectWrite,
  │                                   objectName: photos/{userId}/{photoId}/master.jpg,
  │                                   timeExpires: now+5min)
  │  ◄── { photoId, uploadUrl }  ──────────────────────────────────
  │
  │  PUT uploadUrl (XHR, with upload progress events)
  │  ────────────────────────────────────────────────────────────────────────────►
  │                                                               OCI stores master.jpg
  │  ◄────────────────────────────────────────────────────── 200 OK ─────────────
  │
  │  POST /api/photos/:id/finalize
  │  ──────────────────────────────────────────────────────►
  │                                fetch master from OCI (signed GET)
  │                                sharp(buffer)
  │                                  .resize(400, 400, { fit: 'inside' })
  │                                  .jpeg({ quality: 80 })
  │                                  .toBuffer()
  │                                PUT thumb to OCI (thumb key)       ──────────►
  │                                UPDATE photos SET status='ready', thumbKey=...
  │  ◄── { photoId, thumbUrl, masterUrl } ─────────────────
  │
  ├─ (on failure): DELETE /api/photos/:id → DELETE pending row only
  │
  └─ (photo cycling — 06-04):
       GET /api/cities/:id/photos
       ──────────────────────────────────────────────────────►
                                SELECT * FROM photos
                                WHERE city_id=? AND status='ready'
                                ORDER BY order_index
       ◄── [{ id, masterUrl, thumbUrl, orderIndex }] ────────
```

### Recommended Project Structure (new files)

```
src/
├── photos/
│   ├── heicToJpeg.ts        # heic-to WASM wrapper (lazy import guard)
│   ├── canvasResize.ts      # 2048px resize + EXIF orient + strip pipeline
│   ├── uploadQueue.ts       # p-limit semaphore, XHR upload, progress callbacks
│   └── usePhotosQuery.ts    # hook: GET /api/cities/:id/photos with stale-response guard
├── components/
│   └── PhotoDetailSheet.tsx # bottom sheet / desktop modal (mirror CityForm pattern)
└── reel/
    └── chaptersWithPhotos.ts # extends groupsToChapters with photo URL injection

server/
├── routes/
│   ├── photos.ts            # Hono router: upload-url, finalize, list, delete
│   └── photos.test.ts       # (split from cities.test.ts pattern)
├── validation/
│   └── photoInput.ts        # Zod .strict() schemas mirroring cityInput.ts
└── oci/
    └── parClient.ts         # OCI ObjectStorageClient wrapper (singleton)
```

---

## Decision 1: heic-to Integration

**Package:** `heic-to` version 1.4.2 [VERIFIED: npm registry]
**WASM payload:** libheif 1.21.2 embedded (~600KB gzipped per CONTEXT.md)

### API Surface

```typescript
// Source: github.com/hoppergee/heic-to (verified 2026-05-12)
import { heicTo, isHeic } from 'heic-to';

// Detect
const isHeicFile = await isHeic(file); // File object

// Convert
const jpegBlob = await heicTo({
  blob: file,            // File or Blob
  type: 'image/jpeg',    // or 'image/png' or 'bitmap'
  quality: 0.88,         // 0.0–1.0 for JPEG/PNG (ignored for bitmap)
});
// Returns: Promise<Blob>

// CSP environments (avoids unsafe-eval):
import { heicTo } from 'heic-to/csp';

// Web Worker context:
import { heicTo } from 'heic-to/next';
```

[CITED: github.com/hoppergee/heic-to]

### Lazy-load wrapper (mirrors MapPicker.tsx dynamic import pattern)

```typescript
// src/photos/heicToJpeg.ts
// Import is deferred until first call — WASM bundle only loads inside /app/
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
  // Fast extension check first (no WASM load needed for non-HEIC files)
  const ext = file.name.toLowerCase();
  if (ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png')) {
    return false;
  }
  // MIME check (Safari may report 'application/octet-stream')
  if (file.type === 'image/heic' || file.type === 'image/heif') return true;
  if (ext.endsWith('.heic') || ext.endsWith('.heif')) return true;
  // Full WASM detection for ambiguous MIME
  const { isHeic } = await loadHeicTo();
  return isHeic(file);
}
```

### Main-thread blocking risk

`heicTo()` is CPU-intensive (WASM). An iPhone 14 Pro HEIC at 4032×3024 (~8MP) takes ~200-400ms on a modern desktop; mobile may be 1-2s. The `heic-to/next` export supports Web Workers but adds complexity. For Phase 6, run on main thread with visual "Converting..." state to show user feedback. Flag as a potential UX improvement if blocking is noticeable.

**Memory note:** heic-to decodes the full image into memory. At 12 MP (4032×3024 × 4 bytes/px), that is ~48 MB uncompressed. iOS Safari has a ~256-512 MB JS heap; decoding 3 images concurrently at full res could OOM. Mitigate: process HEIC conversion sequentially (even if uploads are parallel 3); the canvas resize step compresses immediately after.

### CSS landmine from feedback_lazy_chunk_css.md

`heic-to` has no CSS. No lazy-CSS race condition. Safe to dynamic-import.

---

## Decision 2: Client-Side Resize + EXIF Pipeline

### Canonical pattern

```typescript
// src/photos/canvasResize.ts
const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.88; // 0.88 is perceptually near-lossless; 0.85 is acceptable

export async function resizeAndStrip(blob: Blob): Promise<Blob> {
  // 1. Load into an img element to get natural dimensions
  const url = URL.createObjectURL(blob);
  const img = await loadImage(url);
  URL.revokeObjectURL(url);

  // 2. Compute output dimensions (preserve aspect ratio, cap at 2048)
  const { w, h } = scaledDimensions(img.naturalWidth, img.naturalHeight, MAX_EDGE);

  // 3. Draw to canvas (canvas draw auto-respects CSS image-orientation in
  //    modern browsers; EXIF rotation is handled by the browser before draw)
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  // 4. Encode to JPEG — canvas.toBlob produces a fresh JPEG with NO EXIF
  //    (canvas never copies metadata from the source image — EXIF stripped by default)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

function scaledDimensions(w: number, h: number, maxEdge: number) {
  if (w <= maxEdge && h <= maxEdge) return { w, h };
  const ratio = maxEdge / Math.max(w, h);
  return { w: Math.round(w * ratio), h: Math.round(h * ratio) };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
```

[ASSUMED: canvas.drawImage applies CSS image-orientation (respects EXIF rotation) on Safari iOS 17+ and Chrome 109+. Modern browsers apply `image-orientation: from-image` by default as of CSS Images Level 4. Verify on a real portrait-orientation JPEG during 06-01 implementation.]

### EXIF strip

`canvas.toBlob()` always produces a bare JPEG with no EXIF. This is not configurable — it is the standard browser behavior. **No additional library needed.** [ASSUMED: based on browser canvas specification; verified by industry practice but not formally tested in this session]

### Pipeline order

1. `detectIsHeic(file)` — fast check
2. If HEIC: `convertHeicToJpeg(file)` → Blob (now JPEG with EXIF from iPhone)
3. `resizeAndStrip(blob)` → Blob (2048px JPEG, EXIF stripped, orientation corrected)
4. Upload blob via XHR to PAR URL

HEIC conversion BEFORE resize is correct — heicTo outputs full-resolution JPEG; then canvas scales it down.

---

## Decision 3: OCI PAR API

### CreatePreauthenticatedRequest — TypeScript SDK

```typescript
// Source: OCI TypeScript SDK docs v2.119.1 (verified 2026-05-12)
import objectStorage = require('oci-objectstorage');
import common = require('oci-common');

// AccessType enum values:
// ObjectRead, ObjectWrite, ObjectReadWrite (single object)
// AnyObjectRead, AnyObjectWrite, AnyObjectReadWrite (bucket-wide)

// For per-upload write PAR (exact key):
const request: objectStorage.requests.CreatePreauthenticatedRequestRequest = {
  namespaceName: env.OCI_NAMESPACE,
  bucketName: env.OCI_BUCKET_NAME,
  createPreauthenticatedRequestDetails: {
    name: `upload-${photoId}`,           // human-readable, not the URL
    objectName: `photos/${userId}/${photoId}/master.jpg`, // exact key
    accessType: objectStorage.models.CreatePreauthenticatedRequestDetails.AccessType.ObjectWrite,
    timeExpires: new Date(Date.now() + 5 * 60 * 1000),   // 5 minutes from now
  },
};

const response = await client.createPreauthenticatedRequest(request);
const accessUri = response.preauthenticatedRequest.accessUri;
// accessUri is the FULL URL path component — prepend the OCI base URL:
// uploadUrl = `https://objectstorage.${region}.oraclecloud.com${accessUri}`
```

[CITED: docs.oracle.com/en-us/iaas/tools/typescript/ — AccessType enum, CreatePreauthenticatedRequestDetails fields]

**Critical:** `accessUri` is displayed only at creation time and cannot be retrieved later. Store it immediately.

### Authentication — SimpleAuthenticationDetailsProvider

```typescript
// server/oci/parClient.ts
const provider = new common.SimpleAuthenticationDetailsProvider(
  env.OCI_TENANCY_OCID,      // ocid1.tenancy.oc1..xxxxxx
  env.OCI_USER_OCID,         // ocid1.user.oc1..xxxxxx
  env.OCI_FINGERPRINT,       // xx:xx:xx:...
  env.OCI_PRIVATE_KEY,       // PEM string (not file path)
  null,                       // passphrase (null if key has no passphrase)
  common.Region.fromRegionId(env.OCI_REGION), // e.g. 'us-phoenix-1'
);

const client = new objectStorage.ObjectStorageClient({ authenticationDetailsProvider: provider });
```

[CITED: docs.oracle.com/en-us/iaas/tools/typescript/2.118.1/ — SimpleAuthenticationDetailsProvider constructor]

**Env vars needed (add to .env.example and .env.local):**
- `OCI_TENANCY_OCID` — tenancy OCID
- `OCI_USER_OCID` — user OCID with PAR_MANAGE + OBJECT_CREATE permission
- `OCI_FINGERPRINT` — API key fingerprint
- `OCI_PRIVATE_KEY` — PEM content (multi-line; use `\n` in .env or use file approach)
- `OCI_REGION` — e.g. `us-phoenix-1`
- `OCI_NAMESPACE` — object storage namespace
- `OCI_BUCKET_NAME` — bucket name

**Alt approach for private key:** Store PEM in a `.pem` file (gitignored), read at startup with `fs.readFileSync`. Avoids newline encoding headaches in .env files.

### PAR URL construction

OCI returns `accessUri` as a path fragment like `/p/<token>/n/<ns>/b/<bucket>/o/photos/{userId}/{photoId}/master.jpg`. The full URL is:
```
https://objectstorage.{region}.oraclecloud.com{accessUri}
```

Browser PUT:
```typescript
// Client uses XHR (not fetch — needs upload progress)
const xhr = new XMLHttpRequest();
xhr.open('PUT', uploadUrl);
xhr.setRequestHeader('Content-Type', 'image/jpeg');
xhr.upload.addEventListener('progress', (e) => {
  if (e.lengthComputable) onProgress(e.loaded / e.total);
});
xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? onSuccess() : onError(xhr.status));
xhr.onerror = onError;
xhr.send(blob);
```

### CORS configuration (MEDIUM confidence — needs OCI console step)

OCI Object Storage supports CORS configuration on buckets. Setting this is a one-time console/CLI step before 06-02 testing. The browser PUT to the PAR URL requires CORS headers:

```
Access-Control-Allow-Origin: http://localhost:5173 (dev), https://timeline.bryanlam.dev (prod)
Access-Control-Allow-Methods: PUT
Access-Control-Allow-Headers: Content-Type
```

[ASSUMED: OCI CORS is configured via the OCI Console → Object Storage → Bucket → Edit → CORS rules, or via oci-cli `oci os bucket update --cors-rules`. Exact CLI syntax not verified in this session. Must confirm before 06-02 testing.]

### OCI bucket public-read prefix (DATA-07)

Thumbnails are served directly from the OCI public URL — no PAR needed for reads if the bucket has a public-read prefix or the objects are under a public visibility setting. From CONTEXT.md: "public-read bucket prefix for photos." This means:
- Bucket visibility: configured so objects under `photos/` are publicly readable without a PAR
- `masterUrl` and `thumbUrl` can be constructed deterministically: `https://objectstorage.{region}.oraclecloud.com/n/{namespace}/b/{bucket}/o/photos/{userId}/{photoId}/master.jpg`

[ASSUMED: OCI bucket can be configured with object-level public access. Confirm the exact OCI public bucket/object setting during 06-02 bucket setup. May require either making the entire bucket public or using public objects under a prefix.]

---

## Decision 4: sharp on Bun Runtime

**Version:** 0.34.5 [VERIFIED: npm registry]
**Status:** Officially supported [CITED: sharp.pixelplumbing.com/install — lists `bun add sharp`]

Sharp supports all JavaScript runtimes with Node-API v9, including Bun. The official install docs include `bun add sharp`. [CITED: sharp install docs, 2026-05-12]

**Known edge case:** `bun install` can fail for sharp in Alpine Linux + Docker environments (custom postinstall script). This affects Phase 8 (Docker deploy) but not local dev.
- Local dev (macOS): `bun add sharp` should work fine.
- Docker (Alpine in Phase 8): Use `npm install sharp` inside the Dockerfile, or switch from Alpine to Debian-slim base.

### Thumbnail pipeline

```typescript
// server/routes/photos.ts — finalize handler
import sharp from 'sharp';

// Fetch master from OCI (simple GET — public read or signed GET)
const masterRes = await fetch(masterUrl);
const masterBuffer = Buffer.from(await masterRes.arrayBuffer());

// Generate 400px thumbnail, EXIF stripped by default (sharp default behavior)
const thumbBuffer = await sharp(masterBuffer)
  .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 80 })
  .toBuffer();
// fit: 'inside' = preserve aspect ratio, neither dimension exceeds 400px
// withoutEnlargement: true = images already ≤400px are not upscaled
// sharp strips EXIF by default — no .withMetadata() call = no EXIF in output
```

[CITED: sharp.pixelplumbing.com/api-resize — fit: inside, withoutEnlargement; sharp.pixelplumbing.com/api-output — EXIF stripped by default, .jpeg() quality 1-100 integer]

**For master resize on server side (finalize or alternative flow):** The CONTEXT.md confirmed the client resizes to 2048px before upload. The server in finalize receives a ≤2048px JPEG and generates 400px thumb. No second master resize needed server-side.

---

## Decision 5: Photos Table Schema

The `photos` table is already defined in `server/db/schema.ts` (Phase 4 shipped all four tables). Current schema:

```typescript
export const photos = pgTable('photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  cityId: uuid('city_id').notNull().references(() => cities.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),  // master OCI key
  thumbKey: text('thumb_key'),                // null until finalize
  width: integer('width'),
  height: integer('height'),
  sizeBytes: integer('size_bytes'),
  caption: text('caption'),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Phase 6 schema delta needed:**

The existing schema is missing:
1. `userId` — denormalized for query simplicity (CONTEXT.md specifies it)
2. `status` — `pending` / `ready` / `failed` (CONTEXT.md specifies status lifecycle)
3. `updatedAt` — pattern consistency with cities table

The CONTEXT.md specifies:
```typescript
status: text('status', { enum: ['pending', 'ready', 'failed'] }).notNull().default('pending'),
userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
masterKey: text('master_key').notNull(),   // OCI object key for master
thumbKey: text('thumb_key'),              // null until finalize
```

Note: The existing `storageKey` should be renamed/interpreted as `masterKey`. The plan should include a migration to add `userId` + `status` columns and rename `storage_key` → `master_key`. However, since Phase 4 migrations created the table but it has never been populated (no photos existed), the simplest path is a new migration that recreates or alters the table.

[ASSUMED: The `photos` table is currently empty (never written to in Phases 4-5). A `DROP TABLE IF EXISTS photos; CREATE TABLE photos (...)` migration is safe. Alternatively, `ALTER TABLE photos ADD COLUMN status text NOT NULL DEFAULT 'pending'` etc. The planner should choose based on migration hygiene preference.]

**Index strategy:**
```sql
CREATE INDEX photos_city_order ON photos (city_id, order_index);
CREATE INDEX photos_user_status ON photos (user_id, status);
```

**Per-city limit (10 photos):** Enforced at application level in `POST /api/photos/upload-url` with `COUNT(*) WHERE city_id = ? AND status != 'failed'`. Not enforceable as a pure DB constraint without triggers.

---

## Project-Specific Pattern Map

| New Component/Route | Mirror This File | Key Pattern |
|---------------------|-----------------|-------------|
| `server/routes/photos.ts` | `server/routes/cities.ts` | Hono router, `c.var.user`, `pgErrorCode(err)`, Zod `.strict()` validation, auth scope on WHERE clause |
| `server/validation/photoInput.ts` | `server/validation/cityInput.ts` | `.strict()` schemas, reject unknown keys, server-authoritative fields absent |
| `src/components/PhotoDetailSheet.tsx` | `src/components/CityForm.tsx` | Discriminated mode prop, `mountedRef` StrictMode-safe (re-anchor inside effect), Escape-to-close, bottom sheet mobile / centered modal desktop, amber CTA button |
| `src/photos/heicToJpeg.ts` | `src/reel/MapCanvas.tsx` lazy pattern | Dynamic `import()` inside async fn, `cancelled` flag, store module ref to avoid re-importing |
| `src/hooks/usePhotosQuery.ts` | `src/hooks/useCitiesQuery.ts` | `reqIdRef` stale-response guard, `mountedRef` unmount guard, `refetch` callback |
| `src/reel/chaptersWithPhotos.ts` | `src/reel/groupChapters.ts` `groupsToChapters` | Extend `ChapterGroup` → `CityChapter` mapping; add `photos` array from real photo DTOs |
| `src/photos/uploadQueue.ts` | No direct analog | XHR wrapper + `p-limit(3)` semaphore + per-file state machine |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HEIC detection + conversion | Custom binary parser | `heic-to` | HEIF format has nested containers, EXIF orientation, Live Photo tracks, multiple image items — hundreds of edge cases |
| Image resize quality | CSS transform / img resize | `canvas` (client) + `sharp` (server) | CSS doesn't produce downloadable bytes; sharp uses libvips (Lanczos resampling, 4-5x faster than ImageMagick) |
| OCI request signing | Manual HTTP Signature Auth | `oci-objectstorage` SDK | OCI uses a custom HMAC-SHA256 request signing scheme (not OAuth, not Bearer) — getting it wrong causes silent 401s |
| Upload concurrency | `Promise.all` on all files | `p-limit(3)` | Uncapped Promise.all on mobile bandwidth causes TCP congestion, timeouts, and poor progress UX |
| Upload progress | `fetch()` | `XMLHttpRequest.upload.onprogress` | fetch has no upload progress API; XHR is the only standard browser mechanism |
| Per-photo DB status | String field on cities | `photos.status` text enum | Status transitions (pending → ready → failed) are first-class domain events; baking them into cities is a schema smell |

---

## Common Pitfalls

### Pitfall 1: EXIF Orientation on canvas.drawImage

**What goes wrong:** `canvas.drawImage(img, ...)` may or may not apply EXIF orientation depending on browser version. Some browsers (pre-2020 Chrome, some WebViews) draw at the raw pixel orientation, ignoring EXIF — portrait photos stored as landscape JPEG with orientation=6 appear sideways.

**Why it happens:** CSS `image-orientation: from-image` (the spec behavior) was not universally implemented before 2021. Safari iOS 13+ and Chrome 81+ apply it; older WebViews may not.

**How to avoid:** On the project's iOS 17+ / Chrome 109+ floor, modern browsers apply EXIF orientation automatically before drawImage. However, the safest approach is to read EXIF orientation explicitly and apply a canvas rotation transform BEFORE drawImage for any file where the browser doesn't auto-correct. Libraries like `exifr` can parse just the orientation tag cheaply.

**Warning signs:** Portrait iPhone photos appear rotated 90° in the photo grid after upload.

[ASSUMED: iOS 17 Safari correctly applies image-orientation automatically in canvas. If the UA floor test fails, add `exifr` for orientation parsing.]

### Pitfall 2: Safari HEIC MIME Type Mismatch

**What goes wrong:** Safari on iOS may report HEIC files as `application/octet-stream` or `image/heic` depending on iOS version. The `<input accept="...">` list may filter differently.

**Why it happens:** Safari's file picker uses the OS MIME type registry, which evolves across iOS versions.

**How to avoid:** Accept `image/heic,image/heif,image/jpeg,image/png,*` in the input's accept attribute as a fallback, then detect format in JS via `isHeic(file)` (which reads the file magic bytes via WASM). Never rely solely on `file.type`.

**Warning signs:** HEIC files are rejected at the file picker level or slip through as non-HEIC.

### Pitfall 3: StrictMode mountedRef Stuck at False (post-await)

**What goes wrong:** Upload completes, `setFileState(...)` never fires. Photo card stuck on "Uploading 100%".

**Why it happens:** `useRef(true)` without re-anchoring in `useEffect` body — StrictMode double-invokes mount/cleanup in dev, leaving `mountedRef.current = false` after the first cleanup. The real second mount never resets it. Post-XHR state updates are gated on `mountedRef.current` and all bail out.

**How to avoid:** Mirror CityForm.tsx's mountedRef pattern exactly:
```typescript
const mountedRef = useRef(true);
useEffect(() => {
  mountedRef.current = true;          // re-anchor on EVERY mount
  return () => { mountedRef.current = false; };
}, []);
```

**Warning signs:** Works in production (no StrictMode), fails in dev with buttons stuck in loading state.

### Pitfall 4: DrizzleQueryError Wraps pg Error Codes

**What goes wrong:** `err.code === '23505'` check never fires; 409 response never sent; duplicate key violation returns 500.

**Why it happens:** Drizzle wraps pg errors in `DrizzleQueryError`; the original code is at `err.cause.code`, not `err.code`.

**How to avoid:** Use the existing `pgErrorCode(err)` helper at `server/db/pgError.ts` in ALL photo route catch blocks. This is already in place for cities.ts.

**Warning signs:** Duplicate upload attempts return 500 instead of 409.

### Pitfall 5: sharp on Alpine (Docker — affects Phase 8)

**What goes wrong:** `bun add sharp` in Alpine Docker container fails with "Could not load the 'sharp' module using the linux-musl-x64 runtime."

**Why it happens:** sharp's prebuilds are for glibc-based Linux. Alpine uses musl libc. When sharp's postinstall detects musl, it tries to compile from source, which requires Python + gcc not present in minimal Alpine images.

**How to avoid:** In Phase 8 Dockerfile, use `node:20-slim` (Debian-based) instead of `node:20-alpine`, OR use `npm install sharp` (not bun) which has more robust postinstall script handling, OR add build dependencies. Flag this for the Phase 8 planner.

**Warning signs:** Phase 8 Docker build fails on sharp install step.

### Pitfall 6: OCI accessUri is One-Time Only

**What goes wrong:** accessUri is not stored immediately after `createPreauthenticatedRequest`; the response is discarded; the upload URL is lost.

**Why it happens:** OCI does NOT provide any API to retrieve the accessUri after creation. It is returned once and never shown again.

**How to avoid:** In `POST /api/photos/upload-url`, return the full upload URL to the client in the same response that returns photoId. The server does not need to store the PAR URL in the DB (the client uses it once). The DB stores the object key (`masterKey`), not the PAR URL.

**Warning signs:** N/A (design-time pitfall, not a runtime bug).

### Pitfall 7: Hono Route Registration Order

**What goes wrong:** `POST /api/photos/upload-url` is captured as `POST /api/photos/:id` with id = "upload-url", returning a 422 from the Zod UUID validation.

**Why it happens:** Hono matches routes in registration order. Literal paths must be registered BEFORE parameterized paths.

**How to avoid:** Register `photosRouter.post('/upload-url', ...)` BEFORE `photosRouter.post('/:id/finalize', ...)` BEFORE `photosRouter.delete('/:id', ...)`. Mirror the PATCH /reorder comment convention from cities.ts.

**Warning signs:** Upload-url endpoint always returns 422.

### Pitfall 8: p-limit is ESM-only

**What goes wrong:** `require('p-limit')` throws "ERR_REQUIRE_ESM"; bundler import fails with CJS interop error.

**Why it happens:** p-limit v7+ is ESM-only.

**How to avoid:** Project uses Vite (ESM) + Bun server (ESM) — ESM-only is not a problem. Just use `import pLimit from 'p-limit'`. Do not `require()` it.

**Warning signs:** Only an issue if someone introduces CJS require() in the upload queue module.

---

## Code Examples

### Verified Patterns from Official Sources

#### heic-to conversion wrapper
```typescript
// Source: github.com/hoppergee/heic-to
import { heicTo, isHeic } from 'heic-to';

const jpegBlob: Blob = await heicTo({
  blob: heicFile,
  type: 'image/jpeg',
  quality: 0.88,
});
```

#### sharp thumbnail (server)
```typescript
// Source: sharp.pixelplumbing.com/api-resize + api-output
import sharp from 'sharp';

const thumbBuffer = await sharp(masterBuffer)
  .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 80 })
  .toBuffer();
// EXIF stripped by default (sharp default behavior per official docs)
```

#### OCI PAR creation (server)
```typescript
// Source: OCI TypeScript SDK docs 2.119.1
import { models } from 'oci-objectstorage';

const { AccessType } = models.CreatePreauthenticatedRequestDetails;

const par = await client.createPreauthenticatedRequest({
  namespaceName: env.OCI_NAMESPACE,
  bucketName: env.OCI_BUCKET_NAME,
  createPreauthenticatedRequestDetails: {
    name: `upload-${photoId}`,
    objectName: `photos/${userId}/${photoId}/master.jpg`,
    accessType: AccessType.ObjectWrite,
    timeExpires: new Date(Date.now() + 5 * 60 * 1000),
  },
});
const accessUri = par.preauthenticatedRequest.accessUri;
const uploadUrl = `https://objectstorage.${env.OCI_REGION}.oraclecloud.com${accessUri}`;
```

#### XHR upload with progress (client)
```typescript
// Source: MDN XMLHttpRequest (standard browser API)
function xhrUpload(
  url: string,
  blob: Blob,
  onProgress: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', 'image/jpeg');
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(blob);
  });
}
```

#### p-limit upload queue (client)
```typescript
// Source: github.com/sindresorhus/p-limit
import pLimit from 'p-limit';

const limit = pLimit(3); // max 3 concurrent

const results = await Promise.allSettled(
  files.map((file) => limit(() => uploadOneFile(file)))
);
```

---

## Reel Integration (06-04)

### Current state

- `CityChapter.photos` is `readonly PhotoSeed[]` where `PhotoSeed = { id, gradient, alt }`
- `cityToChapter()` defaults `photos: []` for API-driven cities
- `groupsToChapters()` calls `citiesToChapters(groups.map(g => g.members[0]))`
- `ChapterOverlay` renders photo stack from `chapter.photos.slice(0, 2)` using `photo.gradient` as CSS background — no real image URLs

### Phase 6 upgrade path

**06-04 adds a new hook and extends the chapter type for real photos:**

```typescript
// New: src/types/reel.ts — add alongside PhotoSeed
export interface PhotoCard {
  readonly id: string;
  readonly thumbUrl: string;    // OCI public URL for thumbnail
  readonly masterUrl: string;   // OCI public URL for master
  readonly alt: string;         // caption or '' (A11Y-05)
}
```

The `CityChapter.photos` field will change from `readonly PhotoSeed[]` to `readonly PhotoCard[]`. This is a breaking change — `ChapterOverlay` and `ReducedMotionReel` both render `photo.gradient`, which won't exist on `PhotoCard`.

**Migration strategy:** Keep `PhotoSeed` for the seeded public reel (`/`, `/u/:handle`). For `/app/` reel, pass real `PhotoCard` objects. Use a discriminated union or make the photo type a union:

```typescript
export type ReelPhoto = PhotoSeed | PhotoCard;
```

ChapterOverlay renders differently based on type guard:
- `PhotoSeed`: render gradient div (existing behavior for public seeded reel)
- `PhotoCard`: render `<img src={photo.thumbUrl} alt={photo.alt} />` with arrival animation

**groupsToChapters extension:**

```typescript
// src/reel/chaptersWithPhotos.ts
export function chaptersWithPhotos(
  groups: readonly ChapterGroup[],
  photosByCityId: Map<string, readonly PhotoCard[]>,
): readonly CityChapter[] {
  return groups.map((g) => {
    const base = cityToChapter(g.members[0]!);
    // Aggregate photos across all members of a collapsed group
    const photos = g.members.flatMap(
      (m) => photosByCityId.get(m.id) ?? [],
    );
    return { ...base, photos };
  });
}
```

**Photo cycling (reel dwell):**

During chapter dwell, cycle through `chapter.photos` at 2.5s intervals with 200ms crossfade. The cycling state lives in `ChapterOverlay` (local `useState(photoIndex)`). On `prefers-reduced-motion: reduce`: no crossfade, instant swap (or no cycling at all — show first photo only). CONTEXT.md specifies: "Photo dwell ≈ 2.5s, crossfade 200ms, respects prefers-reduced-motion (no crossfade, instant swap)."

```typescript
// Inside ChapterOverlay
const [photoIndex, setPhotoIndex] = useState(0);
const reducedMotion = usePrefersReducedMotion();

useEffect(() => {
  if (chapter.photos.length <= 1 || reducedMotion) return;
  const timer = setInterval(() => {
    setPhotoIndex((i) => (i + 1) % chapter.photos.length);
  }, 2500);
  return () => clearInterval(timer);
}, [chapter.photos.length, reducedMotion]);
```

**Fallback:** If `chapter.photos.length === 0`, show gradient placeholder (existing behavior) or nothing. Do NOT show empty img elements.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Server-side HEIC conversion (ImageMagick) | Client-side WASM (heic-to) | 2023+ | No server CPU for conversion; files stay in user's browser until JPEG |
| Signed S3 URLs | OCI PARs (same concept, different API) | OCI-specific | AccessType enum, different auth (API key signing vs IAM role) |
| fetch() for upload progress | XMLHttpRequest.upload.onprogress | fetch spec hasn't added upload progress | XHR still required for progress bars in 2026 |
| sharp on Node.js only | sharp on Bun via Node-API v9 | v0.33.0 (2023) | Bun server can use sharp natively without Node sidecar |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `canvas.drawImage` on iOS 17+ Safari automatically applies EXIF orientation via CSS image-orientation: from-image | Decision 2 | Portrait photos appear rotated 90°; need to add exifr + manual rotation |
| A2 | `canvas.toBlob()` always produces JPEG with zero EXIF | Decision 2 | EXIF leaks GPS data on upload; need to verify with a real EXIF-heavy JPEG |
| A3 | OCI CORS is configurable per-bucket via OCI Console CORS rules panel | Decision 3 | Browser PUT to PAR URL fails with CORS preflight error; may need alternative approach |
| A4 | OCI bucket can be set to public-read for objects under a prefix (photos/) for DATA-07 | Decision 3 | Master/thumb URLs require a separate PAR for reads; thumb URL returned from finalize must be a PAR, not a direct URL |
| A5 | `photos` table is currently empty (no data in Phase 5); DROP+recreate or ALTER migration is safe | Decision 5 | If table has rows, ALTER instead of DROP required |
| A6 | `bun add sharp` works on macOS local dev without issues | Decision 4 | Need fallback to `npm install sharp` if postinstall fails |
| A7 | OCI `SimpleAuthenticationDetailsProvider` accepts PEM content as a string (not file path) for `privateKey` | Decision 3 | OCI client construction fails; need to pass file path or use ConfigFileAuthenticationDetailsProvider |

---

## Open Questions

1. **OCI bucket visibility for public reads**
   - What we know: CONTEXT.md says "public-read bucket prefix for photos"
   - What's unclear: OCI Object Storage has two modes — "Public" bucket (all objects readable without auth) vs per-object PAR for reads. We need to verify which the user set up or intends.
   - Recommendation: Flag for user to confirm in 06-02 plan. If bucket isn't public-read, thumb URLs returned from finalize must be PARs (ObjectRead, longer TTL), not direct URLs.

2. **OCI credentials setup timing**
   - What we know: `.env.local` currently has no OCI keys
   - What's unclear: User has an OCI account (from PROJECT.md OCI references) but may not have generated an API key for PAR creation yet
   - Recommendation: 06-02 plan should include a setup task: create OCI API key in console, add to .env.local, test PAR creation with a throwaway script before writing the full route.

3. **photos table migration**
   - What we know: Phase 4 schema created photos table with different column names (storageKey vs masterKey, no userId, no status)
   - What's unclear: Whether to DROP+recreate or ALTER TABLE
   - Recommendation: Since table is unused, generate a new Drizzle migration that drops and recreates the photos table with the correct schema. Simpler than ALTER.

4. **heic-to main thread blocking on mobile**
   - What we know: 1-2s blocking possible on mobile for 12MP photos
   - What's unclear: Whether this is perceptible enough to require Web Worker offload
   - Recommendation: Ship on main thread in 06-01 with "Converting..." visual. Test on real iPhone. If blocking causes visible jank, upgrade to `heic-to/next` in a follow-up.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Server runtime | ✓ | 1.3.12 | — |
| Node.js | Build tooling + potential sharp fallback | ✓ | 25.8.0 | — |
| PostgreSQL (local Docker) | DB tests in 06-02 | ✗ (not running) | — | `docker compose up db` before testing |
| OCI API credentials | PAR creation in 06-02 | ✗ (not in .env.local) | — | Must be set up before 06-02 |
| OCI Object Storage bucket | Photo storage | ✗ (not yet set up) | — | Must be created with public-read config before 06-02 |
| heic-to | 06-01 client | ✗ (not installed) | — | `bun add heic-to` in Wave 0 |
| sharp | 06-02 server | ✗ (not installed) | — | `bun add sharp` (fallback: `npm install sharp`) |
| oci-objectstorage | 06-02 server | ✗ (not installed) | — | `bun add oci-objectstorage oci-common` |
| p-limit | 06-01 client | ✗ (not installed) | — | `bun add p-limit` or hand-rolled semaphore |

**Missing with no fallback:**
- OCI API credentials (required to mint PARs — human action needed before 06-02)
- OCI bucket (required for storage — human action needed before 06-02)

**Missing with fallback:**
- PostgreSQL: `docker compose up db` (or equivalent) — standard dev workflow

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (repo root — includes `server/**/*.test.ts`) |
| Quick run command | `bun test --reporter=verbose server/routes/photos.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-05 | canvasResize returns Blob ≤ 2048px longest-edge | unit | `bun test src/photos/canvasResize.test.ts` | ❌ Wave 0 |
| DATA-05 | heicToJpeg wrapper returns jpeg Blob for HEIC input | unit | `bun test src/photos/heicToJpeg.test.ts` | ❌ Wave 0 |
| DATA-05 | POST /api/photos/upload-url returns photoId + uploadUrl for valid request | integration | `bun test server/routes/photos.test.ts -t "upload-url"` | ❌ Wave 0 |
| DATA-05 | POST /api/photos/:id/finalize updates status to ready | integration | `bun test server/routes/photos.test.ts -t "finalize"` | ❌ Wave 0 |
| DATA-06 | POST /api/photos/upload-url returns 422 when sizeBytes > 5MB | integration | `bun test server/routes/photos.test.ts -t "size limit"` | ❌ Wave 0 |
| DATA-06 | POST /api/photos/upload-url returns 422 when city has 10 photos | integration | `bun test server/routes/photos.test.ts -t "photo count limit"` | ❌ Wave 0 |
| DATA-06 | POST /api/photos/upload-url returns 404 for city not owned by user | integration | `bun test server/routes/photos.test.ts -t "ownership"` | ❌ Wave 0 |
| DATA-07 | GET /api/cities/:id/photos returns masterUrl + thumbUrl as OCI public URLs | integration | `bun test server/routes/photos.test.ts -t "list photos"` | ❌ Wave 0 |
| REEL-09 | chaptersWithPhotos injects photo cards from photosByCityId map | unit | `bun test src/reel/chaptersWithPhotos.test.ts` | ❌ Wave 0 |

**Note on OCI in tests:** `photos.test.ts` integration tests should mock the OCI client (similar to how jwt.test.ts injects a fake JWKS getter). The PAR creation call should be injectable via a module-level setter: `__setOciClientForTest(mockClient)`. This pattern avoids real OCI calls in CI.

### Sampling Rate
- **Per task commit:** `bun test server/routes/photos.test.ts` (targeted file)
- **Per wave merge:** `bun test` (full 140+ test suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `server/routes/photos.test.ts` — covers DATA-05, DATA-06, DATA-07 route behaviors
- [ ] `src/photos/canvasResize.test.ts` — covers 2048px resize, aspect ratio, small-image pass-through
- [ ] `src/photos/heicToJpeg.test.ts` — covers HEIC detection, JPEG output type (mocked WASM)
- [ ] `src/reel/chaptersWithPhotos.test.ts` — covers REEL-09 photo injection
- [ ] `server/validation/photoInput.ts` — validation schemas (no test file needed; tested via routes)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing `requireJwt` middleware — all `/api/photos/*` routes behind it |
| V3 Session Management | no | Auth0 handles; no new session logic |
| V4 Access Control | yes | `WHERE city_id = ? AND cities.user_id = me.id` — cross-user upload blocked at DB layer |
| V5 Input Validation | yes | Zod `.strict()` on upload-url request body; `contentType` allowlist; `sizeBytes` ceiling |
| V6 Cryptography | no (deferred) | OCI PAR tokens are server-generated; no client crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User uploads to another user's city | Elevation of Privilege | `WHERE cities.user_id = me.id` on pre-flight ownership check in upload-url handler |
| Client claims sizeBytes < 5MB but uploads more | Tampering | Server enforces `sizeBytes <= 5_242_880` at PAR creation; OCI PAR doesn't enforce byte limits — consider adding a `Content-Length` check in finalize by reading OCI object metadata |
| User calls finalize on another user's photo | Elevation of Privilege | `WHERE photos.user_id = me.id` on finalize handler lookup |
| MIME type spoofing (JPEG pretending to be HEIC) | Tampering | Server validates `contentType` is in `['image/jpeg', 'image/png']` allowlist; HEIC arrives as JPEG after client conversion so no special server handling needed |
| Orphan pending rows consuming PAR quota | Denial of Service (self) | Mitigated by 5-minute PAR TTL; orphan sweep deferred to Phase 8 |
| PAR URL leakage | Information Disclosure | PAR URL never stored in DB; only returned to authenticated client once; 5-minute TTL limits exposure |

---

## Housekeeping Tasks (from STATE.md carry-overs)

These are pre-existing tech debt items flagged for Phase 6. The planner should decide whether to bundle them into 06-01 Wave 0 or defer:

1. **Split `cities.test.ts`** (945 lines, past 800 ceiling). Natural cuts: `cities.read.test.ts`, `cities.write.test.ts`, `cities.reorder.test.ts` + `cities.test.helpers.ts`. Recommend: split as first task in 06-02 plan (touches same directory as new photos.test.ts).
2. **Move PATCH /reorder pre-flight check inside `db.transaction()`** — closes narrow TOCTOU race. Low priority but clean.
3. **Extract `formatArrived`** from CityList + ChapterOverlay into `src/utils/formatDate.ts`. Cheap refactor; do in 06-03.
4. **`mapReadyTick` → `useState(map)` refactor** in MapPicker. Medium effort; defer if 06-04 is tight.

---

## Project Constraints (from CLAUDE.md)

- Use `/browse` skill for all web browsing (N/A — research used WebFetch/WebSearch tools)
- Always read DESIGN.md before visual/UI decisions ✓ (read)
- Single amber accent (`--amber-500` / `#FFD470`) — no second accent color
- Photo card / thumbnail border-radius: `12px` (DESIGN.md layout table)
- Sheet / modal border-radius: `24px` top corners only
- Motion: photo card arrival uses `--ease-arrival` cubic-bezier(0.16, 1, 0.3, 1) with `--motion-arrive` (320ms)
- Photo cycling crossfade: 200ms (falls between `--motion-quick` and `--motion-arrive`)
- `prefers-reduced-motion: reduce` must clamp all animation to 0ms
- Microcopy: "Upload failed. Tap to retry." not "Oops! Something went wrong."
- Alt text: `photo.alt` from user caption; empty-alt (`alt=""`) if no caption (A11Y-05)
- Focus rings: `--color-focus-ring` (rgba(255,212,112,0.25), 3px) on all interactive elements
- `DetailSheet` component name matches DESIGN.md component inventory (row 6)
- No console.log in production code (TypeScript rules)

---

## Sources

### Primary (HIGH confidence)
- OCI TypeScript SDK docs 2.119.1 — AccessType enum, CreatePreauthenticatedRequestDetails interface fields [CITED]
- sharp.pixelplumbing.com — resize API, EXIF default stripping, jpeg quality range [CITED]
- sharp.pixelplumbing.com/install — Bun support listed [CITED]
- npm registry — heic-to 1.4.2, sharp 0.34.5, oci-objectstorage 2.131.1, p-limit 7.3.0 [VERIFIED]
- github.com/hoppergee/heic-to — API surface (heicTo, isHeic, quality 0-1, types, /next for Worker) [CITED]
- Existing codebase — CityForm.tsx, MapPicker.tsx, cities.ts, cityInput.ts, schema.ts, pgError.ts, useCitiesQuery.ts [VERIFIED]

### Secondary (MEDIUM confidence)
- OCI TypeScript SDK docs 2.118.1 — SimpleAuthenticationDetailsProvider constructor (string privateKey parameter) [CITED]
- OCI pre-authenticated requests docs — PAR accessUri one-time display, ObjectWrite scope, timeExpires Date [CITED]
- MDN-level browser standard — XMLHttpRequest.upload.onprogress for upload progress (no fetch alternative) [CITED]

### Tertiary (LOW confidence)
- WebSearch: sharp+Bun Alpine Docker issues (multiple 2025 GitHub issues confirm alpine-musl problem) [MEDIUM]
- WebSearch: OCI CORS bucket configuration (console steps not fully verified) [LOW]
- Canvas EXIF orientation browser behavior on iOS 17+ (standard spec, applied automatically per CSS Images L4) [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all library versions verified against npm registry; OCI SDK API fields verified against official TypeScript SDK docs
- Architecture: HIGH — mirrors verified existing patterns (cities.ts, CityForm.tsx, MapPicker.tsx lazy-import)
- Pitfalls: HIGH — StrictMode/DrizzleQueryError/Hono route order pitfalls verified from prior phase history; CORS/sharp-Alpine pitfalls confirmed from web sources
- OCI CORS setup: MEDIUM — conceptually understood, exact console steps [ASSUMED]
- EXIF orientation on canvas: MEDIUM — standard browser behavior but flagged as [ASSUMED]

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (sharp and OCI SDK update frequently; re-verify versions before install)

---

## RESEARCH COMPLETE

Phase 6 research complete. All 4 locked decisions mapped to concrete implementation patterns; 10 unknown areas investigated; OCI PAR API verified against official TypeScript SDK docs; sharp+Bun compatibility confirmed (with Alpine/Docker caveat for Phase 8); heic-to API surface extracted; 9 pitfalls documented including the three project-specific landmines (StrictMode mountedRef, DrizzleQueryError wrapping, Hono route ordering); existing schema delta identified (photos table needs userId + status columns + master_key rename); 7 assumptions logged for planner review.
