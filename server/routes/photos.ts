import { Hono } from 'hono';
import { and, eq, count, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { photos, cities } from '../db/schema.js';
import { pgErrorCode } from '../db/pgError.js';
import { uploadUrlSchema, PER_CITY_LIMIT } from '../validation/photoInput.js';
import { getOciClient, sniffImageMime, __setOciClientForTest } from '../oci/parClient.js';

// Re-export for test injection — photos.test.ts injects FAKE_OCI via this export
// rather than importing parClient directly, so tests don't need to know the
// internal module boundary.
export { __setOciClientForTest };

// ─── Route ordering note ────────────────────────────────────────────────────
// photosRouter is mounted at /api/photos.
//   POST /:id/finalize — literal second segment, registered before DELETE /:id
//   DELETE /:id
//   (Hono matches in registration order — literal sub-paths before pure :id catch-all)
//
// photosNestedRouter is mounted at /api/cities/:cityId/photos.
//   POST /upload-url — literal path BEFORE any future parameterized routes
//   GET  /            — list ready photos for city
//
// This mirrors the cities.ts pattern: PATCH /reorder before PATCH /:id.
// Pitfall 7 from RESEARCH: "upload-url" must precede "/:id" — verified here.
// ──────────────────────────────────────────────────────────────────────────────

// /api/photos sub-router. Mounted in server/index.ts behind the
// requireJwt + lazyProvisionUser middleware chain, so c.var.user is
// always populated here.
//
// Authorization model: every query is scoped to c.var.user.id. A photo
// owned by another user reads as "not found" — no cross-user existence leak.
export const photosRouter = new Hono();

// /api/cities/:cityId/photos sub-router. Mounted as a nested router under
// the city resource. The cityId param is available via c.req.param('cityId').
export const photosNestedRouter = new Hono();

// ─── ORDERING: literal paths BEFORE parameterized paths ────────────────────

// POST /api/cities/:cityId/photos/upload-url
// Validates ownership + count + size + contentType, then mints a 5-minute
// write-scoped PAR for the client to PUT the master image directly to OCI.
// Returns { photoId, uploadUrl } — the uploadUrl is one-time-only (RESEARCH Pitfall 6).
photosNestedRouter.post('/upload-url', async (c) => {
  const me = c.var.user;

  // Validate cityId from URL path as UUID. Malformed UUID → 404 (not 422)
  // because the URL path is server implementation detail; callers should not
  // receive validation feedback on path structure.
  const cityId = c.req.param('cityId');
  const cityIdParsed = z.string().uuid().safeParse(cityId);
  if (!cityIdParsed.success) {
    return c.json({ error: 'not_found' }, 404);
  }

  const raw = await c.req.json().catch(() => null);
  const parsed = uploadUrlSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 422);
  }

  try {
    // Pre-flight ownership: SELECT cities where id = :cityId AND userId = me.id
    // If missing → 404 (city doesn't exist OR belongs to another user — no existence leak).
    const [cityRow] = await db.select({ id: cities.id })
      .from(cities)
      .where(and(eq(cities.id, cityIdParsed.data), eq(cities.userId, me.id)))
      .limit(1);
    if (!cityRow) return c.json({ error: 'not_found' }, 404);

    // Pre-flight count: enforce 10-photo-per-city limit (DATA-06).
    // Counts only non-failed photos — failed photos don't consume quota.
    const [countRow] = await db.select({ n: count() })
      .from(photos)
      .where(and(
        eq(photos.cityId, cityIdParsed.data),
        sql`${photos.status} != 'failed'`,
      ));
    if ((countRow?.n ?? 0) >= PER_CITY_LIMIT) {
      return c.json({ error: 'photo_limit_reached' }, 422);
    }

    // Determine extension from content type.
    const ext = parsed.data.contentType === 'image/png' ? 'png' : 'jpg';

    // Insert inside a transaction: create the row with a PLACEHOLDER masterKey,
    // then UPDATE it with the real key (which requires the row id). This avoids
    // a two-step insert+update outside a transaction.
    const result = await db.transaction(async (tx) => {
      const [row] = await tx.insert(photos).values({
        cityId: cityIdParsed.data,
        userId: me.id,
        status: 'pending',
        masterKey: 'PLACEHOLDER',
        orderIndex: 0,
      }).returning();
      if (!row) throw new Error('insert returned no row');
      const masterKey = `photos/${me.id}/${row.id}/master.${ext}`;
      const [updated] = await tx.update(photos)
        .set({ masterKey, updatedAt: new Date() })
        .where(eq(photos.id, row.id))
        .returning();
      if (!updated) throw new Error('update returned no row');
      return updated;
    });

    // Mint a write-scoped PAR. accessUri is one-time-only — return to client immediately.
    const { uploadUrl } = await getOciClient().createWritePar({
      objectName: result.masterKey,
    });

    return c.json({ photoId: result.id, uploadUrl }, 201);
  } catch (err) {
    // 22P02 = invalid_text_representation (malformed UUID) → collapse to 404.
    if (pgErrorCode(err) === '22P02') return c.json({ error: 'not_found' }, 404);
    throw err;
  }
});

// GET /api/cities/:cityId/photos
// Returns all status='ready' photos for the given city scoped to the caller.
// If the city belongs to another user, the caller has no photos for it → [].
// Returns empty array (not 404) so existence of other users' cities isn't leaked.
photosNestedRouter.get('/', async (c) => {
  const me = c.var.user;
  const cityId = c.req.param('cityId');
  const cityIdParsed = z.string().uuid().safeParse(cityId);
  if (!cityIdParsed.success) {
    return c.json({ error: 'not_found' }, 404);
  }

  try {
    const rows = await db.select()
      .from(photos)
      .where(and(
        eq(photos.cityId, cityIdParsed.data),
        eq(photos.userId, me.id),
        eq(photos.status, 'ready'),
      ))
      .orderBy(photos.orderIndex, photos.createdAt);

    const oci = getOciClient();
    return c.json(rows.map((r) => ({
      id: r.id,
      masterUrl: oci.getPublicUrl(r.masterKey),
      thumbUrl: r.thumbKey ? oci.getPublicUrl(r.thumbKey) : null,
      orderIndex: r.orderIndex,
    })));
  } catch (err) {
    if (pgErrorCode(err) === '22P02') return c.json({ error: 'not_found' }, 404);
    throw err;
  }
});

// POST /api/photos/:id/finalize
// Downloads the master from OCI, validates MIME bytes (never trusts the
// client-declared contentType), generates a 400px thumbnail via sharp,
// uploads thumb, and marks status='ready'.
// Returns 409 if already finalized (idempotency guard).
photosRouter.post('/:id/finalize', async (c) => {
  const me = c.var.user;
  const id = c.req.param('id');

  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) {
    return c.json({ error: 'not_found' }, 404);
  }

  try {
    // Ownership-scoped lookup: another user's photo reads as 404.
    const [row] = await db.select()
      .from(photos)
      .where(and(eq(photos.id, idParsed.data), eq(photos.userId, me.id)))
      .limit(1);
    if (!row) return c.json({ error: 'not_found' }, 404);

    // Idempotency guards.
    if (row.status === 'ready') {
      return c.json({ error: 'already_finalized' }, 409);
    }
    if (row.status === 'failed') {
      return c.json({ error: 'photo_failed' }, 409);
    }

    const thumbKey = row.masterKey.replace('/master.', '/thumb.');
    const oci = getOciClient();

    try {
      const buf = await oci.getMasterBuffer(row.masterKey);

      // MIME sniff: trust no client-declared contentType. Magic bytes only.
      // Rejects arbitrary bytes that were PUT against the PAR URL.
      if (!sniffImageMime(buf)) {
        await db.update(photos)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(and(eq(photos.id, row.id), eq(photos.userId, me.id)));
        return c.json({ error: 'unsupported_content_type' }, 422);
      }

      await oci.makeThumbAndPut(buf, thumbKey);

      const [updated] = await db.update(photos)
        .set({ status: 'ready', thumbKey, updatedAt: new Date() })
        .where(and(eq(photos.id, row.id), eq(photos.userId, me.id)))
        .returning();

      if (!updated) return c.json({ error: 'not_found' }, 404);

      return c.json({
        id: updated.id,
        masterUrl: oci.getPublicUrl(updated.masterKey),
        thumbUrl: oci.getPublicUrl(updated.thumbKey!),
      });
    } catch (innerErr) {
      // On OCI or sharp failure, mark the photo as failed so the caller
      // knows to retry via a fresh upload-url flow.
      await db.update(photos)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(and(eq(photos.id, row.id), eq(photos.userId, me.id)));
      throw innerErr;
    }
  } catch (err) {
    if (pgErrorCode(err) === '22P02') return c.json({ error: 'not_found' }, 404);
    throw err;
  }
});

// DELETE /api/photos/:id
// Removes the photo row scoped to the caller. Returns 204 on success,
// 404 when not found or when caller is not the owner (cross-user 404 trust boundary).
// OCI object cleanup is best-effort (deferred per CONTEXT.md — orphan sweeper Phase 8).
photosRouter.delete('/:id', async (c) => {
  const me = c.var.user;
  const id = c.req.param('id');

  try {
    const result = await db.delete(photos)
      .where(and(eq(photos.id, id), eq(photos.userId, me.id)))
      .returning({ id: photos.id });
    if (result.length === 0) return c.json({ error: 'not_found' }, 404);
    c.status(204);
    return c.body(null);
  } catch (err) {
    if (pgErrorCode(err) === '22P02') return c.json({ error: 'not_found' }, 404);
    throw err;
  }
});
