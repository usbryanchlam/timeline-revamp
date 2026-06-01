---
phase: 09-deploy-part-2-empty-error-states
plan: 02
subsystem: production-middleware-and-cloud-init
tags: [hono-middleware, request-id, error-handler, auth0-custom-claim, cloud-init, certbot, dhparam, f1-1, f9, deploy-06]
requirements: [DEPLOY-06]
dependency_graph:
  requires:
    - "Phase 7: AUTH-02 requireJwt middleware (jwt.ts) — extension site"
    - "Phase 8.1.1: cloud-init.yaml header changelog items 1-7 — insertion baseline"
    - "Phase 9 CONTEXT D-X: Auth0 namespace literal 'https://timeline.bryanlam.dev/email' locked"
    - "Phase 9 09-01: deploy pipeline (out-of-wave; lands first via wave ordering)"
  provides:
    - "DEPLOY-06: production middleware (request-id + sanitized onError) for the auto-deploy stack"
    - "F1.1: cloud-init bootstraps certbot TLS template files so `nginx -t` passes on first VM boot"
    - "F9: server reads namespaced email custom claim — unblocks lazy provisioning of populated users.email"
    - "onErrorHandler named export — direct contract test surface (no paraphrase)"
  affects:
    - "server/auth/lazyProvision.ts (no source change — c.var.auth0Email is now populated by Auth0 Action path)"
    - "infra/terraform module.compute cloud-init re-render on next plan/apply"
tech_stack:
  added:
    - "hono/request-id (already-present Hono 4.12.18; new import)"
    - "hono/http-exception (already-present; new import)"
  patterns:
    - "Named-export production handler for direct contract testing (W2 pattern — onErrorHandler imported from server/index.ts; test does NOT redefine the handler body)"
    - "Stderr-only logging with [requestId] prefix (matches existing server/auth/jwt.ts:69-71 discipline)"
    - "Auth0 namespaced custom claim read via Record<string,unknown> cast (avoids index-signature awkwardness; signature verification gate is unchanged)"
key_files:
  created:
    - "server/index.requestId.test.ts (2 tests)"
    - "server/index.error.test.ts (3 tests)"
    - ".planning/phases/09-deploy-part-2-empty-error-states/09-02-SUMMARY.md"
  modified:
    - "server/index.ts (+44 / -3): requestId + custom logger + named onErrorHandler"
    - "server/auth/jwt.ts (+16 / -1): EMAIL_CLAIM constant + fallback chain"
    - "server/auth/jwt.test.ts (+71 / -2): mint() claims param + 4 new test cases"
    - "infra/cloud-init.yaml (+31): F1.1 runcmd block + changelog item 8"
decisions:
  - "Replaced hono/logger with a stderr-writing custom middleware that interpolates c.get('requestId'). Why: a) ordering: requestId() must come first so the logger AND onError both see the id; b) discipline: no console.* in new code per typescript/coding-style.md; c) format control: log line ALSO acts as the audit trail by carrying method+path+status, neutralizing T-09-02-03 (forged X-Request-Id can't impersonate a real request because the real method+path differ)."
  - "Exported onErrorHandler as a NAMED const (not inline-only). Why: server/index.error.test.ts asserts the PRODUCTION handler — not a paraphrase. The test imports `onErrorHandler` and binds it to a minimal Hono app whose routes deliberately throw. Per W2 anti-paraphrase rule."
  - "Used vi.mock('@hono/node-server') in the error test. server/index.ts calls serve() at module-eval; mocking the import prevents the test from actually binding a port (would race with dev server)."
  - "jwt.ts reads the namespaced claim via `(payload as Record<string,unknown>)[EMAIL_CLAIM]` rather than extending Auth0Payload with an index signature. Why: literal-keyed index signatures are TS-awkward and the cast is local. Auth0Payload.email stays as the back-compat fallback path."
  - "cloud-init runcmd does NOT guard `openssl dhparam` with a `[ -f /etc/letsencrypt/ssl-dhparams.pem ]` check. Per RESEARCH Pitfall 7: terraform taint replaces the disk so the guard is pointless; cloud-init runcmd is run-once per fresh boot regardless."
metrics:
  duration: ~7 minutes (autonomous execution; no checkpoints hit)
  completed: 2026-06-01
  commits: 5
  tasks: 3
  files_changed: 4 modified + 2 created
  tests_added: 9 (5 in index files + 4 in jwt.test.ts)
  tests_passing_after: 290 (5 pre-existing failing test files require DATABASE_URL setup — out of plan scope)
---

# Phase 9 Plan 2: Production middleware + F1.1/F9 infra cleanup Summary

DEPLOY-06 request-id + sanitized onError + F9 namespaced Auth0 email custom claim + F1.1 cloud-init pre-creates certbot TLS template files so `nginx -t` passes on first VM boot.

## What was built

Three surgical in-file extensions to existing production modules, plus matching tests:

1. **server/index.ts** — `hono/request-id` middleware mounted FIRST; custom stderr logger replaces `hono/logger` and interpolates `[requestId]`; named-export `onErrorHandler` (HTTPException re-emits via `getResponse()`, other Error returns sanitized `{ error:'internal_error', request_id }` 500 with stack to stderr). Middleware ordering verified by grep gate: requestId at line 26 < app.onError at line 112.

2. **server/auth/jwt.ts** — `EMAIL_CLAIM = 'https://timeline.bryanlam.dev/email'` constant; `requireJwt` reads the namespaced custom claim first, falls back to standard `email`, final fallback to empty string. Auth0Payload interface unchanged; signature verification unchanged.

3. **infra/cloud-init.yaml** — runcmd block between nginx-cache and app-dir creates `/etc/letsencrypt/`, copies `options-ssl-nginx.conf` from `python3-certbot-nginx`'s install path, runs `openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048`, chmods both to 0644. Header changelog gets item 8.

## TDD Gate Compliance

All TDD-marked tasks followed RED → GREEN cycle with explicit gate commits:

| Task | RED commit                                                     | GREEN commit                                                                         |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1    | `2d49804` test(09-02): add failing tests for request-id...     | `67e2177` feat(09-02): add request-id, custom logger, and onError middleware         |
| 2    | `eb11213` test(09-02): add failing tests for namespaced email  | `9870fc4` feat(09-02): read namespaced Auth0 email custom claim with fallback (F9)   |
| 3    | (no TDD gate — infra YAML)                                     | `7c844be` feat(09-02): pre-create certbot TLS template files in cloud-init (F1.1)    |

RED gate proof:
- Task 1 RED: 3 error-handler tests failed with `this.errorHandler is not a function` (onErrorHandler not exported yet). The 2 request-id tests passed in RED because they target Hono's built-in directly — they are a contract-pin for the middleware the planner relies on.
- Task 2 RED: 2 `customClaimEmail` tests failed with `expected 'alice-std@example.com' to be 'alice-custom@example.com'` — confirming the fallback chain wasn't reading the namespaced claim.

GREEN gate proof: post-GREEN, `bun run test -- <test files>` reports 5/5 (Task 1) and 7/7 (Task 2) passing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] server/index.error.test.ts initial import failed at module-eval**

- **Found during:** Task 1 RED run
- **Issue:** Plan-supplied test code used a static `import { onErrorHandler } from '../server/index';` at the top of the file. server/index.ts validates env at module-load (calls `process.exit(1)` if `DATABASE_URL`/`AUTH0_DOMAIN`/`AUTH0_AUDIENCE` missing) AND invokes `serve()` at top level, which would bind a port during the test run.
- **Fix:** Set `process.env.*` before a dynamic `await import('./index.js')` (mirroring the existing jwt.test.ts env-setup pattern) and added `vi.mock('@hono/node-server', () => ({ serve: () => ({ port: 0 }) }))` to stub the listener.
- **Files modified:** server/index.error.test.ts (top of file)
- **Commit:** `2d49804` (RED commit ships the corrected import path)

**2. [Rule 1 - Bug] Acceptance grep `?? p.email` failed because the fallback chain was multi-line**

- **Found during:** Task 2 GREEN verification
- **Issue:** Plan acceptance criterion `grep -q "?? p.email" server/auth/jwt.ts` requires the literal substring on a single line. My initial formatting split the ternary across three lines (`?? \n p.email ??\n''`).
- **Fix:** Reformatted the assignment to a single line: `const email = ((payload as Record<string, unknown>)[EMAIL_CLAIM] as string | undefined) ?? p.email ?? '';`
- **Files modified:** server/auth/jwt.ts (line 75)
- **Commit:** `9870fc4` (squashed into GREEN commit; behavior identical)

### Not-fixed / Out of scope

**Pre-existing 5 failing test files** — `server/oci/parClient.test.ts`, `server/routes/cities.test.ts`, `server/routes/photos.test.ts`, `server/routes/handlesCheck.test.ts`, `server/routes/publicReel.test.ts` fail in the isolated worktree environment because they expect a real `DATABASE_URL` / OCI env vars to be set. Confirmed pre-existing (baseline check on the worktree base commit showed the same 5 failures). Out of plan scope per executor scope-boundary rule. Logged here for visibility.

## Auth Gates / Non-autonomous touchpoints

None hit during autonomous code/config execution. The plan's `user_setup` operator steps remain pending:

1. **Auth0 Dashboard** — create + DEPLOY + ATTACH the post-login Action `inject-email-into-access-token` (two-step trap per Pitfall 8). Action code (copy-pasteable):

   ```javascript
   exports.onExecutePostLogin = async (event, api) => {
     if (event.user.email) {
       api.accessToken.setCustomClaim(
         'https://timeline.bryanlam.dev/email',
         event.user.email,
       );
     }
   };
   ```

   Operator-verifiable by decoding the next-issued access token at jwt.io and confirming the `https://timeline.bryanlam.dev/email` claim is present.

2. **Production Postgres backfill (one-off SQL)** — after the Auth0 Action is live and Plan 09-01 has shipped the new server image, operator runs (REDACTED — actual email lives in the operator's password manager):

   ```sql
   UPDATE users SET email = '<known-good-email>'
   WHERE email = '' AND auth0_sub = '<bryan-sub>';
   ```

   Expected row count: 1 (the existing bryan user).

3. **OPTIONAL F1.1 verification rebuild** — `terraform taint module.compute.oci_core_instance.app && terraform apply` to verify cloud-init bootstrap works on a fresh boot. Deferred to the next genuine rebuild event unless the operator wants proactive confirmation. Measured dhparam time will only be available after such a rebuild — plan estimate is 30–90s on Ampere A1.

## Verification confirmation

- [x] `bun run test -- server/index.requestId.test.ts server/index.error.test.ts server/auth/jwt.test.ts` — 12/12 pass
- [x] `bun run typecheck` — clean (no TS errors)
- [x] YAML valid — `ruby -ryaml -e "YAML.safe_load(...)"` succeeds (pyyaml unavailable in env; Ruby validator used as substitute)
- [x] Middleware ordering — `app.use('*', requestId())` at line 26, `app.onError` at line 112 (load-bearing invariant verified)
- [x] No `console.*` added to server diff — `git diff 50db0eb..HEAD -- server/` contains no non-comment console references
- [x] No `hono/logger` import in server/index.ts (confirmed via grep)
- [x] cloud-init.yaml still contains bootcmd, packages, final_message (no accidental deletions)
- [x] No idempotency guard added to dhparam (Pitfall 7 directive)
- [ ] Manual smoke against live deployment — DEFERRED until 09-01 auto-deploy lands the new image; operator triggers a known-throw endpoint and confirms response carries `request_id` matching `X-Request-Id` header.
- [ ] F1.1 cloud-init verified on a real fresh boot — DEFERRED to next rebuild event.

## Known Stubs

None introduced. (Pre-existing changelog references to `.env.example.placeholder` are documentation comments referring to Phase 8 work removed earlier; not stubs.)

## Threat Flags

None. The plan's `<threat_model>` covers all surface introduced (request-id stderr exposure, custom claim trust path, options-ssl-nginx.conf cp path). No NEW security surface beyond what the threat register accepts or mitigates.

## Self-Check: PASSED

- server/index.ts — FOUND (44 added, 3 removed)
- server/index.requestId.test.ts — FOUND (2 tests, passing)
- server/index.error.test.ts — FOUND (3 tests, passing)
- server/auth/jwt.ts — FOUND (16 added, 1 removed; EMAIL_CLAIM + fallback chain present)
- server/auth/jwt.test.ts — FOUND (4 tests added; mint() helper extended; 7/7 passing)
- infra/cloud-init.yaml — FOUND (31 added; F1.1 block + item 8; YAML valid)
- Commit 2d49804 (test request-id + error) — FOUND
- Commit 67e2177 (feat request-id + onError) — FOUND
- Commit eb11213 (test namespaced email) — FOUND
- Commit 9870fc4 (feat namespaced email read) — FOUND
- Commit 7c844be (feat cloud-init F1.1) — FOUND
