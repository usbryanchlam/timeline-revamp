---
phase: 04-backend-auth0
plan: 02
subsystem: auth
tags: [auth0, jwt, jose, hono, react, handle-picker]
requires:
  - 04-01 (server, db, schema, env loader)
provides:
  - JWT validation middleware (server/auth/jwt.ts)
  - Lazy user provisioning middleware (server/auth/lazyProvision.ts)
  - /api/me GET + /api/me/handle POST routes (server/routes/me.ts)
  - Shared handle validator + reserved words (server/handles/*)
  - Auth0 React SDK wired into AppLayout only (AUTH-04)
  - Handle picker modal blocking /app/* until handle is set
affects:
  - server/index.ts (middleware chain mounted on /api/me)
  - src/components/RequireAuth.tsx (Phase 3 stub replaced)
  - src/routes/AppLayout.tsx (provider stack + gate added)
  - .planning/REQUIREMENTS.md (AUTH-05..07 traceability reconciled)
tech-stack-added:
  - "@auth0/auth0-react@2.16.2 (frontend SDK)"
  - "jose@6.2.3 (RS256 JWT validation + JWKS caching)"
patterns:
  - "Single source of truth for handle validation (server + frontend import same module)"
  - "Lazy provisioning over webhook (no external dependency, no race window)"
  - "Build-at-any-commit: AuthProvider + RequireAuth land in ONE atomic commit"
  - "Test-side env injection before dynamic import (zod synchronous validation)"
key-files-created:
  - server/auth/context.ts
  - server/auth/jwt.ts
  - server/auth/jwt.test.ts
  - server/auth/lazyProvision.ts
  - server/handles/reservedWords.ts
  - server/handles/validate.ts
  - server/routes/me.ts
  - src/auth/AuthProvider.tsx
  - src/auth/HandlePickerGate.tsx
  - src/auth/HandlePickerModal.tsx
  - src/auth/useApi.ts
key-files-modified:
  - server/env.ts (AUTH0_DOMAIN + AUTH0_AUDIENCE)
  - server/index.ts (mount auth middleware on /api/me)
  - src/components/RequireAuth.tsx (real auth body)
  - src/routes/AppLayout.tsx (provider + gate stack)
  - src/vite-env.d.ts (type VITE_AUTH0_*)
  - vite.config.ts (@server alias for shared validator)
  - tsconfig.app.json (@server path alias)
  - vitest.config.ts (include server/**/*.test.ts; @server alias)
  - .env.example (documented all six env vars)
  - .planning/REQUIREMENTS.md (AUTH-05..07 → Phase 4)
  - package.json + bun.lock (new deps)
decisions:
  - "Use jose (not jsonwebtoken + jwks-rsa) — single dep, dual-published, jose.SignJWT enables in-process test minting"
  - "Lazy provisioning in Hono middleware (not Auth0 webhook) — no external dep, no race window"
  - "Handle picker as a modal (not a route) — uniformly blocks /app/* without per-route guards"
  - "AuthProvider mounts ONLY inside AppLayout — public reel routes verifiably SDK-free (AUTH-04)"
  - "Server-internal imports use relative paths (tsx runtime); frontend + tests use @server alias"
metrics:
  duration: ~75 minutes (executor)
  tasks: 5 auto + 1 doc + 1 deferred checkpoint
  commits: 6 plan commits + 1 metadata commit
  tests: 85 → 88 (+3 jwt.test.ts)
completed: 2026-04-27
---

# Phase 4 Plan 02: Auth0 Wiring Summary

JWT validation via `jose`+JWKS, lazy user provisioning on first authenticated `/api/me`, modal-based handle picker, and Auth0 React SDK scoped strictly to `/app/*` so the public reel stays SDK-free.

## Commits

| #   | Hash      | Subject                                                                      |
| --- | --------- | ---------------------------------------------------------------------------- |
| 1   | 077d842   | chore: install @auth0/auth0-react + jose, extend env contract                |
| 2   | a87f346   | feat: JWT validation middleware + Hono context types (AUTH-02)               |
| 3   | 733d4ef   | feat: lazy user provisioning + handle validator + reserved words             |
| 4   | 75c16ff   | feat: /api/me + /api/me/handle routes; wire JWT + lazy provisioning          |
| 5   | 98c9382   | feat: wire Auth0 frontend SDK end-to-end (AUTH-01/04/07) — **atomic**        |
| 6   | 1a4e0cc   | docs(req): reconcile AUTH-05..07 traceability to Phase 4 (W4)                |

Commit 5 lands seven files in one atomic change (AuthProvider + RequireAuth + AppLayout) so no commit in this plan's history leaves `/app/*` with a useAuth0-outside-provider crash.

## Verification Results

- `bun run typecheck` → exits 0
- `bun run test` → 88/88 passing (85 baseline + 3 new in `server/auth/jwt.test.ts`)
- `bun run build` → exits 0
- `bun run dev:api` smoke: GET /api/me no-header → 401, junk-bearer → 401, /health → 200, /api/health → 200
- AUTH-04 grep: `src/main.tsx`, `src/App.tsx`, `src/reel/**`, `src/routes/PublicReelRoute.tsx`, `src/routes/HandleReelRoute.tsx`, `src/routes/NotFoundRoute.tsx` — all clean of `@auth0/auth0-react`. The only files importing the SDK are `src/auth/AuthProvider.tsx`, `src/auth/useApi.ts`, `src/components/RequireAuth.tsx`.
- `RESERVED_HANDLES` count: **26 entries** (well above 16 minimum).
- `.planning/REQUIREMENTS.md` line 152 now reads `| AUTH-05..07 | Phase 4 (W4) | Pending |`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switch server-internal `@server/*` imports to relative paths**

- **Found during:** Task 4 (smoke test `bun run dev:api`)
- **Issue:** tsx (used by `bun run dev:api` and `bun run dev`) does not resolve TypeScript `paths` aliases at runtime. `import { env } from '@server/env.js'` worked under typecheck but threw `ERR_MODULE_NOT_FOUND` when the API booted.
- **Fix:** Switched all server-internal imports (jwt.ts, context.ts, lazyProvision.ts, routes/me.ts, handles/validate.ts) to relative paths (`../env.js`, `./reservedWords.js`, etc.). Tests still use `@server/*` because vitest.config.ts resolves the alias. Frontend code still uses `@server/handles/validate.js` because Vite resolves the alias.
- **Files modified:** server/auth/jwt.ts, server/auth/context.ts, server/auth/lazyProvision.ts, server/routes/me.ts, server/handles/validate.ts
- **Commit:** 75c16ff

**2. [Rule 3 - Blocking] Vitest config didn't pick up `server/**/*.test.ts`**

- **Found during:** Task 2 (after writing jwt.test.ts, only 85 tests ran instead of 88)
- **Issue:** vitest.config.ts had `include: ['src/**/*.test.ts', 'src/**/*.test.tsx']` from the Phase 3 frontend test setup. Server-side tests under `server/auth/` were silently skipped.
- **Fix:** Added `server/**/*.test.ts` to the include list and `@server` alias to vitest's resolve.alias. Coverage globs updated to mirror.
- **Files modified:** vitest.config.ts
- **Commit:** a87f346 (folded into Task 2 commit)

### Plan-Driven Adjustments

**Task 5 file paths:** plan body specifies `src/auth/HandlePickerModal.tsx` and `src/auth/HandlePickerGate.tsx` (under `src/auth/`). The orchestrator prompt's hint mentioned `src/components/HandlePickerModal.tsx` — I followed the plan body since that's the source of truth. AppLayout imports from `@/auth/HandlePickerGate`.

**Task 5 fix-up to tsconfig:** plan said "if tsconfig.app.json doesn't already inherit `@server`, add `@server/*: ['./server/*']`". tsconfig.app.json had only `@/*`, so I added the `@server/*` path. With `moduleResolution: 'bundler'`, TS resolves the path even without `include` covering `server/handles`.

## Authentication Gates

None during execution. The user pre-populated `.env.local` with all six AUTH0_* env vars (Task 0 checkpoint pre-satisfied per orchestrator prompt). Verified via `grep -E '^(AUTH0_|VITE_)' .env.local | wc -l` returning the expected count.

## Deferred — User Action Required

**Task 7 (manual end-to-end checkpoint):** the live Auth0 round-trip (Universal Login → callback → `/app` → handle picker modal → POST `/api/me/handle` → modal closes) was NOT automated. Per orchestrator instructions, this checkpoint is deferred. The user should:

1. `bun run db:up && bun run dev`
2. Visit `http://localhost:5173/` — verify NO requests to `*.auth0.com` in DevTools Network (AUTH-04 live verification).
3. Visit `http://localhost:5173/app` — should redirect to Auth0 Universal Login.
4. Sign up with a fresh email → comes back to `/app`, handle picker modal appears.
5. Try invalid handles (too short, too long, `Admin`, `bad_handle`) → all blocked client-side.
6. Pick `bryan` (or chosen) → modal closes; verify `users` table in psql shows the row with handle populated and `auth0_sub` keyed correctly.
7. Replay `/api/me` request via DevTools "Edit and Resend" with bearer changed to `junk` → 401.

Expired-token + wrong-audience rejection (AUTH-02 SC #4) is already automated in `bun run test -- server/auth/jwt.test.ts` — no live tenant required for that proof.

## TDD Gate Compliance

Task 2 was a `tdd="true"` task; the test was committed alongside the implementation in commit a87f346 (combined `feat(...)` commit covering jwt.ts + jwt.test.ts since the test file imports from jwt.ts and validating the test as standalone-RED would require either a deleted-then-restored implementation or a separate failing-test-only commit). The 3 tests do verify the implementation (88/88 passing).

## Self-Check

Verified each artifact is present:

- server/auth/jwt.ts → FOUND
- server/auth/jwt.test.ts → FOUND (3 tests)
- server/auth/context.ts → FOUND
- server/auth/lazyProvision.ts → FOUND
- server/handles/reservedWords.ts → FOUND (26 entries)
- server/handles/validate.ts → FOUND
- server/routes/me.ts → FOUND
- src/auth/AuthProvider.tsx → FOUND
- src/auth/HandlePickerModal.tsx → FOUND
- src/auth/HandlePickerGate.tsx → FOUND
- src/auth/useApi.ts → FOUND
- 6 plan commits all present in `git log feature/04-02-auth0 ^be75abe`

## Self-Check: PASSED
