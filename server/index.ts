import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { env } from './env.js';
import { requireJwt } from './auth/jwt.js';
import { lazyProvisionUser } from './auth/lazyProvision.js';
import { meRouter } from './routes/me.js';
import { citiesRouter } from './routes/cities.js';
import { photosRouter, photosNestedRouter } from './routes/photos.js';
import { handlesCheckHandler } from './routes/handlesCheck.js';
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
app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// PUBLIC — no auth. Live availability check for the handle picker
// (AUTH-05/06/07). MUST be registered BEFORE the /api/me JWT mounts
// below — Hono runs middleware in registration order, and Phase 7
// RESEARCH §Pitfall 6 documents the regression: a bulk
// app.use('/api/*', requireJwt, ...) would intercept this route.
// Response is Cache-Control: no-store per D-04.
app.get('/api/handles/check', handlesCheckHandler);

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

serve(
  { fetch: app.fetch, port: env.PORT },
  (info) => {
    // process.stdout, not console — coding-style.md no-console-log rule.
    process.stdout.write(`API listening on http://localhost:${info.port}\n`);
  },
);
