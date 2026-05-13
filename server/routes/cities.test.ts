import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  type CryptoKey,
  type JWK,
} from 'jose';

// MUST set env BEFORE the dynamic imports below. server/env.ts validates
// synchronously via zod and process.exit(1) on failure — if these aren't
// set first, the test runner dies. Mirrors server/auth/jwt.test.ts:16-18.
//
// DATABASE_URL is intentionally NOT set here — server/env.ts will load
// it from .env.local where the dev-mode dockerized Postgres credentials
// live. Hardcoding a placeholder would override .env.local (dotenv
// honors process.env first) and the DB queries below would fail.
process.env.AUTH0_DOMAIN = 'test.auth0.com';
process.env.AUTH0_AUDIENCE = 'https://api.test.example';

const { requireJwt, __setJwksGetterForTest } = await import('../auth/jwt.js');
const { lazyProvisionUser } = await import('../auth/lazyProvision.js');
const { citiesRouter } = await import('./cities.js');
const { db } = await import('../db/client.js');
const { cities, users } = await import('../db/schema.js');
// Side-effect import to register Hono ContextVariableMap augmentation.
await import('../auth/context.js');

const KID = 'test-key-1';
const ISSUER = 'https://test.auth0.com/';
const AUDIENCE = 'https://api.test.example';

const SUB_A = 'auth0|user-a';
const SUB_B = 'auth0|user-b';
const EMAIL_A = 'user-a@example.com';
const EMAIL_B = 'user-b@example.com';

let signKey: CryptoKey;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  signKey = privateKey;
  const jwk: JWK = await exportJWK(publicKey);
  jwk.kid = KID;
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const localGetter = createLocalJWKSet({ keys: [jwk] });
  __setJwksGetterForTest(localGetter as never);
});

async function mint(opts: { sub: string; email: string }): Promise<string> {
  return await new SignJWT({ email: opts.email })
    .setProtectedHeader({ alg: 'RS256', kid: KID, typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(opts.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(signKey);
}

function buildApp(): Hono {
  // Reproduce the production middleware chain from server/index.ts so
  // c.var.user is populated by lazyProvisionUser before citiesRouter
  // handlers run.
  const app = new Hono();
  app.use('/api/cities', requireJwt, lazyProvisionUser);
  app.use('/api/cities/*', requireJwt, lazyProvisionUser);
  app.route('/api/cities', citiesRouter);
  return app;
}

// Cleanup helper. FK CASCADE on cities.user_id means deleting users
// also deletes their cities — but we delete cities explicitly first
// in case the test left orphans from a partial run.
async function cleanup(): Promise<void> {
  await db.delete(users).where(inArray(users.auth0Sub, [SUB_A, SUB_B]));
}

describe('GET /api/cities (05-01 task 1)', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('returns 401 with no Authorization header', async () => {
    const res = await buildApp().request('/api/cities');
    expect(res.status).toBe(401);
  });

  it('returns 200 [] for a user with zero cities', async () => {
    // First request will lazy-provision user B, who owns no cities.
    const tokenB = await mint({ sub: SUB_B, email: EMAIL_B });
    const res = await buildApp().request('/api/cities', {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toEqual([]);
  });

  it('returns the user\'s cities ordered by order_index ASC', async () => {
    // Provision user A by hitting any authenticated endpoint, then
    // seed cities directly via db so we control order_index.
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    await buildApp().request('/api/cities', {
      headers: { authorization: `Bearer ${tokenA}` },
    });

    const [userA] = await db.select().from(users).where(eq(users.auth0Sub, SUB_A));
    expect(userA).toBeDefined();
    if (!userA) throw new Error('test setup failed: user A missing');

    // Seed in REVERSE order to verify ORDER BY actually sorts.
    const arrivedAt = new Date('2025-01-01T00:00:00Z');
    await db.insert(cities).values([
      {
        userId: userA.id,
        orderIndex: 2,
        name: 'Tokyo',
        lat: 35.68, lng: 139.69, zoom: 11, pitch: 45, bearing: 0,
        arrivedAt,
      },
      {
        userId: userA.id,
        orderIndex: 0,
        name: 'Paris',
        lat: 48.85, lng: 2.35, zoom: 11, pitch: 45, bearing: 0,
        arrivedAt,
      },
      {
        userId: userA.id,
        orderIndex: 1,
        name: 'Lima',
        lat: -12.04, lng: -77.04, zoom: 11, pitch: 45, bearing: 0,
        arrivedAt,
      },
    ]);

    const res = await buildApp().request('/api/cities', {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; orderIndex: number }[];
    expect(body.map((c) => c.name)).toEqual(['Paris', 'Lima', 'Tokyo']);
  });

  it('returns the row on GET /:id when it belongs to the requester', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    // Provision A.
    await buildApp().request('/api/cities', {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const [userA] = await db.select().from(users).where(eq(users.auth0Sub, SUB_A));
    if (!userA) throw new Error('test setup failed: user A missing');

    const [seeded] = await db.insert(cities).values({
      userId: userA.id,
      orderIndex: 0,
      name: 'Paris',
      lat: 48.85, lng: 2.35, zoom: 11, pitch: 45, bearing: 0,
      arrivedAt: new Date('2025-01-01T00:00:00Z'),
    }).returning();
    if (!seeded) throw new Error('test setup failed: city missing');

    const res = await buildApp().request(`/api/cities/${seeded.id}`, {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string };
    expect(body.id).toBe(seeded.id);
    expect(body.name).toBe('Paris');
  });

  it('returns 404 on GET /:id when the row belongs to ANOTHER user', async () => {
    // Seed a city for A.
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    await buildApp().request('/api/cities', {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const [userA] = await db.select().from(users).where(eq(users.auth0Sub, SUB_A));
    if (!userA) throw new Error('test setup failed: user A missing');

    const [seeded] = await db.insert(cities).values({
      userId: userA.id,
      orderIndex: 0,
      name: 'Paris',
      lat: 48.85, lng: 2.35, zoom: 11, pitch: 45, bearing: 0,
      arrivedAt: new Date('2025-01-01T00:00:00Z'),
    }).returning();
    if (!seeded) throw new Error('test setup failed: city missing');

    // User B asks for A's city — must get 404, NOT 200 or 403.
    const tokenB = await mint({ sub: SUB_B, email: EMAIL_B });
    const res = await buildApp().request(`/api/cities/${seeded.id}`, {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 on GET /:id when the id is a malformed UUID', async () => {
    const token = await mint({ sub: SUB_A, email: EMAIL_A });
    const res = await buildApp().request('/api/cities/not-a-uuid', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/cities (05-02 task 1)', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  // Minimal valid body shared across the validation tests. Defaults for
  // zoom/pitch/bearing come from createCitySchema, so the request body
  // is intentionally small.
  const validBody = (): Record<string, unknown> => ({
    name: 'Tokyo',
    lat: 35.6812,
    lng: 139.7671,
    arrivedAt: '2025-01-15T00:00:00Z',
    caption: 'arrived',
  });

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  it('returns 401 with no Authorization header', async () => {
    const res = await buildApp().request('/api/cities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody()),
    });
    expect(res.status).toBe(401);
  });

  it('creates a city for a fresh user → 201, orderIndex 0, userId === me.id', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const res = await buildApp().request('/api/cities', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(validBody()),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      userId: string;
      orderIndex: number;
      name: string;
    };
    expect(body.id).toMatch(UUID_RE);
    expect(body.orderIndex).toBe(0);
    expect(body.name).toBe('Tokyo');

    const [userA] = await db.select().from(users).where(eq(users.auth0Sub, SUB_A));
    if (!userA) throw new Error('test setup failed: user A missing');
    expect(body.userId).toBe(userA.id);
  });

  it('assigns orderIndex 1 to a second POST from the same user', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const app = buildApp();

    const r1 = await app.request('/api/cities', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...validBody(), name: 'First' }),
    });
    expect(r1.status).toBe(201);

    const r2 = await app.request('/api/cities', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...validBody(), name: 'Second' }),
    });
    expect(r2.status).toBe(201);
    const body = (await r2.json()) as { orderIndex: number; name: string };
    expect(body.orderIndex).toBe(1);
    expect(body.name).toBe('Second');
  });

  it('rejects client-supplied orderIndex with 422 (strict mode)', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const res = await buildApp().request('/api/cities', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...validBody(), orderIndex: 99 }),
    });
    expect(res.status).toBe(422);
  });

  it('rejects out-of-range lat with 422', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const res = await buildApp().request('/api/cities', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...validBody(), lat: 91 }),
    });
    expect(res.status).toBe(422);
  });

  it('rejects empty body with 422 (missing required fields)', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const res = await buildApp().request('/api/cities', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
  });

  it('concurrent POSTs admit both [201,201] and [201,409] (DEFERRABLE COMMIT-conflict contract)', async () => {
    // Seed user A with 3 pre-existing cities at orderIndex 0,1,2.
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const app = buildApp();
    // Provision A.
    await app.request('/api/cities', {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const [userA] = await db.select().from(users).where(eq(users.auth0Sub, SUB_A));
    if (!userA) throw new Error('test setup failed: user A missing');

    const arrivedAt = new Date('2025-01-01T00:00:00Z');
    await db.insert(cities).values([
      { userId: userA.id, orderIndex: 0, name: 'Seed0', lat: 0, lng: 0, zoom: 12, pitch: 50, bearing: 0, arrivedAt },
      { userId: userA.id, orderIndex: 1, name: 'Seed1', lat: 0, lng: 0, zoom: 12, pitch: 50, bearing: 0, arrivedAt },
      { userId: userA.id, orderIndex: 2, name: 'Seed2', lat: 0, lng: 0, zoom: 12, pitch: 50, bearing: 0, arrivedAt },
    ]);

    // Fire two concurrent POSTs. Each should land at orderIndex 3 then 4
    // (transaction serialization) OR one wins and the other catches 23505
    // at COMMIT and returns 409.
    const [res1, res2] = await Promise.all([
      app.request('/api/cities', {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...validBody(), name: 'RaceA' }),
      }),
      app.request('/api/cities', {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...validBody(), name: 'RaceB' }),
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // see plan 05-02 Task 1: DEFERRABLE COMMIT-conflict admits both outcomes.
    // DO NOT tighten to expect(both).toBe(201). Postgres may serialize the
    // two transactions either way; both [201,201] and [201,409] satisfy
    // the contract and excluding either masks a legitimate code path.
    expect([JSON.stringify([201, 201]), JSON.stringify([201, 409])]).toContain(
      JSON.stringify(statuses),
    );

    // Regardless of outcome, the DB should have NO duplicate orderIndex
    // values for this user. If both succeeded → indexes [0,1,2,3,4].
    // If one succeeded → [0,1,2,3]. Either way: no duplicates, no gap
    // below the new max.
    const rows = await db.select().from(cities).where(eq(cities.userId, userA.id));
    const indexes = rows.map((r) => r.orderIndex).sort((a, b) => a - b);
    expect(new Set(indexes).size).toBe(indexes.length); // no duplicates
    if (statuses[1] === 201) {
      expect(indexes).toEqual([0, 1, 2, 3, 4]);
    } else {
      expect(indexes).toEqual([0, 1, 2, 3]);
    }
  });
});

describe('PATCH /api/cities/:id (05-02 task 2)', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  // Seed a single city for user A and return { tokenA, userA, seeded }.
  // Mirrors the inline seeding done in the GET /:id tests above but
  // shared so the PATCH/DELETE tests stay focused on the assertion.
  async function seedCityForA(): Promise<{
    tokenA: string;
    userAId: string;
    seededId: string;
    seededUpdatedAt: Date;
  }> {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    // Provision user A by hitting an authenticated endpoint.
    await buildApp().request('/api/cities', {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const [userA] = await db.select().from(users).where(eq(users.auth0Sub, SUB_A));
    if (!userA) throw new Error('test setup failed: user A missing');
    const [seeded] = await db.insert(cities).values({
      userId: userA.id,
      orderIndex: 0,
      name: 'Paris',
      lat: 48.85,
      lng: 2.35,
      zoom: 11,
      pitch: 45,
      bearing: 0,
      arrivedAt: new Date('2025-01-01T00:00:00Z'),
      caption: 'original caption',
    }).returning();
    if (!seeded) throw new Error('test setup failed: city missing');
    return {
      tokenA,
      userAId: userA.id,
      seededId: seeded.id,
      seededUpdatedAt: seeded.updatedAt,
    };
  }

  it('PATCH with valid partial body → 200, only the patched field changes, updatedAt strictly advances', async () => {
    const { tokenA, seededId, seededUpdatedAt } = await seedCityForA();

    // Make sure enough wall-clock passes that a fresh Date() will be
    // strictly greater than the seeded value. Postgres `timestamp` columns
    // are microsecond precision, but JS Date.getTime() is millisecond
    // resolution and Postgres rounds the stored value, so we need a
    // comfortable gap to avoid a same-ms tie under fast CI.
    await new Promise((r) => setTimeout(r, 50));

    const res = await buildApp().request(`/api/cities/${seededId}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ caption: 'new caption' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      name: string;
      caption: string | null;
      lat: number;
      lng: number;
      updatedAt: string;
    };
    expect(body.id).toBe(seededId);
    expect(body.caption).toBe('new caption');
    // Unchanged fields stay put.
    expect(body.name).toBe('Paris');
    expect(body.lat).toBe(48.85);
    expect(body.lng).toBe(2.35);
    // updatedAt must strictly advance.
    expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(
      seededUpdatedAt.getTime(),
    );
  });

  it('rejects orderIndex in PATCH body with 422 (strict mode — server is authoritative on ordering)', async () => {
    const { tokenA, seededId } = await seedCityForA();
    const res = await buildApp().request(`/api/cities/${seededId}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ orderIndex: 99 }),
    });
    expect(res.status).toBe(422);
  });

  it('rejects unknown key id in PATCH body with 422 (mass-assignment defense)', async () => {
    const { tokenA, seededId } = await seedCityForA();
    const res = await buildApp().request(`/api/cities/${seededId}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ id: 'foo' }),
    });
    expect(res.status).toBe(422);
  });

  it('PATCH of another user\'s row → 404 AND the row is UNCHANGED in the DB (cross-user mutation safety)', async () => {
    // Seed a city owned by user A.
    const { seededId, seededUpdatedAt } = await seedCityForA();
    // Capture the full pre-state for a deep equality check after the
    // attempted cross-user PATCH.
    const [before] = await db.select().from(cities).where(eq(cities.id, seededId));
    if (!before) throw new Error('test setup failed: pre-state row missing');

    // User B attempts to PATCH user A's city.
    const tokenB = await mint({ sub: SUB_B, email: EMAIL_B });
    const res = await buildApp().request(`/api/cities/${seededId}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenB}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ caption: 'pwned by B' }),
    });
    expect(res.status).toBe(404);

    // CRITICAL: GET the row as the actual owner (user A) and verify the
    // row in the DB is unchanged. This proves the WHERE filter blocks
    // the mutation at the SQL layer, not just the response.
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const ownerGet = await buildApp().request(`/api/cities/${seededId}`, {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(ownerGet.status).toBe(200);
    const owned = (await ownerGet.json()) as {
      id: string;
      caption: string | null;
      updatedAt: string;
    };
    expect(owned.id).toBe(seededId);
    expect(owned.caption).toBe('original caption');
    // updatedAt should not have advanced past the seed value.
    expect(new Date(owned.updatedAt).getTime()).toBe(seededUpdatedAt.getTime());
  });

  it('PATCH /api/cities/not-a-uuid with valid body → 404 (collapses Postgres 22P02 to not_found)', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const res = await buildApp().request('/api/cities/not-a-uuid', {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ caption: 'whatever' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/cities/:id (05-02 task 2)', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  async function seedCityForA(): Promise<{ tokenA: string; seededId: string }> {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    await buildApp().request('/api/cities', {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const [userA] = await db.select().from(users).where(eq(users.auth0Sub, SUB_A));
    if (!userA) throw new Error('test setup failed: user A missing');
    const [seeded] = await db.insert(cities).values({
      userId: userA.id,
      orderIndex: 0,
      name: 'Paris',
      lat: 48.85,
      lng: 2.35,
      zoom: 11,
      pitch: 45,
      bearing: 0,
      arrivedAt: new Date('2025-01-01T00:00:00Z'),
    }).returning();
    if (!seeded) throw new Error('test setup failed: city missing');
    return { tokenA, seededId: seeded.id };
  }

  it('DELETE owned row → 204 empty body, then GET /:id as owner → 404 (row is gone)', async () => {
    const { tokenA, seededId } = await seedCityForA();
    const app = buildApp();

    const del = await app.request(`/api/cities/${seededId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(del.status).toBe(204);
    // 204 must carry an empty body.
    const text = await del.text();
    expect(text).toBe('');

    // Row really is gone — GET as the same owner returns 404.
    const followup = await app.request(`/api/cities/${seededId}`, {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(followup.status).toBe(404);
  });

  it('DELETE another user\'s row → 404 AND the row STILL EXISTS unchanged (cross-user delete safety)', async () => {
    const { tokenA, seededId } = await seedCityForA();

    // Capture pre-state to compare after the attempted cross-user delete.
    const [before] = await db.select().from(cities).where(eq(cities.id, seededId));
    if (!before) throw new Error('test setup failed: pre-state row missing');

    // User B attempts to DELETE user A's city.
    const tokenB = await mint({ sub: SUB_B, email: EMAIL_B });
    const res = await buildApp().request(`/api/cities/${seededId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.status).toBe(404);

    // CRITICAL: GET the row as the owner and verify it still exists.
    const ownerGet = await buildApp().request(`/api/cities/${seededId}`, {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(ownerGet.status).toBe(200);
    const owned = (await ownerGet.json()) as {
      id: string;
      name: string;
      updatedAt: string;
    };
    expect(owned.id).toBe(seededId);
    expect(owned.name).toBe('Paris');
    // updatedAt unchanged — no mutation happened.
    expect(new Date(owned.updatedAt).getTime()).toBe(before.updatedAt.getTime());
  });

  it('DELETE a valid-format UUID with no matching row → 404', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const res = await buildApp().request(
      '/api/cities/00000000-0000-0000-0000-000000000000',
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${tokenA}` },
      },
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/cities/reorder (05-03 task 1)', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  // Seed user A with `count` cities at orderIndex 0..count-1. Returns the
  // seeded rows in seed order so tests can address them by index.
  async function seedNCitiesForA(count: number): Promise<{
    tokenA: string;
    userAId: string;
    seededIds: string[];
  }> {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    // Provision A.
    await buildApp().request('/api/cities', {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const [userA] = await db.select().from(users).where(eq(users.auth0Sub, SUB_A));
    if (!userA) throw new Error('test setup failed: user A missing');

    const arrivedAt = new Date('2025-01-01T00:00:00Z');
    const values = Array.from({ length: count }, (_, i) => ({
      userId: userA.id,
      orderIndex: i,
      name: `City${i}`,
      lat: 0,
      lng: 0,
      zoom: 12,
      pitch: 50,
      bearing: 0,
      arrivedAt,
    }));
    const seeded = await db.insert(cities).values(values).returning();
    return {
      tokenA,
      userAId: userA.id,
      seededIds: seeded.map((r) => r.id),
    };
  }

  it('happy path: reorders cities and follow-up GET returns new order', async () => {
    const { tokenA, seededIds } = await seedNCitiesForA(3);
    const [idA, idB, idC] = seededIds;

    const app = buildApp();
    const res = await app.request('/api/cities/reorder', {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          { id: idA, orderIndex: 2 },
          { id: idB, orderIndex: 0 },
          { id: idC, orderIndex: 1 },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const followup = await app.request('/api/cities', {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(followup.status).toBe(200);
    const rows = (await followup.json()) as { id: string; orderIndex: number }[];
    // Server orders by orderIndex ASC: B(0), C(1), A(2).
    expect(rows.map((r) => r.id)).toEqual([idB, idC, idA]);
    expect(rows.map((r) => r.orderIndex)).toEqual([0, 1, 2]);
  });

  it('foreign id in body → 404 and BOTH users\' rows are unchanged (transaction rolled back)', async () => {
    // Seed A with 2 cities.
    const { tokenA, seededIds: aIds } = await seedNCitiesForA(2);
    const [userARow] = await db.select().from(users).where(eq(users.auth0Sub, SUB_A));
    if (!userARow) throw new Error('test setup failed: user A missing');

    // Provision B and seed one city for B.
    const tokenB = await mint({ sub: SUB_B, email: EMAIL_B });
    await buildApp().request('/api/cities', {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    const [userB] = await db.select().from(users).where(eq(users.auth0Sub, SUB_B));
    if (!userB) throw new Error('test setup failed: user B missing');
    const [bCity] = await db.insert(cities).values({
      userId: userB.id,
      orderIndex: 0,
      name: 'B-City',
      lat: 0, lng: 0, zoom: 12, pitch: 50, bearing: 0,
      arrivedAt: new Date('2025-01-01T00:00:00Z'),
    }).returning();
    if (!bCity) throw new Error('test setup failed: B city missing');

    // Snapshot pre-state for both users.
    const beforeA = await db.select().from(cities).where(eq(cities.userId, userARow.id));
    const beforeB = await db.select().from(cities).where(eq(cities.id, bCity.id));

    // User A sends a payload that includes user B's city id (replacing one
    // of A's). The body still has 2 items (matching A's count) so we get
    // past the size check and hit the foreign-id branch → 404.
    const app = buildApp();
    const res = await app.request('/api/cities/reorder', {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          { id: aIds[0], orderIndex: 0 },
          { id: bCity.id, orderIndex: 1 },
        ],
      }),
    });
    expect(res.status).toBe(404);

    // User B's row is unchanged.
    const getB = await app.request(`/api/cities/${bCity.id}`, {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(getB.status).toBe(200);
    const bAfter = (await getB.json()) as { id: string; orderIndex: number; updatedAt: string };
    expect(bAfter.orderIndex).toBe(0);
    expect(new Date(bAfter.updatedAt).getTime()).toBe(beforeB[0]!.updatedAt.getTime());

    // User A's rows are also unchanged — pre-flight returned 404 before
    // db.transaction() ever opened. Verify by reading current state.
    const getA = await app.request('/api/cities', {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const aAfter = (await getA.json()) as { id: string; orderIndex: number }[];
    const aAfterMap = new Map(aAfter.map((r) => [r.id, r.orderIndex]));
    for (const row of beforeA) {
      expect(aAfterMap.get(row.id)).toBe(row.orderIndex);
    }
  });

  it('missing one of the user\'s cities → 422 must_include_all_cities', async () => {
    const { tokenA, seededIds } = await seedNCitiesForA(3);
    // Send only 2 of A's 3 cities.
    const res = await buildApp().request('/api/cities/reorder', {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          { id: seededIds[0], orderIndex: 0 },
          { id: seededIds[1], orderIndex: 1 },
        ],
      }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; reason?: string };
    expect(body.error).toBe('invalid_input');
    expect(body.reason).toBe('must_include_all_cities');
  });

  it('duplicate orderIndex in body → 422 (Zod superRefine)', async () => {
    const { tokenA, seededIds } = await seedNCitiesForA(2);
    const res = await buildApp().request('/api/cities/reorder', {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          { id: seededIds[0], orderIndex: 1 },
          { id: seededIds[1], orderIndex: 1 },
        ],
      }),
    });
    expect(res.status).toBe(422);
  });

  it('duplicate id in body → 422 (Zod superRefine)', async () => {
    const { tokenA, seededIds } = await seedNCitiesForA(3);
    const res = await buildApp().request('/api/cities/reorder', {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          { id: seededIds[0], orderIndex: 0 },
          { id: seededIds[0], orderIndex: 1 },
          { id: seededIds[1], orderIndex: 2 },
        ],
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string; issues: Array<{ message: string }> };
    expect(body.error).toBe('invalid_input');
    expect(body.issues.some((i) => i.message.includes('duplicate id'))).toBe(true);
  });

  it('gap in orderIndex set [0, 2, 3] → 422 (must be 0..n-1)', async () => {
    const { tokenA, seededIds } = await seedNCitiesForA(3);
    const res = await buildApp().request('/api/cities/reorder', {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          { id: seededIds[0], orderIndex: 0 },
          { id: seededIds[1], orderIndex: 2 },
          { id: seededIds[2], orderIndex: 3 },
        ],
      }),
    });
    expect(res.status).toBe(422);
  });

  it('two-row swap proves DEFERRABLE constraint (200, not 23505 mid-transaction)', async () => {
    // Seed A,B at orderIndex 0,1. Swap to A:1, B:0.
    //
    // If the constraint were NOT deferrable, the first UPDATE (e.g.,
    // A.orderIndex 0 → 1) would create two rows at orderIndex=1 (A and B)
    // and Postgres would throw 23505 mid-transaction. DEFERRABLE INITIALLY
    // DEFERRED defers the uniqueness check to COMMIT, when the final state
    // is A:1, B:0 — no duplicates. A 200 response proves the constraint
    // was checked at COMMIT, not after each UPDATE.
    const { tokenA, seededIds } = await seedNCitiesForA(2);
    const [idA, idB] = seededIds;

    const app = buildApp();
    const res = await app.request('/api/cities/reorder', {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          { id: idA, orderIndex: 1 },
          { id: idB, orderIndex: 0 },
        ],
      }),
    });
    expect(res.status).toBe(200);

    const followup = await app.request('/api/cities', {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const rows = (await followup.json()) as { id: string; orderIndex: number }[];
    // After swap: B at 0, A at 1.
    expect(rows.map((r) => r.id)).toEqual([idB, idA]);
  });

  it('returns 401 with no Authorization header', async () => {
    const res = await buildApp().request('/api/cities/reorder', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });
    expect(res.status).toBe(401);
  });

  it('routes /reorder before /:id (regression guard)', async () => {
    // If /reorder were accidentally captured by /:id, this body would be
    // parsed by updateCitySchema (which is .strict()) and rejected as
    // invalid_input (items is not an allowed key), returning 422 from the
    // wrong handler. A 200 response proves /reorder matched first.
    const { tokenA, seededIds } = await seedNCitiesForA(1);
    const res = await buildApp().request('/api/cities/reorder', {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ id: seededIds[0], orderIndex: 0 }],
      }),
    });
    expect(res.status).toBe(200);
  });
});
