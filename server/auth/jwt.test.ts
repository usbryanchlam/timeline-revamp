import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  type CryptoKey,
  type JWK,
} from 'jose';

// The middleware reads env.AUTH0_DOMAIN/AUTH0_AUDIENCE at module load
// (server/env.ts validates synchronously). Set them BEFORE the dynamic
// import of './jwt' below — otherwise zod's safeParse fails and
// process.exit(1) kills the test runner.
process.env.DATABASE_URL = 'postgres://x:y@localhost:5432/z';
process.env.AUTH0_DOMAIN = 'test.auth0.com';
process.env.AUTH0_AUDIENCE = 'https://api.test.example';

const { requireJwt, __setJwksGetterForTest } = await import('./jwt.js');

const KID = 'test-key-1';
const ISSUER = 'https://test.auth0.com/';
const AUDIENCE = 'https://api.test.example';

let signKey: CryptoKey;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  signKey = privateKey;
  const jwk: JWK = await exportJWK(publicKey);
  jwk.kid = KID;
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const localGetter = createLocalJWKSet({ keys: [jwk] });
  // Cast: createLocalJWKSet returns the same getter shape as
  // createRemoteJWKSet (both are jose's GetKeyFunction). The named-type
  // mismatch is cosmetic — runtime behavior is identical.
  __setJwksGetterForTest(localGetter as never);
});

async function mint(opts: {
  exp?: number;
  aud?: string;
  claims?: Record<string, unknown>;
}): Promise<string> {
  return await new SignJWT(opts.claims ?? {})
    .setProtectedHeader({ alg: 'RS256', kid: KID, typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(opts.aud ?? AUDIENCE)
    .setSubject('auth0|test-user')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 3600)
    .sign(signKey);
}

function appWithMiddleware(): Hono {
  const app = new Hono();
  app.use('/me', requireJwt);
  app.get('/me', (c) => c.json({ ok: true, sub: c.var.auth0Sub }));
  return app;
}

describe('requireJwt (AUTH-02 SC #4)', () => {
  it('rejects EXPIRED tokens with 401', async () => {
    const expired = await mint({ exp: Math.floor(Date.now() / 1000) - 60 });
    const res = await appWithMiddleware().request('/me', {
      headers: { authorization: `Bearer ${expired}` },
    });
    expect(res.status).toBe(401);
  });

  it('rejects WRONG-AUDIENCE tokens with 401', async () => {
    const wrong = await mint({ aud: 'https://api.someoneelse.example' });
    const res = await appWithMiddleware().request('/me', {
      headers: { authorization: `Bearer ${wrong}` },
    });
    expect(res.status).toBe(401);
  });

  it('accepts valid token, sets c.var.auth0Sub', async () => {
    const good = await mint({});
    const res = await appWithMiddleware().request('/me', {
      headers: { authorization: `Bearer ${good}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; sub: string };
    expect(body.ok).toBe(true);
    expect(body.sub).toBe('auth0|test-user');
  });

  it('customClaimEmail — reads namespaced email custom claim', async () => {
    const token = await mint({
      claims: { 'https://timeline.bryanlam.dev/email': 'alice@example.com' },
    });
    const app = new Hono();
    app.use('/protected', requireJwt);
    app.get('/protected', (c) => c.json({ email: c.var.auth0Email }));

    const res = await app.request('/protected', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string };
    expect(body.email).toBe('alice@example.com');
  });

  it('customClaimEmail wins over standard email claim when both present', async () => {
    const token = await mint({
      claims: {
        'https://timeline.bryanlam.dev/email': 'alice-custom@example.com',
        email: 'alice-std@example.com',
      },
    });
    const app = new Hono();
    app.use('/protected', requireJwt);
    app.get('/protected', (c) => c.json({ email: c.var.auth0Email }));

    const res = await app.request('/protected', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string };
    expect(body.email).toBe('alice-custom@example.com');
  });

  it('fallbackToStandardEmail — uses standard email claim when custom claim absent (back-compat)', async () => {
    const token = await mint({
      claims: { email: 'bob@example.com' },
    });
    const app = new Hono();
    app.use('/protected', requireJwt);
    app.get('/protected', (c) => c.json({ email: c.var.auth0Email }));

    const res = await app.request('/protected', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string };
    expect(body.email).toBe('bob@example.com');
  });

  it('no email claims at all — auth0Email falls back to empty string', async () => {
    const token = await mint({});
    const app = new Hono();
    app.use('/protected', requireJwt);
    app.get('/protected', (c) => c.json({ email: c.var.auth0Email }));

    const res = await app.request('/protected', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string };
    expect(body.email).toBe('');
  });
});
