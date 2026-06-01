import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';

// Targeted middleware test — we test that requestId() middleware behaves as
// expected when wired into a minimal app. We do NOT import server/index.ts
// directly because that file does top-level await + invokes serve() at
// module-eval. Instead, we test the *contract* the planner relies on.
describe('hono/request-id middleware contract (used by server/index.ts)', () => {
  it('generates a UUID and echoes on x-request-id response header when client does not send one', async () => {
    const app = new Hono();
    app.use('*', requestId());
    app.get('/echo', (c) => c.json({ id: c.get('requestId') }));

    const res = await app.request('/echo');
    expect(res.status).toBe(200);

    const echoed = res.headers.get('x-request-id');
    expect(echoed).toBeTruthy();
    // crypto.randomUUID v4 shape: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(echoed).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(echoed);
  });

  it('echoes a client-supplied x-request-id verbatim', async () => {
    const app = new Hono();
    app.use('*', requestId());
    app.get('/echo', (c) => c.json({ id: c.get('requestId') }));

    const supplied = 'client-supplied-test-id-12345';
    const res = await app.request('/echo', {
      headers: { 'x-request-id': supplied },
    });

    expect(res.headers.get('x-request-id')).toBe(supplied);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(supplied);
  });
});
