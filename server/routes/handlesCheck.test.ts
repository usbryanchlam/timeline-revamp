import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';

// MUST set env BEFORE dynamic imports — server/env.ts validates synchronously
// and process.exit(1) on failure. /api/handles/check is PUBLIC (no JWT setup
// needed), so we don't mint tokens here. But env still has to satisfy zod.
process.env.AUTH0_DOMAIN = 'test.auth0.com';
process.env.AUTH0_AUDIENCE = 'https://api.test.example';

const { handlesCheckHandler } = await import('./handlesCheck.js');
const { db } = await import('../db/client.js');
const { users } = await import('../db/schema.js');

const SUB_TEST = 'auth0|test-handles-check';

function buildApp(): Hono {
  // Reproduce the PUBLIC mount from server/index.ts. NO JWT middleware —
  // this endpoint is unauthenticated by design (Phase 7 D-04).
  const app = new Hono();
  app.get('/api/handles/check', handlesCheckHandler);
  return app;
}

async function cleanup(): Promise<void> {
  await db.delete(users).where(eq(users.auth0Sub, SUB_TEST));
}

async function seedTakenHandle(handle: string): Promise<void> {
  await db.insert(users).values({
    auth0Sub: SUB_TEST,
    email: 'test-handles-check@local',
    handle,
  });
}

describe('GET /api/handles/check', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('returns 200 { available: true } for an available handle', async () => {
    const res = await buildApp().request('/api/handles/check?candidate=bryan-new');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ available: true });
    // Test 7: Cache-Control header on every response (D-04).
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns { available: false, reason: "taken" } when handle exists', async () => {
    await seedTakenHandle('bryan-taken');
    const res = await buildApp().request('/api/handles/check?candidate=bryan-taken');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: 'taken' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns { available: false, reason: "too_short" } for 2-char candidate', async () => {
    const res = await buildApp().request('/api/handles/check?candidate=ab');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: 'too_short' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns { available: false, reason: "too_long" } for 21+ char candidate', async () => {
    // 22 chars
    const res = await buildApp().request('/api/handles/check?candidate=aaaaaaaaaaaaaaaaaaaaaa');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: 'too_long' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns { available: false, reason: "invalid_chars" } for candidate with punctuation', async () => {
    const res = await buildApp().request(
      `/api/handles/check?candidate=${encodeURIComponent('Bryan!')}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: 'invalid_chars' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns { available: false, reason: "reserved" } for reserved word', async () => {
    const res = await buildApp().request('/api/handles/check?candidate=admin');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: 'reserved' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns Cache-Control: no-store on every response (D-04, regression)', async () => {
    // Spot-check three branches: available, taken, validation failure.
    const r1 = await buildApp().request('/api/handles/check?candidate=fresh-handle');
    expect(r1.headers.get('Cache-Control')).toBe('no-store');

    await seedTakenHandle('cached-test');
    const r2 = await buildApp().request('/api/handles/check?candidate=cached-test');
    expect(r2.headers.get('Cache-Control')).toBe('no-store');

    const r3 = await buildApp().request('/api/handles/check?candidate=admin');
    expect(r3.headers.get('Cache-Control')).toBe('no-store');
  });

  it('is reachable WITHOUT an Authorization header (no-auth regression)', async () => {
    // Explicit regression guard: future refactors that add bulk /api/*
    // middleware would 401 this. Request omits Authorization entirely.
    const res = await buildApp().request('/api/handles/check?candidate=public-test');
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
  });

  it('returns { available: false, reason: "invalid_chars" } when ?candidate= is missing', async () => {
    // Picker UI treats any non-available as "not yet" — server doesn't
    // 422 the picker; it returns a parseable JSON the hook can render.
    const res = await buildApp().request('/api/handles/check');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: 'invalid_chars' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('treats mixed-case input the same as lowercase (case-insensitive)', async () => {
    // validateHandle lowercases before lookup, so Bryan and bryan are
    // the same check. Verify by seeding "bryan" and asking for "Bryan".
    await seedTakenHandle('bryan');
    const res = await buildApp().request('/api/handles/check?candidate=Bryan');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: 'taken' });
  });
});
