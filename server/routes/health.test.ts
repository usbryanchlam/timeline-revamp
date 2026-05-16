import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// MUST set env BEFORE dynamic imports — server/env.ts validates synchronously
// and process.exit(1) on failure. /api/health is PUBLIC (no JWT setup
// needed). Env still has to satisfy zod.
process.env.AUTH0_DOMAIN = 'test.auth0.com';
process.env.AUTH0_AUDIENCE = 'https://api.test.example';

// Stub the db module so we don't need a live Postgres for these unit tests.
// vi.mock is hoisted to the top of the file by vitest, so it runs BEFORE the
// dynamic imports below resolve. The factory returns a typed-enough shape:
// the only export the handler under test consumes is `db.execute`.
vi.mock('../db/client.js', () => ({
  db: {
    execute: vi.fn(),
  },
}));

const { healthHandler } = await import('./health.js');
const { db } = await import('../db/client.js');

function buildApp(): Hono {
  // Reproduce the PUBLIC mount from server/index.ts. NO JWT middleware —
  // this endpoint is unauthenticated by design (Phase 4 D-06 / Phase 8 D-17).
  const app = new Hono();
  app.get('/api/health', healthHandler);
  return app;
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.mocked(db.execute).mockReset();
  });

  it("returns 200 + {status:'ok', db:'ok'} when db.execute resolves", async () => {
    // Drizzle's node-postgres execute resolves to a QueryResult-ish object;
    // the handler only cares that the promise resolves.
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never);
    const res = await buildApp().request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok', db: 'ok' });
  });

  it("returns 503 + {status:'error', db:'unreachable'} when db.execute rejects", async () => {
    vi.mocked(db.execute).mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 127.0.0.1:5432'),
    );
    const res = await buildApp().request('/api/health');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ status: 'error', db: 'unreachable' });
  });

  it('calls db.execute exactly once per request', async () => {
    // Regression guard: prevents future refactors from accidentally
    // double-pinging Postgres per probe. Phase 7's timeline.conf does NOT
    // cache /api/* anyway; the assertion still documents intent.
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never);
    await buildApp().request('/api/health');
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('is reachable WITHOUT an Authorization header (no-auth regression)', async () => {
    // Mirrors handlesCheck.test.ts:112-118 — protects against a future bulk
    // app.use('/api/*', requireJwt, ...) that would silently 401 the probe.
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never);
    const res = await buildApp().request('/api/health');
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
  });
});
