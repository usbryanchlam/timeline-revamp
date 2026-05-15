import type { Context } from 'hono';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { validateHandle } from '../handles/validate.js';

// AUTH-05/06/07 — Phase 7 D-02/D-04.
// PUBLIC endpoint (no JWT). Live-availability check for the handle
// picker. Returns the same reason codes as validateHandle, plus 'taken'
// when a users row already owns the candidate.
//
// Cache-Control: no-store is set FIRST so Nginx (Phase 8) never serves
// a stale "available" between racing pickers. The authoritative claim
// path is still POST /api/me/handle, which re-validates and collapses
// the unique-constraint 23505 violation to 409 (server/routes/me.ts).
//
// validateHandle is the SINGLE source of truth — the regex,
// length-range, and reserved-words checks must NOT be duplicated here.
// Three callers, one rule set (Phase 7 PATTERNS §"Validation source
// of truth").
//
// Mounted in server/index.ts BEFORE the /api/me JWT middleware blocks
// so the Hono registration-order rule keeps this route public (Phase 7
// RESEARCH §Pitfall 6 — bulk /api/* middleware would intercept this).

const querySchema = z.object({
  candidate: z.string().min(1).max(64),
});

export type HandleCheckResponse =
  | { available: true }
  | {
      available: false;
      reason: 'too_short' | 'too_long' | 'invalid_chars' | 'reserved' | 'taken';
    };

export async function handlesCheckHandler(c: Context): Promise<Response> {
  // Set the cache header BEFORE any branch so every response (including
  // a thrown 500) is uncacheable. D-04 / T-07-04.
  c.header('Cache-Control', 'no-store');

  const parsed = querySchema.safeParse({ candidate: c.req.query('candidate') });
  if (!parsed.success) {
    return c.json<HandleCheckResponse>({
      available: false,
      reason: 'invalid_chars',
    });
  }

  const v = validateHandle(parsed.data.candidate);
  if (!v.ok) {
    return c.json<HandleCheckResponse>({
      available: false,
      reason: v.reason,
    });
  }

  // Case-insensitive uniqueness check. validateHandle has already
  // lowercased v.handle, so this LOWER() guards against any DB row
  // that may have been seeded with mixed case prior to the Phase 4
  // lowercase-enforce path landing.
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`LOWER(${users.handle}) = ${v.handle}`)
    .limit(1);

  if (row) {
    return c.json<HandleCheckResponse>({
      available: false,
      reason: 'taken',
    });
  }

  return c.json<HandleCheckResponse>({ available: true });
}
