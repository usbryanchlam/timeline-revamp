import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/bun';
import { serve } from '@hono/node-server';
import { env } from './env.js';
import { requireJwt } from './auth/jwt.js';
import { lazyProvisionUser } from './auth/lazyProvision.js';
import { meRouter } from './routes/me.js';
import { citiesRouter } from './routes/cities.js';
import { photosRouter, photosNestedRouter } from './routes/photos.js';
import { handlesCheckHandler } from './routes/handlesCheck.js';
import { healthHandler } from './routes/health.js';
import { publicReelRouter } from './routes/publicReel.js';
// Side-effect import: registers the Hono ContextVariableMap
// augmentation so c.set('user', row) is typed as User (not unknown)
// across this process. Removing this import would silently relax
// types across every authenticated handler.
import './auth/context.js';

export const app = new Hono();

app.use('*', logger());

// PUBLIC — no auth. /health is for direct API probes (deploy
// healthchecks); /api/health is for the proxied path so the frontend
// can probe end-to-end through the Vite dev proxy.
//
// The bare /health stub is intentionally trivial — a DB blip should NOT
// page a systemd-watchdog-style liveness probe. /api/health (Phase 8
// D-17) extends that with a Postgres SELECT 1 ping so the operator can
// detect "API up but DB unreachable" via the readiness path.
app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/api/health', healthHandler);

// PUBLIC — no auth. Live availability check for the handle picker
// (AUTH-05/06/07). MUST be registered BEFORE the /api/me JWT mounts
// below — Hono runs middleware in registration order, and Phase 7
// RESEARCH §Pitfall 6 documents the regression: a bulk
// app.use('/api/*', requireJwt, ...) would intercept this route.
// Response is Cache-Control: no-store per D-04.
app.get('/api/handles/check', handlesCheckHandler);

// PUBLIC — no auth. One-shot reel payload for /u/:handle (PUBLIC-01).
// MUST be registered BEFORE the /api/me JWT mounts below for the same
// registration-order reason documented above. Cache-Control headers are
// set by the handler (max-age=300 on 200, max-age=60 on 404) per D-08.
app.route('/api/public/u', publicReelRouter);

// AUTHENTICATED — JWT validation, then lazy provisioning, then routes.
// Order matters: requireJwt MUST run before lazyProvisionUser because
// the latter reads c.var.auth0Sub set by the former.
//
// Hono path matching: the first form (exact) covers GET /api/me; the
// second (prefix) covers POST /api/me/handle and any future
// /api/me/<sub-path>. Both are needed — listing only the wildcard
// would skip middleware for the bare /api/me path.
app.use('/api/me', requireJwt, lazyProvisionUser);
app.use('/api/me/*', requireJwt, lazyProvisionUser);
app.route('/api/me', meRouter);

app.use('/api/cities', requireJwt, lazyProvisionUser);
app.use('/api/cities/*', requireJwt, lazyProvisionUser);
app.route('/api/cities', citiesRouter);

app.use('/api/photos', requireJwt, lazyProvisionUser);
app.use('/api/photos/*', requireJwt, lazyProvisionUser);
// photosRouter handles POST /api/photos/:id/finalize and DELETE /api/photos/:id.
app.route('/api/photos', photosRouter);
// photosNestedRouter handles POST /api/cities/:cityId/photos/upload-url and GET /.
// The /api/cities/* middleware above already covers this path with requireJwt +
// lazyProvisionUser, so no additional app.use() is needed here.
app.route('/api/cities/:cityId/photos', photosNestedRouter);

// Serve the Vite SPA bundle from the image-baked dist/. Phase 8 RESEARCH
// Pattern 1 / Code Example 2: dist/ is COPY'd into the runtime stage by
// the Dockerfile; Nginx (08-02) upstream-proxies non-API requests here
// and overlays cache headers on /assets/* in its own location block.
//
// Mount-order invariant (load-bearing): every app.(get|use)('/api/...')
// above MUST register before this catch-all. Hono evaluates middleware
// in registration order — an earlier '/*' mount would swallow /api/*.
//
// In development the Vite dev server owns the SPA and there is no dist/
// directory; the missing-root case yields a 404 from serveStatic, which
// is harmless because the dev workflow hits :5173 (Vite) not :8787 (API).
app.use('/*', serveStatic({ root: './dist' }));
// SPA fallback: any path that does not map to a real file in dist/
// returns index.html so client-side routes like /u/<handle> and /app/*
// render the React shell.
app.get('*', serveStatic({ path: './dist/index.html' }));

serve(
  { fetch: app.fetch, port: env.PORT },
  (info) => {
    // process.stdout, not console — coding-style.md no-console-log rule.
    process.stdout.write(`API listening on http://localhost:${info.port}\n`);
  },
);
