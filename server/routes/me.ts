import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { validateHandle } from '../handles/validate.js';

// /api/me sub-router. Mounted in server/index.ts behind the
// requireJwt + lazyProvisionUser middleware chain, so c.var.user is
// always populated here.
export const meRouter = new Hono();

// GET /api/me — returns the current authenticated user.
// c.var.user is populated by lazyProvisionUser (which runs as parent
// middleware in server/index.ts). We do NOT re-query.
meRouter.get('/', (c) => {
  const u = c.var.user;
  return c.json({
    id: u.id,
    email: u.email,
    handle: u.handle,
    createdAt: u.createdAt,
  });
});

// POST /api/me/handle — claims a handle for the current user.
// Body: { handle: string }
// Responses:
//   200 { handle } on success
//   422 { error, reason } on pattern/reserved-word violation (defense
//       in depth — frontend validation can be bypassed)
//   409 { error: 'taken' } if another user has this handle (PG 23505)
//   409 { error: 'already_set', current } if THIS user already has one
meRouter.post('/handle', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const candidate =
    typeof (body as { handle?: unknown })?.handle === 'string'
      ? ((body as { handle: string }).handle)
      : '';

  const result = validateHandle(candidate);
  if (!result.ok) {
    return c.json({ error: 'invalid_handle', reason: result.reason }, 422);
  }

  // Refuse to overwrite an already-set handle. v1 has no rename UI;
  // making this idempotent (200 if same handle, 409 if different) is
  // more honest than letting the second POST silently win.
  const me = c.var.user;
  if (me.handle && me.handle !== result.handle) {
    return c.json({ error: 'already_set', current: me.handle }, 409);
  }
  if (me.handle === result.handle) {
    return c.json({ handle: me.handle });
  }

  // Try to claim. UNIQUE constraint on users.handle is the source of
  // truth for "is this taken?". A pre-check SELECT would race; we let
  // the DB decide and translate the unique_violation back to 409.
  try {
    const [updated] = await db.update(users)
      .set({ handle: result.handle, updatedAt: new Date() })
      .where(eq(users.id, me.id))
      .returning();
    if (!updated) return c.json({ error: 'update_failed' }, 500);
    return c.json({ handle: updated.handle });
  } catch (err) {
    // Postgres unique_violation = '23505'. The pg driver surfaces this
    // as err.code on the underlying error.
    const code = (err as { code?: string }).code;
    if (code === '23505') return c.json({ error: 'taken' }, 409);
    throw err; // any other failure → bubble to global error handler (Hono returns 500)
  }
});
