import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { HTTPException } from 'hono/http-exception';

// server/index.ts validates env at module-load and invokes serve(). Set
// env BEFORE the dynamic import, and stub @hono/node-server's serve so
// importing the module doesn't actually bind a port (would collide with
// real dev server + leave handles open).
process.env.DATABASE_URL = 'postgres://x:y@localhost:5432/z';
process.env.AUTH0_DOMAIN = 'test.auth0.com';
process.env.AUTH0_AUDIENCE = 'https://api.test.example';

vi.mock('@hono/node-server', () => ({
  serve: () => ({ port: 0 }),
}));

// Import the PRODUCTION onError handler directly — direct contract test
// (per W2). NOT a paraphrase. server/index.ts cannot be imported wholesale
// because its top-level serve() call binds a port at module-eval, so the
// handler is exported separately as a named const.
const { onErrorHandler } = await import('./index.js');

// Builds a minimal Hono app wired with the SAME onError handler installed
// in server/index.ts. The handler itself is the production export — only the
// routes that *trigger* it are local to this test.
function buildAppWithOnError() {
  const app = new Hono();
  app.use('*', requestId());
  app.get('/boom', () => {
    throw new Error('internal-boom-message');
  });
  app.get('/forbidden', () => {
    throw new HTTPException(403, { message: 'forbidden_custom' });
  });
  app.onError(onErrorHandler);
  return app;
}

describe('app.onError contract (mirrors server/index.ts)', () => {
  it('returns sanitized 500 JSON without stack or message leakage', async () => {
    const app = buildAppWithOnError();
    const res = await app.request('/boom');
    expect(res.status).toBe(500);

    const body = (await res.json()) as { error: string; request_id: string };
    expect(body.error).toBe('internal_error');
    expect(body.request_id).toBeTruthy();
    expect(body.request_id).toMatch(/^[0-9a-f-]{36}$/i);

    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('internal-boom-message');
    expect(bodyStr).not.toContain('Error');
    expect(bodyStr).not.toContain('stack');
  });

  it('re-emits HTTPException via err.getResponse() verbatim', async () => {
    const app = buildAppWithOnError();
    const res = await app.request('/forbidden');
    expect(res.status).toBe(403);

    // HTTPException(status, { message }) renders the message as the response body text.
    const body = await res.text();
    expect(body).toContain('forbidden_custom');
  });

  it('request_id in 500 response matches x-request-id header', async () => {
    const app = buildAppWithOnError();
    const res = await app.request('/boom');
    const headerId = res.headers.get('x-request-id');
    const body = (await res.json()) as { request_id: string };
    expect(body.request_id).toBe(headerId);
  });
});
