---
phase: 04-backend-auth0
plan: 01
subsystem: backend
tags: [hono, drizzle, postgres, docker, schema, deferrable-unique]
requires: []
provides:
  - hono-app
  - drizzle-schema-v1
  - postgres-dev-stack
  - cities-deferrable-unique-constraint
  - vite-api-proxy
  - one-command-dev
affects: []
tech-stack:
  added:
    - hono@4.12.18
    - "@hono/node-server@2.0.1"
    - drizzle-orm@0.45.2
    - drizzle-kit@0.31.10
    - pg@8.20.0
    - "@types/pg@8.20.0"
    - dotenv@17.4.2
    - zod@4.4.3
    - tsx@4.21.0
    - postgres:16 (Docker)
  patterns:
    - "DATA-02 ownership split: schema.ts has no uniqueIndex; deferrable UNIQUE CONSTRAINT lives in hand-authored 0001 migration so future db:generate runs cannot regress it"
    - "Zod env validation at process boundary with frozen typed export (fail-fast)"
    - "Single dev command spawns Vite + Hono via node:child_process with prefixed output and signal forwarding (no concurrently dep)"
    - "Vite /api proxy → Hono :8787 (frontend never knows API host; production replicates with Nginx)"
key-files:
  created:
    - server/index.ts
    - server/env.ts
    - server/db/schema.ts
    - server/db/client.ts
    - server/db/migrate.ts
    - server/db/migrations/0000_panoramic_deathbird.sql
    - server/db/migrations/0001_cities_deferrable_unique.sql
    - server/db/migrations/meta/_journal.json
    - server/db/migrations/meta/0000_snapshot.json
    - drizzle.config.ts
    - docker-compose.yml
    - scripts/dev.ts
    - tsconfig.server.json
  modified:
    - package.json
    - bun.lock
    - tsconfig.json
    - vite.config.ts
    - .gitignore
    - .env.example
    - .env.local (extended with DATABASE_URL/POSTGRES_PASSWORD/PORT — gitignored)
    - .planning/codebase/STRUCTURE.md
decisions:
  - "DATA-02 deferrable unique constraint lives in hand-authored migration 0001, NOT in schema.ts. Drizzle Kit can only model unique INDEXes (which Postgres forbids from being DEFERRABLE), so declaring it in schema would force a hand-patch on every db:generate. Omitting it from schema means there is nothing to diff against; the constraint survives all future schema changes."
  - "Single bun run dev via scripts/dev.ts (node:child_process.spawn) instead of the concurrently npm package — fewer surprises around macOS signal handling."
  - "server/ at repo root, not apps/api + apps/web monorepo. Avoids workspace refactor of all existing src/ files for zero benefit until Phase 8 containerization."
  - "GET /health intentionally does NOT touch the DB. Healthy-process-with-dead-DB still answers 200, which is what we want for diagnosing 'is the API up at all?'. /readyz lands in DEPLOY-06."
  - "GET /api/health mirrors /health so the Vite proxy can be smoke-tested end-to-end during dev."
  - "Env loader uses dotenv.config({ path: '.env.local' }) then '.env' — without overwriting existing process.env. Docker/CI env wins."
metrics:
  duration: ~25 minutes
  tasks-completed: 7
  files-created: 13
  files-modified: 8
  commits: 6
  completed: 2026-04-27
---

# Phase 4 Plan 01: Backend Skeleton + Postgres + Drizzle Summary

Stood up the entire backend skeleton — Hono API on :8787, Postgres 16 in Docker, Drizzle schema for all four v1 tables, two-stage migration system (auto + hand-authored DEFERRABLE), Vite proxy to API, and a single `bun run dev` that supervises both processes — with no auth yet (Auth0 lands in 04-02).

## ROADMAP success criteria delivered

1. `bun run dev` starts both Vite (5173) and Hono (8787); `/health` returns 200 — DONE
2. `users`, `cities`, `photos`, `notifications` tables exist; `bun run db:migrate` is idempotent — DONE
3-6. Auth0, JWT middleware, lazy provisioning, AppLayout-scoped Auth0Provider — INTENTIONALLY DEFERRED to 04-02

## Requirements satisfied

- **DATA-01:** Drizzle schema for all four tables with FK ON DELETE CASCADE rules and adjacent rationale comments.
- **DATA-02:** `cities (user_id, order_index)` is a UNIQUE CONSTRAINT (`pg_constraint.contype='u'`, not 'i'), DEFERRABLE INITIALLY DEFERRED (`condeferrable=t, condeferred=t`), owned exclusively by `0001_cities_deferrable_unique.sql`.

## Tasks executed

| Task | Name | Commit |
|------|------|--------|
| 0 | Confirm Docker installed (checkpoint, auto-approved — `docker compose version v5.1.2`, OrbStack daemon healthy) | (no commit) |
| 1 | Install backend deps + tsconfig.server.json + scripts | `923c504` |
| 2 | docker-compose.yml + Zod env loader | `e04b4d1` |
| 3 | Drizzle schema (users/cities/photos/notifications) + client + drizzle.config.ts | `69ae17b` |
| 4 | Generate 0000 + author 0001 DEFERRABLE migration + run migrator | `7477fd3` |
| 5 | Hono /health server + scripts/dev.ts orchestrator + Vite /api proxy | `ccf83e6` |
| 6 | Refresh STRUCTURE.md with the new server/ tree | `b7fce14` |

## Final verification (all green on `b7fce14`)

- `bun run typecheck` — PASS (covers app + node + server tsconfigs)
- `bun run test` — PASS (85/85 vitest tests, no regressions)
- `bun run build` — PASS (frontend bundle still works; server code not in the Vite bundle)
- `docker compose ps postgres` — `Up (healthy)`
- `bun run db:migrate` — exits 0; re-running is a no-op (idempotent)
- `SELECT count(*) FROM information_schema.tables WHERE table_name IN ('users','cities','photos','notifications')` — `4`
- `SELECT contype FROM pg_constraint WHERE conname = 'cities_user_id_order_index_unique'` — `u` (real UNIQUE CONSTRAINT, not an index)
- `SELECT condeferrable, condeferred FROM pg_constraint WHERE conname = 'cities_user_id_order_index_unique'` — `t|t`
- `bun run dev` brings up both processes; `curl :8787/health` and `curl :5173/api/health` both return `{"status":"ok"}`; SIGINT cleanly tears both down (no orphan tsx/vite)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] dotenv was not loading `.env.local`**

- **Found during:** Task 4 (`bun run db:migrate` failed with `DATABASE_URL undefined`)
- **Issue:** `import 'dotenv/config'` only loads `.env`, not `.env.local`. The plan's env contract puts the developer's secrets in `.env.local` (gitignored), so the env loader silently saw nothing.
- **Fix:** Replaced `import 'dotenv/config'` with explicit `loadDotenv({ path: '.env.local' })` then `loadDotenv({ path: '.env' })` in both `server/env.ts` and `drizzle.config.ts`. Existing `process.env` values (Docker, CI) are NOT overwritten — they win.
- **Files modified:** server/env.ts, drizzle.config.ts
- **Commit:** `7477fd3`

**2. [Rule 1 - Bug] `@server/*` path alias did not resolve under NodeNext**

- **Found during:** Task 3 (typecheck error TS2307 in server/db/client.ts)
- **Issue:** The plan specified `paths: { "@server/*": ["server/*"] }` in tsconfig.server.json, but NodeNext module resolution + `verbatimModuleSyntax` requires explicit `.js` extensions on relative imports and treats path aliases differently than bundler mode.
- **Fix:** Used relative imports with `.js` extensions (`'../env.js'`, `'./schema.js'`) — the standard NodeNext idiom. The `@server/*` alias is left in tsconfig.server.json but unused; future server code should follow the same relative-import pattern.
- **Files modified:** server/db/client.ts, server/db/migrate.ts, server/index.ts
- **Commit:** `69ae17b`

**3. [Rule 3 - Blocking] Drizzle migrator needed manual `_journal.json` entry for 0001**

- **Found during:** Task 4
- **Issue:** Drizzle Kit's `generate` only writes journal entries for migrations it produced. The hand-authored `0001_cities_deferrable_unique.sql` had no journal entry, so the migrator would silently skip it.
- **Fix:** Manually appended an entry for `0001_cities_deferrable_unique` to `meta/_journal.json` (idx=1, version=7, breakpoints=true). After this, `bun run db:migrate` correctly applied both migrations and the constraint landed.
- **Files modified:** server/db/migrations/meta/_journal.json
- **Commit:** `7477fd3`

### Other notes

- **The plan's Task 3 verify command had a non-fatal grep miscount.** It uses `grep -v '^[[:space:]]*//' ... | grep -c "onDelete: 'cascade'"` and asserts the count, but the actual count is 3 (not 4) because `users` has no FK. Three FKs (cities→users, photos→cities, notifications→users) is correct. The plan's `grep -q` form (just "at least one match") is satisfied.
- **The plan's Task 4 verify SQL has a `pg_constraint` operator-overload bug:** `SELECT conname || '|' || contype` fails because Postgres can't pick the `||` operator for `text || "char"`. Worked around by casting: `contype::text`. The semantic verification (constraint type='u', deferrable=t, deferred=t) all passed.
- **No new tests added** per plan — this is a scaffolding plan; tests for handlers land in 04-02+.

## Authentication gates

None. This plan does not touch Auth0.

## Threat Flags

None — only added surface is a no-auth `/health` endpoint with no DB access, which is intentional per DEPLOY-06 design and documented in `server/index.ts`. Auth0 + JWT middleware lands in 04-02.

## Self-Check: PASSED

All claimed files exist on disk:
- server/index.ts — FOUND
- server/env.ts — FOUND
- server/db/schema.ts — FOUND
- server/db/client.ts — FOUND
- server/db/migrate.ts — FOUND
- server/db/migrations/0000_panoramic_deathbird.sql — FOUND
- server/db/migrations/0001_cities_deferrable_unique.sql — FOUND
- drizzle.config.ts — FOUND
- docker-compose.yml — FOUND
- scripts/dev.ts — FOUND
- tsconfig.server.json — FOUND

All claimed commits exist on `feature/04-01-backend`:
- 923c504 — FOUND
- e04b4d1 — FOUND
- 69ae17b — FOUND
- 7477fd3 — FOUND
- ccf83e6 — FOUND
- b7fce14 — FOUND
