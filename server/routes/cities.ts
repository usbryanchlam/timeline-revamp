import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cities } from '../db/schema.js';
import { pgErrorCode } from '../db/pgError.js';
import { createCitySchema, updateCitySchema, reorderSchema } from '../validation/cityInput.js';

// /api/cities sub-router. Mounted in server/index.ts behind the
// requireJwt + lazyProvisionUser middleware chain, so c.var.user is
// always populated here.
//
// Authorization model: every query is scoped to c.var.user.id. The
// :id endpoint MUST include the user_id filter in its WHERE clause —
// a SELECT by id alone would leak the existence of another user's
// city via the 200/404 distinction.
export const citiesRouter = new Hono();

// GET /api/cities — list the requester's cities ordered by order_index.
// Returns 200 [] (not 404) when the user owns zero cities. The empty
// list is a valid state during onboarding before the first city is
// added.
citiesRouter.get('/', async (c) => {
  const me = c.var.user;
  const rows = await db.select().from(cities)
    .where(eq(cities.userId, me.id))
    .orderBy(cities.orderIndex);
  return c.json(rows);
});

// GET /api/cities/:id — single city by id, scoped to the requester.
// Returns 404 in three cases without distinguishing them:
//   1. the row does not exist                       → !row branch below
//   2. the row exists but belongs to another user   → !row branch below
//      (the user_id filter in WHERE means another user's row reads as
//      "not found" — no existence leak)
//   3. the id is malformed (uuid parse error)       → catch branch below
//      (Postgres throws 22P02 invalid_text_representation; we collapse
//      that one specific code to 404 and re-throw anything else so real
//      DB failures still surface as 5xx for ops alerting)
// The cross-user 404 is the load-bearing one — collapsing 403 and 404
// into one response means an attacker cannot probe for other users'
// city ids.
citiesRouter.get('/:id', async (c) => {
  const me = c.var.user;
  const id = c.req.param('id');
  try {
    const [row] = await db.select().from(cities)
      .where(and(eq(cities.id, id), eq(cities.userId, me.id)))
      .limit(1);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(row);
  } catch (err) {
    // Postgres invalid_text_representation = '22P02'. pgErrorCode
    // unwraps both raw pg errors (err.code) and Drizzle's wrapped
    // DrizzleQueryError (err.cause.code). Only collapse that specific
    // code to 404 — anything else (connection failures, missing relation,
    // etc.) must bubble up so it isn't masked.
    if (pgErrorCode(err) === '22P02') return c.json({ error: 'not_found' }, 404);
    throw err; // any other failure → bubble to global error handler (Hono returns 500)
  }
});

// POST /api/cities — create a new city for the requester.
//
// The server is authoritative on order_index: createCitySchema is .strict(),
// so any client-supplied orderIndex is rejected at the Zod layer (422).
// The MAX-then-INSERT runs inside db.transaction(...) using `tx` for BOTH
// queries so concurrent POSTs cannot read the same MAX and collide on the
// deferrable UNIQUE (user_id, order_index) constraint. If the constraint
// does trip at COMMIT (23505), we surface 409 conflict_retry so the
// client can retry rather than masking a real concurrency race as 500.
citiesRouter.post('/', async (c) => {
  const me = c.var.user;
  const raw = await c.req.json().catch(() => null);
  const parsed = createCitySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 422);
  }

  try {
    const inserted = await db.transaction(async (tx) => {
      const [maxRow] = await tx.select({
        max: sql<number>`COALESCE(MAX(${cities.orderIndex}), -1)`,
      }).from(cities).where(eq(cities.userId, me.id));
      const nextIdx = (maxRow?.max ?? -1) + 1;
      const [row] = await tx.insert(cities).values({
        userId: me.id,
        orderIndex: nextIdx,
        name: parsed.data.name,
        tripLabel: parsed.data.tripLabel ?? null,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        zoom: parsed.data.zoom,
        pitch: parsed.data.pitch,
        bearing: parsed.data.bearing,
        arrivedAt: parsed.data.arrivedAt,
        caption: parsed.data.caption ?? null,
      }).returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    });
    return c.json(inserted, 201);
  } catch (err) {
    // 23505 = unique_violation. Possible if a concurrent POST won the
    // race for the same order_index and committed first. Surface as 409
    // so the client can retry.
    if (pgErrorCode(err) === '23505') return c.json({ error: 'conflict_retry' }, 409);
    throw err;
  }
});

// ORDERING: PATCH /reorder MUST be registered BEFORE PATCH /:id below.
// Hono matches routes in registration order — if /:id came first, the
// literal "reorder" would be interpreted as an id param.
//
// PATCH /api/cities/reorder — atomically renumber order_index across the
// requester's cities. Body shape: { items: [{ id, orderIndex }, ...] }.
//
// Pre-flight (outside the transaction): verify every supplied id belongs
// to the requester AND that the payload covers ALL of the user's cities.
// Cross-user id → 404; partial payload → 422 must_include_all_cities.
//
// Transaction: db.transaction(...) opens BEGIN, runs each UPDATE through
// `tx`, and COMMITs on resolve / ROLLBACKs on throw. The deferrable
// UNIQUE (user_id, order_index) constraint (server/db/migrations/
// 0001_cities_deferrable_unique.sql) is checked exactly once, at COMMIT —
// intermediate states with duplicate order_index values are tolerated, so
// a two-row swap (A:0,B:1 → A:1,B:0) does NOT trip 23505 mid-transaction.
citiesRouter.patch('/reorder', async (c) => {
  const me = c.var.user;
  const raw = await c.req.json().catch(() => null);
  const parsed = reorderSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 422);
  }

  // Pre-flight: confirm every id belongs to this user, AND that the body
  // covers ALL of the user's cities. Outside the transaction so the
  // failure path stays cheap.
  const owned = await db.select({ id: cities.id }).from(cities)
    .where(eq(cities.userId, me.id));
  const ownedIds = new Set(owned.map((r) => r.id));

  for (const it of parsed.data.items) {
    if (!ownedIds.has(it.id)) return c.json({ error: 'not_found' }, 404);
  }
  if (parsed.data.items.length !== ownedIds.size) {
    return c.json({ error: 'invalid_input', reason: 'must_include_all_cities' }, 422);
  }

  // The transaction. db.transaction() opens BEGIN; runs the callback;
  // COMMITs on resolve, ROLLBACKs on throw. The DEFERRABLE unique
  // constraint on (user_id, order_index) is checked exactly once, at
  // COMMIT — intermediate states with duplicate index values are tolerated.
  // One timestamp for the whole batch — easier to diff "what changed in this reorder."
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const it of parsed.data.items) {
      await tx.update(cities)
        .set({ orderIndex: it.orderIndex, updatedAt: now })
        .where(and(eq(cities.id, it.id), eq(cities.userId, me.id)));
    }
  });

  return c.json({ ok: true });
});

// PATCH /api/cities/:id — partial update of a city owned by the requester.
//
// updateCitySchema = createCitySchema.partial().strict(), so:
//   - any unknown key (orderIndex, id, userId, createdAt, ...) → 422
//   - all known keys are optional
// The handler builds the SET object exclusively from parsed.data — the raw
// request body is never spread. This is the mass-assignment defense: even
// if .strict() were ever loosened, only validated keys can reach the SQL.
//
// The WHERE clause is (id = ? AND user_id = me.id), so a row that exists
// but belongs to another user reads as "0 rows updated" — same 404 trust
// boundary as GET /:id (no cross-user existence leak).
//
// updatedAt is set explicitly so the column actually moves on every PATCH,
// independent of any DB-level trigger.
citiesRouter.patch('/:id', async (c) => {
  const me = c.var.user;
  const id = c.req.param('id');
  const raw = await c.req.json().catch(() => null);
  const parsed = updateCitySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 422);
  }

  try {
    // Build the patch object from validated keys only. NEVER spread `raw`.
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) patch[k] = v;
    }

    const [updated] = await db.update(cities)
      .set(patch)
      .where(and(eq(cities.id, id), eq(cities.userId, me.id)))
      .returning();
    if (!updated) return c.json({ error: 'not_found' }, 404);
    return c.json(updated);
  } catch (err) {
    // Same shape as GET /:id: collapse only 22P02 (malformed UUID) to 404,
    // re-throw everything else so real DB failures surface as 5xx.
    if (pgErrorCode(err) === '22P02') return c.json({ error: 'not_found' }, 404);
    throw err;
  }
});

// DELETE /api/cities/:id — remove a city owned by the requester.
//
// 204 on successful delete (empty body), 404 when no matching row exists
// for this user (whether the row is missing entirely or belongs to another
// user — same cross-user 404 trust boundary as GET/PATCH).
//
// Photo rows are dropped via FK CASCADE (server/db/schema.ts photos.cityId
// references cities.id ON DELETE CASCADE). No manual cleanup needed.
//
// order_index is deliberately NOT compacted after delete; gaps are fine
// and re-numbering is the job of /api/cities/reorder (Plan 05-03).
citiesRouter.delete('/:id', async (c) => {
  const me = c.var.user;
  const id = c.req.param('id');
  try {
    const result = await db.delete(cities)
      .where(and(eq(cities.id, id), eq(cities.userId, me.id)))
      .returning({ id: cities.id });
    if (result.length === 0) return c.json({ error: 'not_found' }, 404);
    c.status(204);
    return c.body(null);
  } catch (err) {
    if (pgErrorCode(err) === '22P02') return c.json({ error: 'not_found' }, 404);
    throw err;
  }
});
