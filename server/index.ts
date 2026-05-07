import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { env } from './env.js';

export const app = new Hono();

app.use('*', logger());

// Health endpoint. Intentionally does NOT touch the database — a healthy
// process with a dead DB still answers 200 here, which is what we want
// for diagnosing "is the API up at all?". Phase 9 (DEPLOY-06) adds a
// separate /readyz that DOES check DB.
app.get('/health', (c) => c.json({ status: 'ok' }));

// Mirror at /api/health so the Vite proxy can be tested end-to-end from
// the frontend during dev. /health is for direct API probes (deploy
// healthchecks); /api/health is for the proxied path.
app.get('/api/health', (c) => c.json({ status: 'ok' }));

serve(
  { fetch: app.fetch, port: env.PORT },
  (info) => {
    // process.stdout, not console — coding-style.md no-console-log rule.
    process.stdout.write(`API listening on http://localhost:${info.port}\n`);
  },
);
