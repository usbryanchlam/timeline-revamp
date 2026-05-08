import type { MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, type User } from '../db/schema.js';

// AUTH-03: lazy user provisioning. Runs on every authenticated /api/me
// call (mounted in server/index.ts AFTER requireJwt — order matters
// because this middleware reads c.var.auth0Sub set by requireJwt).
//
// On first authenticated visit by a new user: SELECT users where
// auth0_sub matches; if zero rows, INSERT a row keyed by the immutable
// Auth0 sub claim with email populated and handle left NULL (the
// HandlePickerModal fills handle in via POST /api/me/handle).
//
// Why middleware and not per-route: every authenticated handler needs
// c.var.user. Doing it once here means handlers don't repeat the lookup.
//
// Why not an Auth0 webhook (the alternative considered in PROJECT.md
// decisions table): a webhook adds an external dependency, requires
// public ingress, and creates a race where the user can hit the API
// before the webhook fires. Lazy provisioning has neither problem.
//
// Concurrency note: if two requests for a never-seen-before user
// arrive simultaneously, both could SELECT-not-found and both attempt
// INSERT. The second INSERT would fail on the auth0_sub UNIQUE
// constraint. For v1 single-user-flow this race is essentially
// nonexistent (a user only authenticates from one tab during signup).
// If it ever bites, the v2 fix is INSERT ... ON CONFLICT (auth0_sub)
// DO UPDATE SET updated_at = now() RETURNING * — Drizzle exposes this
// via .onConflictDoUpdate(). Documented but not implemented now to
// keep the code minimal.
export const lazyProvisionUser: MiddlewareHandler = async (c, next) => {
  const auth0Sub = c.var.auth0Sub;
  const auth0Email = c.var.auth0Email;

  let user: User | undefined = await db.query.users.findFirst({
    where: eq(users.auth0Sub, auth0Sub),
  });

  if (!user) {
    const inserted = await db.insert(users).values({
      auth0Sub,
      email: auth0Email,
    }).returning();
    user = inserted[0];
    if (!user) {
      // Should be unreachable — INSERT ... RETURNING always returns the
      // row unless the row was rejected, in which case the INSERT
      // itself would have thrown. Defensive guard for typesafety.
      return c.json({ error: 'provisioning_failed' }, 500);
    }
  }

  c.set('user', user);
  await next();
};
