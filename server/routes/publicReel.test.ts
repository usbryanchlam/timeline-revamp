import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { inArray } from 'drizzle-orm';

// MUST set env BEFORE the dynamic imports below. server/env.ts validates
// synchronously and process.exit(1) on failure. /api/public/u/:handle is
// PUBLIC (no JWT), so we don't mint tokens. Mirrors handlesCheck.test.ts.
process.env.AUTH0_DOMAIN = 'test.auth0.com';
process.env.AUTH0_AUDIENCE = 'https://api.test.example';

// Stub OCI env so getPublicUrl returns deterministic URLs. The OCI client
// is lazy-constructed only on calls that use the SDK (createWritePar,
// makeThumbAndPut); getPublicUrl is a pure string construction off the
// env vars, so we don't need __setOciClientForTest here.
process.env.OCI_NAMESPACE = 'test-ns';
process.env.OCI_BUCKET_NAME = 'test-bucket';
process.env.OCI_REGION = 'us-test-1';

const { publicReelRouter } = await import('./publicReel.js');
const { db } = await import('../db/client.js');
const { users, cities, photos } = await import('../db/schema.js');

const SUB_A = 'auth0|public-test-A';
const SUB_B = 'auth0|public-test-B';
const HANDLE_A = 'bryan-public-test';
const HANDLE_B = 'empty-public-test';

function buildApp(): Hono {
  // Reproduce the PUBLIC mount from server/index.ts. NO JWT middleware.
  const app = new Hono();
  app.route('/api/public/u', publicReelRouter);
  return app;
}

async function cleanup(): Promise<void> {
  await db
    .delete(users)
    .where(inArray(users.auth0Sub, [SUB_A, SUB_B]));
  // photos and cities cascade-delete via FK on users.id.
}

interface SeedResult {
  readonly userAId: string;
  readonly userBId: string;
  readonly cityIds: readonly string[];
  readonly readyPhotoCount: number;
}

async function seed(): Promise<SeedResult> {
  // User A: 3 cities, 5 photos (3 ready, 1 pending, 1 failed).
  const [userA] = await db
    .insert(users)
    .values({ auth0Sub: SUB_A, email: 'a@local', handle: HANDLE_A })
    .returning();
  if (!userA) throw new Error('seed: userA insert failed');

  // User B: 0 cities, 0 photos — exists with handle so 200 + empty arrays.
  const [userB] = await db
    .insert(users)
    .values({ auth0Sub: SUB_B, email: 'b@local', handle: HANDLE_B })
    .returning();
  if (!userB) throw new Error('seed: userB insert failed');

  const arrivedAt = new Date('2024-01-01T00:00:00Z');
  const cityRows = await db
    .insert(cities)
    .values([
      {
        userId: userA.id,
        orderIndex: 0,
        name: 'Tokyo',
        tripLabel: null,
        lat: 35.68,
        lng: 139.76,
        zoom: 12,
        pitch: 45,
        bearing: 0,
        arrivedAt,
        caption: 'first',
      },
      {
        userId: userA.id,
        orderIndex: 1,
        name: 'Kyoto',
        tripLabel: 'Japan 2024',
        lat: 35.01,
        lng: 135.76,
        zoom: 13,
        pitch: 50,
        bearing: 10,
        arrivedAt,
        caption: 'second',
      },
      {
        userId: userA.id,
        orderIndex: 2,
        name: 'Osaka',
        tripLabel: 'Japan 2024',
        lat: 34.69,
        lng: 135.5,
        zoom: 13,
        pitch: 55,
        bearing: 20,
        arrivedAt,
        caption: 'third',
      },
    ])
    .returning();
  if (cityRows.length !== 3) throw new Error('seed: cities insert failed');

  // 5 photos: 3 ready (spread across cities), 1 pending, 1 failed.
  await db.insert(photos).values([
    {
      cityId: cityRows[0]!.id,
      userId: userA.id,
      status: 'ready',
      masterKey: 'photos/a-1.jpg',
      thumbKey: 'photos/a-1-thumb.jpg',
      orderIndex: 0,
    },
    {
      cityId: cityRows[0]!.id,
      userId: userA.id,
      status: 'ready',
      masterKey: 'photos/a-2.jpg',
      thumbKey: 'photos/a-2-thumb.jpg',
      orderIndex: 1,
    },
    {
      cityId: cityRows[1]!.id,
      userId: userA.id,
      status: 'ready',
      masterKey: 'photos/a-3.jpg',
      thumbKey: 'photos/a-3-thumb.jpg',
      orderIndex: 0,
    },
    {
      cityId: cityRows[2]!.id,
      userId: userA.id,
      status: 'pending',
      masterKey: 'photos/a-pending.jpg',
      thumbKey: null,
      orderIndex: 0,
    },
    {
      cityId: cityRows[2]!.id,
      userId: userA.id,
      status: 'failed',
      masterKey: 'photos/a-failed.jpg',
      thumbKey: null,
      orderIndex: 1,
    },
  ]);

  return {
    userAId: userA.id,
    userBId: userB.id,
    cityIds: cityRows.map((r) => r.id),
    readyPhotoCount: 3,
  };
}

beforeAll(async () => {
  await cleanup();
});

describe('GET /api/public/u/:handle', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('returns 200 with { user, cities, photos } for a known handle', async () => {
    const seeded = await seed();
    const res = await buildApp().request(`/api/public/u/${HANDLE_A}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=300, s-maxage=300',
    );
    const body = (await res.json()) as {
      user: { handle: string; displayName: null };
      cities: ReadonlyArray<{ id: string }>;
      photos: ReadonlyArray<{ id: string }>;
    };
    expect(body.user.handle).toBe(HANDLE_A);
    expect(body.user.displayName).toBeNull();
    expect(body.cities).toHaveLength(3);
    expect(body.photos).toHaveLength(seeded.readyPhotoCount);
  });

  it('returns 404 { error: "not_found" } with Cache-Control max-age=60 for unknown handle', async () => {
    const res = await buildApp().request('/api/public/u/nobody-here');
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
  });

  it('treats mixed-case URLs as the same handle (case-insensitive lookup)', async () => {
    await seed();
    const upper = `/api/public/u/${HANDLE_A.toUpperCase()}`;
    const lower = `/api/public/u/${HANDLE_A}`;
    const r1 = await buildApp().request(upper);
    const r2 = await buildApp().request(lower);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const b1 = (await r1.json()) as { user: { handle: string } };
    const b2 = (await r2.json()) as { user: { handle: string } };
    expect(b1.user.handle).toBe(b2.user.handle);
  });

  it('does NOT include email anywhere in the JSON response (DTO leakage guard)', async () => {
    await seed();
    const res = await buildApp().request(`/api/public/u/${HANDLE_A}`);
    const json = await res.json();
    expect(JSON.stringify(json).includes('"email"')).toBe(false);
  });

  it('does NOT include auth0Sub or auth0_sub anywhere in the JSON response', async () => {
    await seed();
    const res = await buildApp().request(`/api/public/u/${HANDLE_A}`);
    const json = await res.json();
    const text = JSON.stringify(json);
    expect(text.includes('"auth0Sub"')).toBe(false);
    expect(text.includes('"auth0_sub"')).toBe(false);
  });

  it('does NOT include raw masterKey or thumbKey fields on photos (only masterUrl/thumbUrl)', async () => {
    await seed();
    const res = await buildApp().request(`/api/public/u/${HANDLE_A}`);
    const json = await res.json();
    const text = JSON.stringify(json);
    expect(text.includes('"masterKey"')).toBe(false);
    expect(text.includes('"thumbKey"')).toBe(false);
    expect(text.includes('"master_key"')).toBe(false);
    expect(text.includes('"thumb_key"')).toBe(false);
    // Sanity: the substituted URL fields are present.
    expect(text.includes('"masterUrl"')).toBe(true);
    expect(text.includes('"thumbUrl"')).toBe(true);
  });

  it('filters out photos with status != "ready" (only ready photos surface)', async () => {
    const seeded = await seed();
    const res = await buildApp().request(`/api/public/u/${HANDLE_A}`);
    const body = (await res.json()) as { photos: ReadonlyArray<unknown> };
    // 5 total seeded; 1 pending + 1 failed must NOT appear.
    expect(body.photos).toHaveLength(seeded.readyPhotoCount);
  });

  it('returns 200 with NO Authorization header (no-auth regression)', async () => {
    await seed();
    const res = await buildApp().request(`/api/public/u/${HANDLE_A}`);
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
  });

  it('returns 200 even with an invalid Authorization header (route ignores it)', async () => {
    await seed();
    const res = await buildApp().request(`/api/public/u/${HANDLE_A}`, {
      headers: { authorization: 'Bearer garbage-string' },
    });
    expect(res.status).toBe(200);
  });

  it('returns photos as a flat array with { id, cityId, masterUrl, thumbUrl, orderIndex }', async () => {
    await seed();
    const res = await buildApp().request(`/api/public/u/${HANDLE_A}`);
    const body = (await res.json()) as {
      photos: ReadonlyArray<Record<string, unknown>>;
    };
    expect(Array.isArray(body.photos)).toBe(true);
    for (const p of body.photos) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.cityId).toBe('string');
      expect(typeof p.masterUrl).toBe('string');
      expect(typeof p.thumbUrl).toBe('string');
      expect(typeof p.orderIndex).toBe('number');
    }
  });

  it('returns 200 with empty cities and photos for a user with 0 cities (not 404)', async () => {
    await seed();
    const res = await buildApp().request(`/api/public/u/${HANDLE_B}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cities: ReadonlyArray<unknown>;
      photos: ReadonlyArray<unknown>;
    };
    expect(body.cities).toEqual([]);
    expect(body.photos).toEqual([]);
  });

  it('returns 404 for SQL-injection-shaped handle (parameterization regression)', async () => {
    await seed();
    const injected = `/api/public/u/${encodeURIComponent(`${HANDLE_A}';--`)}`;
    const res = await buildApp().request(injected);
    // The literal string is not a valid handle; no row matches; 404.
    expect(res.status).toBe(404);
  });
});
