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
    // Postgres invalid_text_representation = '22P02'. The pg driver
    // surfaces this as err.code on the underlying error; Drizzle wraps
    // it in DrizzleQueryError and stores the original on err.cause, so
    // we check both. Only collapse that specific code to 404 — anything
    // else (connection failures, missing relation, etc.) must bubble up
    // so it isn't masked.
    const code =
      (err as { code?: string }).code ??
      (err as { cause?: { code?: string } }).cause?.code;
    if (code === '22P02') return c.json({ error: 'not_found' }, 404);
    throw err; // any other failure → bubble to global error handler (Hono returns 500)
  }
});
