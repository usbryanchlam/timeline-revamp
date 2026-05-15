import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, cities, photos } from '../db/schema.js';
import { getOciClient } from '../oci/parClient.js';

// PUBLIC-01 (Phase 7 D-06/07/08/09) — /api/public/u/:handle.
// Unauthenticated one-shot reel payload for a user identified by handle.
// MUST be mounted OUTSIDE the JWT middleware tree in server/index.ts —
// the registration-order rule (Phase 7 RESEARCH §Pitfall 6) keeps this
// route public.
//
// DTO projection is explicit on every table — never `select()` with no
// args on a public route. A future column add (e.g., users.lastSeenAt,
// photos.exifLocation) must not silently leak. The Drizzle projection
// enumerates each public field; the test suite's recursive JSON-stringify
// guards (T4–T6) catch regressions.
//
// Photos are filtered status='ready' so pending uploads / failed transcodes
// never surface (T-07-10). When the user has zero cities, the photos
// SELECT is skipped entirely (inArray with [] is a no-op semantically,
// but skipping avoids the SQL round-trip and any driver-specific quirks).
//
// Cache-Control matches Nginx proxy_cache_valid (D-08): 300s on 200,
// 60s on 404. The app-layer header is the contract; the Nginx directive
// in 07-03 mirrors it.

export interface PublicReelPhotoDTO {
  readonly id: string;
  readonly cityId: string;
  readonly masterUrl: string;
  readonly thumbUrl: string;
  readonly orderIndex: number;
}

export const publicReelRouter = new Hono();

// Hono route ordering note: this is a parameterized route with no literal
// siblings under /api/public/u/. If literal routes are ever added (e.g.
// /api/public/u/_search), they MUST be registered BEFORE this one.
publicReelRouter.get('/:handle', async (c) => {
  const handle = c.req.param('handle').toLowerCase();

  // Case-insensitive user lookup (D-06). Drizzle parameterizes the
  // template — the lowercased handle is bound, not interpolated.
  const [user] = await db
    .select({ id: users.id, handle: users.handle })
    .from(users)
    .where(sql`LOWER(${users.handle}) = ${handle}`)
    .limit(1);

  if (!user) {
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({ error: 'not_found' as const }, 404);
  }

  // Cities — explicit projection matching CityDTO (Phase 5). userId is
  // kept for DTO parity (a UUID, not PII; the renderer code already
  // expects it).
  const cityRows = await db
    .select({
      id: cities.id,
      userId: cities.userId,
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
    })
    .from(cities)
    .where(eq(cities.userId, user.id))
    .orderBy(cities.orderIndex);

  const cityIds = cityRows.map((row) => row.id);

  // Photos — flat, status='ready' filter, transformed to public URLs.
  // and(inArray(...), eq(...)) keeps both predicates as Drizzle helpers
  // for parameterization parity (Fix 5 — no raw sql template here).
  const photoRows =
    cityIds.length === 0
      ? []
      : await db
          .select({
            id: photos.id,
            cityId: photos.cityId,
            masterKey: photos.masterKey,
            thumbKey: photos.thumbKey,
            orderIndex: photos.orderIndex,
          })
          .from(photos)
          .where(
            and(
              inArray(photos.cityId, cityIds),
              eq(photos.status, 'ready'),
            ),
          );

  const oci = getOciClient();
  const photoDtos: readonly PublicReelPhotoDTO[] = photoRows.map((p) => ({
    id: p.id,
    cityId: p.cityId,
    masterUrl: oci.getPublicUrl(p.masterKey),
    // thumb falls back to master when thumb generation hasn't run yet.
    // Phase 6 always produces a thumb on finalize for status='ready'
    // photos, but the schema column is nullable — defensive fallback.
    thumbUrl: p.thumbKey ? oci.getPublicUrl(p.thumbKey) : oci.getPublicUrl(p.masterKey),
    orderIndex: p.orderIndex,
  }));

  // D-07: DTO shape matches authenticated useCitiesQuery + useAllPhotos
  // so the reel renderers stay agnostic (CityDTO[] + flat photos[]).
  // D-09: displayName is intentionally null for v1 — placeholder for a
  // future schema column without breaking the wire shape.
  c.header('Cache-Control', 'public, max-age=300, s-maxage=300');
  return c.json({
    user: { handle: user.handle, displayName: null as null },
    cities: cityRows,
    photos: photoDtos,
  });
});
