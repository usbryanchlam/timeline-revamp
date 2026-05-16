import type { Context } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

// DEPLOY-01 / Phase 8 D-17.
// PUBLIC endpoint (no JWT). Pings Postgres with a no-rows SELECT to catch
// the "API up but DB unreachable" failure mode that a trivial liveness
// stub would mask. Response contract:
//   - 200 { status: 'ok',    db: 'ok'          } on success
//   - 503 { status: 'error', db: 'unreachable' } on any thrown error
//
// Error details are written to process.stderr (operator-visible via
// `docker compose logs api`) and intentionally NOT echoed in the response
// body to avoid leaking connection strings or credentials (T-08-05).
//
// Mounted in server/index.ts BEFORE the /api/me JWT middleware blocks so
// the Hono registration-order rule keeps this route public (Phase 7
// RESEARCH Pitfall 6 — bulk /api/* middleware would intercept this).
//
// The bare /health stub stays in server/index.ts for direct-API liveness
// probes that should not page on a transient DB blip.

export type HealthResponse =
  | { status: 'ok'; db: 'ok' }
  | { status: 'error'; db: 'unreachable' };

export async function healthHandler(c: Context): Promise<Response> {
  try {
    await db.execute(sql`select 1`);
    return c.json<HealthResponse>({ status: 'ok', db: 'ok' });
  } catch (err) {
    // process.stderr — coding-style.md no-console-log rule.
    process.stderr.write(`/api/health DB ping failed: ${String(err)}\n`);
    return c.json<HealthResponse>({ status: 'error', db: 'unreachable' }, 503);
  }
}
