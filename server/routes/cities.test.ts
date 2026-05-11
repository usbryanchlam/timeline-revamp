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
