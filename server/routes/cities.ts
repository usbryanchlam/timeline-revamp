import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cities } from '../db/schema.js';

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
//   1. the row does not exist
//   2. the row exists but belongs to another user (no existence leak)
//   3. the id is malformed (uuid parse error → DB throws → caught here)
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
  } catch {
    // Most likely cause: invalid uuid syntax in :id. Postgres throws
    // 22P02 which the pg driver surfaces as an exception. Treat as
    // 404 (same shape as not-found) to avoid leaking parse details.
    return c.json({ error: 'not_found' }, 404);
  }
});
