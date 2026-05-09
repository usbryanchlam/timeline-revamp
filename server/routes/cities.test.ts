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
});
