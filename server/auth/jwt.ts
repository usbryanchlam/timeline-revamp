import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Context, MiddlewareHandler } from 'hono';
import { env } from '../env.js';

// AUTH-02: JWT validation middleware. Validates RS256 JWTs against
// Auth0's JWKS endpoint using `jose`. Locked to:
//   - issuer: `https://${AUTH0_DOMAIN}/` (trailing slash REQUIRED — Auth0
//     emits the iss claim with one)
//   - audience: AUTH0_AUDIENCE (the API identifier, NOT the SPA client id)
//
// Why both checks: audience prevents tokens minted for a sibling API in
// the same tenant from being accepted; issuer prevents cross-tenant
// confusion. jose's jwtVerify checks both atomically and throws on the
// first mismatch.
//
// Why `jose` and not jsonwebtoken: jose is dual-published (ESM + CJS),
// has built-in createRemoteJWKSet with key caching + automatic rotation,
// and exports SignJWT/generateKeyPair so jwt.test.ts can mint test
// tokens against an in-memory JWKS without hitting Auth0.

const ISSUER = `https://${env.AUTH0_DOMAIN}/`;
const JWKS_URL = new URL(`https://${env.AUTH0_DOMAIN}/.well-known/jwks.json`);

// Exported for test stubbing. server/auth/jwt.test.ts replaces this with
// a createLocalJWKSet bound to a freshly-generated keypair so it can
// mint expired and wrong-audience tokens without a live tenant.
let jwksGetter: ReturnType<typeof createRemoteJWKSet> = createRemoteJWKSet(JWKS_URL, {
  cooldownDuration: 30_000,
  cacheMaxAge: 600_000,
});

export function __setJwksGetterForTest(getter: typeof jwksGetter): void {
  jwksGetter = getter;
}

function bearer(c: Context): string | null {
  const h = c.req.header('authorization');
  if (!h) return null;
  const [scheme, token] = h.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

interface Auth0Payload extends JWTPayload {
  sub?: string;
  email?: string;
}

export const requireJwt: MiddlewareHandler = async (c, next) => {
  const token = bearer(c);
  if (!token) return c.json({ error: 'missing_bearer_token' }, 401);
  try {
    const { payload } = await jwtVerify(token, jwksGetter, {
      issuer: ISSUER,
      audience: env.AUTH0_AUDIENCE,
    });
    const p = payload as Auth0Payload;
    if (!p.sub) return c.json({ error: 'token_missing_sub' }, 401);
    c.set('auth0Sub', p.sub);
    c.set('auth0Email', p.email ?? '');
    await next();
    return;
  } catch (err) {
    // jose throws specific named errors (ERR_JWT_EXPIRED,
    // ERR_JWT_CLAIM_VALIDATION_FAILED, ERR_JWS_SIGNATURE_VERIFICATION_FAILED).
    // We collapse them to a single 401 to avoid leaking which validation
    // step failed. Diagnostics go to stderr per typescript/coding-style.md
    // (no console.log in production paths).
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`JWT validation failed: ${msg}\n`);
    return c.json({ error: 'invalid_token' }, 401);
  }
};
