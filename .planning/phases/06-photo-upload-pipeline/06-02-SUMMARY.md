---
phase: 06-photo-upload-pipeline
plan: "02"
subsystem: server
tags:
  - photos
  - server
  - oci
  - sharp
  - drizzle
dependency_graph:
  requires:
    - 04-01 (schema tables)
    - 04-02 (auth middleware)
    - 05-01 (cities read endpoints — photos FK parent)
  provides:
    - POST /api/cities/:cityId/photos/upload-url
    - POST /api/photos/:id/finalize
    - DELETE /api/photos/:id
    - GET /api/cities/:cityId/photos
  affects:
    - 06-03 (consumes GET /api/cities/:cityId/photos response)
    - 06-04 (consumes GET /api/cities/:cityId/photos response for reel)
tech_stack:
  added:
    - sharp 0.34.5 (already in package.json at baseline — server thumbnail generation)
    - oci-objectstorage 2.131.1 (already installed — PAR creation)
    - oci-common 2.131.1 (already installed — auth provider)
  patterns:
    - Hono two-router split (photosRouter + photosNestedRouter) for path scoping
    - OCI client singleton with test injection seam (__setOciClientForTest)
    - Magic-byte MIME sniff (sniffImageMime) — never trust client-declared contentType
    - PLACEHOLDER masterKey pattern in transaction (insert then update)
key_files:
  created:
    - server/oci/parClient.ts
    - server/oci/parClient.test.ts
    - server/validation/photoInput.ts
    - server/routes/photos.ts
    - server/routes/photos.test.ts
    - server/db/migrations/0002_photos_v2.sql
  modified:
    - server/db/schema.ts (photos table delta)
    - server/db/migrations/meta/_journal.json
    - server/env.ts (7 optional OCI_* keys)
    - server/index.ts (route mounting)
    - .env.example (OCI keys documented)
decisions:
  - "Two-router pattern (photosRouter + photosNestedRouter) needed because upload-url
    lives under /api/cities/:cityId/photos while finalize/delete live under /api/photos/:id.
    Mounting a single router at both paths would create route conflicts."
  - "PLACEHOLDER masterKey strategy: insert row first (to get UUID id), then update
    masterKey = photos/{userId}/{id}/master.{ext}. Alternative of two separate inserts
    is messier; this stays in one transaction."
  - "sniffImageMime checks JPEG first (3-byte min) then PNG (8-byte min) rather than
    a single 8-byte guard, because the test spec required 4-byte JPEG buffers to pass."
  - "Journal when timestamp: original 1747094400000 was before existing migration entries
    (1778136140032), causing drizzle migrator to skip 0002. Fixed to 1778649300000."
  - "OCI bucket is public-read (confirmed by user in execution context). getPublicUrl
    constructs direct OCI object URLs without PARs for reads."
metrics:
  duration: "~45 minutes"
  completed: "2026-05-12"
  tasks_completed: 3
  files_changed: 11
---

# Phase 6 Plan 02: OCI PAR Upload + Thumbnail Pipeline Summary

Server-side photo pipeline: short-lived ObjectWrite PARs for client uploads, sharp-driven thumbnail generation on finalize, ownership/count/size enforcement, and the read endpoint for 06-03/06-04.

## Endpoints Shipped

| Method | Path | Router | Description |
|--------|------|--------|-------------|
| POST | `/api/cities/:cityId/photos/upload-url` | photosNestedRouter | Mint 5-min write PAR; enforce ownership + 10-photo limit + 5MB; return `{ photoId, uploadUrl }` |
| POST | `/api/photos/:id/finalize` | photosRouter | Download master, sniff MIME, generate 400px thumb via sharp, mark status=ready |
| DELETE | `/api/photos/:id` | photosRouter | Remove row scoped to caller; 404 for cross-user (no existence leak) |
| GET | `/api/cities/:cityId/photos` | photosNestedRouter | List status=ready photos ordered by orderIndex; map to `{ id, masterUrl, thumbUrl, orderIndex }` |

## Schema Delta Applied

**Removed:** `storage_key`, `width`, `height`, `size_bytes`

**Added:** `user_id` (FK → users, ON DELETE CASCADE), `status` text enum ('pending','ready','failed'), `master_key`, `updated_at`

**New indexes:** `photos_city_order (city_id, order_index)`, `photos_user_status (user_id, status)`

**CHECK constraint:** `status IN ('pending', 'ready', 'failed')` enforced at DB layer.

Migration applied to live DB: `0002_photos_v2.sql` → `drizzle.__drizzle_migrations` entry `ff48f254...` at `created_at=1778649300000`.

## OCI Mock Injection Seam

`server/oci/parClient.ts` exports `__setOciClientForTest(mock: OciClient)`. The mock replaces the entire OCI client singleton at test startup. `server/routes/photos.ts` re-exports this function so tests can import from one place.

`FAKE_OCI.getMasterBuffer` returns JPEG magic bytes `[0xff, 0xd8, 0xff, 0xe0, ...]` so `sniffImageMime(buf)` passes in integration tests. `FAKE_OCI.makeThumbAndPut` is a no-op mock — sharp never runs in tests.

## GET /api/cities/:cityId/photos Response Shape (consumed by 06-03)

```typescript
// Array of:
{
  id: string;        // photo UUID
  masterUrl: string; // OCI public URL for master (full-res)
  thumbUrl: string | null;  // OCI public URL for thumbnail (400px)
  orderIndex: number;
}
```

Only `status='ready'` photos are returned. `thumbUrl` is null if finalize hasn't run (shouldn't happen in normal flow but safe). Photos are ordered by `orderIndex ASC, createdAt ASC`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Journal timestamp ordering caused migration skip**
- **Found during:** Task 2 (DB push)
- **Issue:** Plan's example `when: 1747094400000` for the new journal entry was earlier than existing entries (`1778136140032`, `1778136140033`). Drizzle's migrator uses `created_at` ordering and treated 0002 as "already past" — it didn't apply the migration despite the SQL file existing.
- **Fix:** Updated `_journal.json` `when` to `1778649300000` (after existing entries).
- **Files modified:** `server/db/migrations/meta/_journal.json`
- **Commit:** 1b7ac6b

**2. [Rule 1 - Bug] sniffImageMime single 8-byte guard blocked JPEG detection**
- **Found during:** Task 3 (parClient.test.ts execution)
- **Issue:** The plan's code block had `if (buf.length < 8) return null` which blocked JPEG detection for buffers shorter than 8 bytes. The plan's own test spec requires a 4-byte JPEG buffer to return `'image/jpeg'`.
- **Fix:** Split the guard: JPEG checks `buf.length >= 3` (JPEG_MAGIC.length), PNG checks `buf.length >= 8` (PNG_MAGIC.length).
- **Files modified:** `server/oci/parClient.ts`
- **Commit:** b463c7b

**3. [Rule 2 - Missing export] __setOciClientForTest not re-exported from photos.ts**
- **Found during:** Task 3 first test run
- **Issue:** Test file imports `__setOciClientForTest` from `./photos.js` but the function lived only in `parClient.ts`. `TypeError: __setOciClientForTest is not a function`.
- **Fix:** Added `export { __setOciClientForTest }` re-export in `photos.ts`. Plan's artifact spec listed it as an export of `photos.ts` but the code block didn't include it.
- **Files modified:** `server/routes/photos.ts`
- **Commit:** b463c7b

**4. [Rule 3 - Blocking] Test file had unused function and parameters causing TS6133 errors**
- **Found during:** Task 3 typecheck
- **Issue:** `provisionUser` function and `email` parameter in `ensureUser` were unused, blocking typecheck.
- **Fix:** Removed `provisionUser`, simplified `ensureUser(sub, token)` signature.
- **Files modified:** `server/routes/photos.test.ts`
- **Commit:** b463c7b

## OCI Setup Confirmation

- Bucket: `timeline-photos`, namespace `axkyqw8tpzg0`, region `us-sanjose-1`
- Visibility: public-read — `getPublicUrl` constructs direct object URLs without read PARs
- CORS: deferred (PAR endpoints permissive by default; will address in 06-03 smoke test if preflight fails)
- All 7 OCI_* keys in `.env.local` (gitignored)

## Test Results

| File | Tests | Status |
|------|-------|--------|
| `server/routes/photos.test.ts` | 14 | PASS |
| `server/oci/parClient.test.ts` | 5 | PASS |
| All other server tests | 159 | PASS |
| **Total** | **178** | **PASS** |

## Self-Check: PASSED

Files exist:
- server/oci/parClient.ts ✓
- server/oci/parClient.test.ts ✓
- server/validation/photoInput.ts ✓
- server/routes/photos.ts ✓
- server/routes/photos.test.ts ✓
- server/db/migrations/0002_photos_v2.sql ✓

Commits exist:
- ca8051e (task 1/3 — schema delta + migration + validation + failing test scaffold)
- 1b7ac6b (task 2/3 — apply photos_v2 migration, fixed journal timestamp)
- b463c7b (task 3/3 — OCI parClient + photos router GREEN)
