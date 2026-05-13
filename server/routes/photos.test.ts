import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
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

// MUST set env BEFORE dynamic imports. server/env.ts validates synchronously
// via zod and process.exit(1) on failure — if these aren't set first, the
// test runner dies. Mirrors server/routes/cities.test.ts:16-22.
//
// DATABASE_URL is intentionally NOT set here — server/env.ts will load
// it from .env.local where the dev-mode dockerized Postgres credentials
// live. Hardcoding a placeholder would override .env.local (dotenv
// honors process.env first) and the DB queries below would fail.
process.env.AUTH0_DOMAIN = 'test.auth0.com';
process.env.AUTH0_AUDIENCE = 'https://api.test.example';

const { requireJwt, __setJwksGetterForTest } = await import('../auth/jwt.js');
const { lazyProvisionUser } = await import('../auth/lazyProvision.js');
const { photosRouter, photosNestedRouter, __setOciClientForTest } = await import('./photos.js');
const { db } = await import('../db/client.js');
const { photos, cities, users } = await import('../db/schema.js');
// Side-effect import to register Hono ContextVariableMap augmentation.
await import('../auth/context.js');

const KID = 'test-key-photos-1';
const ISSUER = 'https://test.auth0.com/';
const AUDIENCE = 'https://api.test.example';

const SUB_A = 'auth0|photos-user-a';
const SUB_B = 'auth0|photos-user-b';
const EMAIL_A = 'photos-user-a@example.com';
const EMAIL_B = 'photos-user-b@example.com';

let signKey: CryptoKey;

// Fake OCI client — captures createWritePar args, returns a deterministic URL.
// putThumb and getMasterBuffer are mocked so sharp never runs.
// getMasterBuffer returns JPEG magic bytes so sniffImageMime passes.
const FAKE_OCI = {
  createWritePar: vi.fn(async ({ objectName }: { objectName: string }) => ({
    uploadUrl: `https://oci.test/upload/${objectName}`,
  })),
  putThumb: vi.fn(async () => undefined),
  getMasterBuffer: vi.fn(async (_key: string): Promise<Buffer> =>
    // JPEG magic bytes — enough to satisfy sniffImageMime.
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
  ),
  makeThumbAndPut: vi.fn(async (_buf: Buffer, _thumbKey: string): Promise<void> => undefined),
  getPublicUrl: (_key: string) => `https://oci.test/public/${_key}`,
};

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  signKey = privateKey;
  const jwk: JWK = await exportJWK(publicKey);
  jwk.kid = KID;
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const localGetter = createLocalJWKSet({ keys: [jwk] });
  __setJwksGetterForTest(localGetter as never);
  __setOciClientForTest(FAKE_OCI);
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
  // c.var.user is populated by lazyProvisionUser before photosRouter handlers run.
  const app = new Hono();
  app.use('/api/photos', requireJwt, lazyProvisionUser);
  app.use('/api/photos/*', requireJwt, lazyProvisionUser);
  app.use('/api/cities', requireJwt, lazyProvisionUser);
  app.use('/api/cities/*', requireJwt, lazyProvisionUser);
  app.route('/api/photos', photosRouter);
  app.route('/api/cities/:cityId/photos', photosNestedRouter);
  return app;
}

// Cleanup helper. FK CASCADE: deleting users cascades to cities which
// cascades to photos. Delete by auth0Sub to keep tests isolated.
async function cleanup(): Promise<void> {
  await db.delete(users).where(inArray(users.auth0Sub, [SUB_A, SUB_B]));
}

// Seed a city for a given user id. Returns the seeded city id.
async function seedCity(userId: string, name = 'Paris'): Promise<string> {
  const [city] = await db.insert(cities).values({
    userId,
    orderIndex: 0,
    name,
    lat: 48.85,
    lng: 2.35,
    zoom: 11,
    pitch: 45,
    bearing: 0,
    arrivedAt: new Date('2025-01-01T00:00:00Z'),
  }).returning();
  if (!city) throw new Error('test setup: seedCity returned no row');
  return city.id;
}

// Provision user via any authenticated endpoint and return the user row id.
async function ensureUser(sub: string, token: string): Promise<string> {
  const app = buildApp();
  await app.request('/api/photos', { headers: { authorization: `Bearer ${token}` } });
  const [row] = await db.select().from(users).where(eq(users.auth0Sub, sub));
  if (!row) throw new Error(`test setup: user ${sub} not provisioned`);
  return row.id;
}

// ─── upload-url tests ──────────────────────────────────────────────

describe('POST /api/cities/:cityId/photos/upload-url', () => {
  beforeEach(async () => { await cleanup(); });
  afterEach(async () => { await cleanup(); });

  const validBody = (): Record<string, unknown> => ({
    contentType: 'image/jpeg',
    sizeBytes: 1_000_000,
  });

  it('returns 401 without JWT', async () => {
    const res = await buildApp().request(
      '/api/cities/00000000-0000-0000-0000-000000000001/photos/upload-url',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(validBody()) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when cityId belongs to a different user (ownership leak prevented)', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const tokenB = await mint({ sub: SUB_B, email: EMAIL_B });
    const userAId = await ensureUser(SUB_A, tokenA);
    const cityId = await seedCity(userAId, 'Paris');

    // User B tries to upload to user A's city.
    const res = await buildApp().request(
      `/api/cities/${cityId}/photos/upload-url`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
        body: JSON.stringify(validBody()),
      },
    );
    expect(res.status).toBe(404);
  });

  it('returns 422 when sizeBytes > 5_242_880', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const userAId = await ensureUser(SUB_A, tokenA);
    const cityId = await seedCity(userAId);

    const res = await buildApp().request(
      `/api/cities/${cityId}/photos/upload-url`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...validBody(), sizeBytes: 5_242_881 }),
      },
    );
    expect(res.status).toBe(422);
  });

  it('returns 422 when sizeBytes < 1', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const userAId = await ensureUser(SUB_A, tokenA);
    const cityId = await seedCity(userAId);

    const res = await buildApp().request(
      `/api/cities/${cityId}/photos/upload-url`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...validBody(), sizeBytes: 0 }),
      },
    );
    expect(res.status).toBe(422);
  });

  it('returns 422 when contentType is not in allowed list', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const userAId = await ensureUser(SUB_A, tokenA);
    const cityId = await seedCity(userAId);

    const res = await buildApp().request(
      `/api/cities/${cityId}/photos/upload-url`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...validBody(), contentType: 'image/gif' }),
      },
    );
    expect(res.status).toBe(422);
  });

  it('returns 422 when city already has 10 photos with status != failed', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const userAId = await ensureUser(SUB_A, tokenA);
    const cityId = await seedCity(userAId);

    // Seed 10 pending photos for this city.
    const photoValues = Array.from({ length: 10 }, (_, i) => ({
      cityId,
      userId: userAId,
      status: 'pending' as const,
      masterKey: `photos/${userAId}/${i}/master.jpg`,
      orderIndex: i,
    }));
    await db.insert(photos).values(photoValues);

    const res = await buildApp().request(
      `/api/cities/${cityId}/photos/upload-url`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify(validBody()),
      },
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('photo_limit_reached');
  });

  it('returns 201 with { photoId, uploadUrl } on success; creates photos row with status=pending', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const userAId = await ensureUser(SUB_A, tokenA);
    const cityId = await seedCity(userAId);

    const res = await buildApp().request(
      `/api/cities/${cityId}/photos/upload-url`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify(validBody()),
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { photoId: string; uploadUrl: string };
    expect(body.photoId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.uploadUrl).toContain(body.photoId);

    // Verify the DB row has status='pending', userId=userAId, masterKey containing photoId.
    const [row] = await db.select().from(photos).where(eq(photos.id, body.photoId));
    expect(row).toBeDefined();
    expect(row!.status).toBe('pending');
    expect(row!.userId).toBe(userAId);
    expect(row!.masterKey).toContain(body.photoId);
  });
});

// ─── finalize tests ────────────────────────────────────────────────

describe('POST /api/photos/:id/finalize', () => {
  beforeEach(async () => {
    await cleanup();
    vi.clearAllMocks();
    FAKE_OCI.getMasterBuffer.mockResolvedValue(
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
    );
  });
  afterEach(async () => { await cleanup(); });

  // Helper: seed a pending photo for user A and return ids.
  async function seedPendingPhoto(): Promise<{
    tokenA: string;
    userAId: string;
    photoId: string;
    cityId: string;
  }> {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const userAId = await ensureUser(SUB_A, tokenA);
    const cityId = await seedCity(userAId);
    const [photo] = await db.insert(photos).values({
      cityId,
      userId: userAId,
      status: 'pending',
      masterKey: `photos/${userAId}/test-photo-id/master.jpg`,
      orderIndex: 0,
    }).returning();
    if (!photo) throw new Error('test setup: seedPendingPhoto returned no row');
    return { tokenA, userAId, photoId: photo.id, cityId };
  }

  it('returns 404 when photo belongs to another user', async () => {
    const { photoId } = await seedPendingPhoto();
    const tokenB = await mint({ sub: SUB_B, email: EMAIL_B });

    const res = await buildApp().request(`/api/photos/${photoId}/finalize`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it('calls getMasterBuffer + makeThumbAndPut and updates status=ready + thumbKey', async () => {
    const { tokenA, photoId } = await seedPendingPhoto();

    const res = await buildApp().request(`/api/photos/${photoId}/finalize`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(FAKE_OCI.getMasterBuffer).toHaveBeenCalledOnce();
    expect(FAKE_OCI.makeThumbAndPut).toHaveBeenCalledOnce();

    const body = (await res.json()) as { id: string; masterUrl: string; thumbUrl: string };
    expect(body.id).toBe(photoId);
    expect(body.masterUrl).toBeTruthy();
    expect(body.thumbUrl).toBeTruthy();

    // DB row should now be status=ready with thumbKey set.
    const [row] = await db.select().from(photos).where(eq(photos.id, photoId));
    expect(row!.status).toBe('ready');
    expect(row!.thumbKey).toBeTruthy();
  });

  it('returns 409 when status is already ready (idempotency guard)', async () => {
    const { tokenA, photoId } = await seedPendingPhoto();

    // First finalize — should succeed.
    await buildApp().request(`/api/photos/${photoId}/finalize`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    // Second finalize — should return 409.
    const res = await buildApp().request(`/api/photos/${photoId}/finalize`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('already_finalized');
  });
});

// ─── delete tests ──────────────────────────────────────────────────

describe('DELETE /api/photos/:id', () => {
  beforeEach(async () => { await cleanup(); });
  afterEach(async () => { await cleanup(); });

  async function seedPendingPhoto(): Promise<{
    tokenA: string;
    userAId: string;
    photoId: string;
  }> {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const userAId = await ensureUser(SUB_A, tokenA);
    const cityId = await seedCity(userAId);
    const [photo] = await db.insert(photos).values({
      cityId,
      userId: userAId,
      status: 'pending',
      masterKey: `photos/${userAId}/test-id/master.jpg`,
      orderIndex: 0,
    }).returning();
    if (!photo) throw new Error('test setup: seedPendingPhoto returned no row');
    return { tokenA, userAId, photoId: photo.id };
  }

  it('returns 204 and removes row when status=pending', async () => {
    const { tokenA, photoId } = await seedPendingPhoto();

    const res = await buildApp().request(`/api/photos/${photoId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(204);
    const text = await res.text();
    expect(text).toBe('');

    // Row should be gone.
    const [row] = await db.select().from(photos).where(eq(photos.id, photoId));
    expect(row).toBeUndefined();
  });

  it('returns 404 when photo not found OR when caller is not owner', async () => {
    const { photoId } = await seedPendingPhoto();
    const tokenB = await mint({ sub: SUB_B, email: EMAIL_B });
    await ensureUser(SUB_B, tokenB);

    // Cross-user delete — should read as not found.
    const res = await buildApp().request(`/api/photos/${photoId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.status).toBe(404);

    // Row still exists for original owner.
    const [row] = await db.select().from(photos).where(eq(photos.id, photoId));
    expect(row).toBeDefined();
  });
});

// ─── list photos tests ─────────────────────────────────────────────

describe('GET /api/cities/:cityId/photos', () => {
  beforeEach(async () => { await cleanup(); });
  afterEach(async () => { await cleanup(); });

  it('returns only status=ready photos for the given city, scoped to me.id, ordered by orderIndex', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const userAId = await ensureUser(SUB_A, tokenA);
    const cityId = await seedCity(userAId);

    // Seed 3 photos: 2 ready, 1 pending.
    await db.insert(photos).values([
      {
        cityId, userId: userAId, status: 'ready',
        masterKey: `photos/${userAId}/p1/master.jpg`,
        thumbKey: `photos/${userAId}/p1/thumb.jpg`,
        orderIndex: 1,
      },
      {
        cityId, userId: userAId, status: 'ready',
        masterKey: `photos/${userAId}/p2/master.jpg`,
        thumbKey: `photos/${userAId}/p2/thumb.jpg`,
        orderIndex: 0,
      },
      {
        cityId, userId: userAId, status: 'pending',
        masterKey: `photos/${userAId}/p3/master.jpg`,
        orderIndex: 2,
      },
    ]);

    const res = await buildApp().request(`/api/cities/${cityId}/photos`, {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; masterUrl: string; thumbUrl: string; orderIndex: number }[];
    // Only the 2 ready photos, ordered by orderIndex ASC.
    expect(body).toHaveLength(2);
    expect(body[0]!.orderIndex).toBe(0);
    expect(body[1]!.orderIndex).toBe(1);
    // Each has masterUrl and thumbUrl as OCI public URLs.
    expect(body[0]!.masterUrl).toBeTruthy();
    expect(body[0]!.thumbUrl).toBeTruthy();
  });

  it('returns empty array for another user\'s city (no existence leak)', async () => {
    const tokenA = await mint({ sub: SUB_A, email: EMAIL_A });
    const tokenB = await mint({ sub: SUB_B, email: EMAIL_B });
    const userAId = await ensureUser(SUB_A, tokenA);
    await ensureUser(SUB_B, tokenB);
    const cityId = await seedCity(userAId);

    // User B queries user A's city — should get empty array, not 404.
    const res = await buildApp().request(`/api/cities/${cityId}/photos`, {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toEqual([]);
  });
});
