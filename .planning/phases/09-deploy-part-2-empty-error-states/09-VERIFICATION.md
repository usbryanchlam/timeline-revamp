---
phase: 09-deploy-part-2-empty-error-states
verified: 2026-06-01T16:25:00Z
status: human_needed
score: 4/4 ROADMAP success criteria verified in code; 1 operator-action checklist + 1 live smoke remain
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "End-to-end tag-driven deploy (SC1 live)"
    expected: "Push v0.1.0 → GHA verify+build+push succeeds, production env reviewer approves, SSH-in migrate+up runs cleanly, curl --retry 5 https://timeline.bryanlam.dev/api/health returns 200"
    why_human: "Requires operator to complete prerequisite setup (DEPLOY_SSH_KEY, OCIR_AUTH_TOKEN, DEPLOY_HOST secrets + 6 repo vars + production environment reviewer); CI cannot self-test the SSH-in or the OCI VM target without that setup"
  - test: "Auth0 Action attached + populated email claim (F9 live)"
    expected: "After operator deploys + attaches `inject-email-into-access-token` to the Login flow, decoding the next-issued access token at jwt.io shows `https://timeline.bryanlam.dev/email` claim; server logs new logins with populated users.email"
    why_human: "Auth0 dashboard configuration is external — code path is unit-tested with 4 new cases but live custom-claim presence cannot be verified without dashboard access"
  - test: "F1.1 cloud-init verification on a fresh VM"
    expected: "`terraform taint module.compute.oci_core_instance.app && terraform apply` rebuilds VM; `nginx -t` passes on first boot without manual standalone-certbot workaround; `openssl dhparam` 30-90s wait observed in cloud-init log"
    why_human: "Requires destructive rebuild of live VM; deferred to next genuine rebuild event per 09-02 SUMMARY"
  - test: "ERR-01 retry tile visual UAT"
    expected: "Throttle network → simulate 5xx via DevTools → tile shows amber border + spinner + 'Retrying in {N}s…' countdown; after 3 fails, shows 'Upload failed. Tap to retry.' amber button"
    why_human: "Real-time UI countdown + amber styling is visual; jsdom unit tests verify structure but not the cinematic feel"
  - test: "ERR-03 MapTiler 429 fallback visual UAT"
    expected: "Block MapTiler domain in DevTools → /app reel surfaces amber `Map service limited; some detail reduced.` top-of-map banner; OSM tiles render below; dismiss × works; reload restores banner same session"
    why_human: "MapLibre AJAXError + sessionStorage flag interaction is live-only; mocks verify the code path but not browser MapLibre behavior"
---

# Phase 9: Deploy part 2 + empty/error states — Verification Report

**Phase Goal (ROADMAP):** GitHub Actions CI builds + auto-deploys on tag. Empty/error states pass for all built surfaces. App is shippable without MP4.

**Verified:** 2026-06-01T16:25:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP SC + CONTEXT must-haves)

| #   | Truth                                                                                            | Status     | Evidence                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SC1: tag push triggers CI build → OCIR push → SSH deploy to VM                                   | ✓ VERIFIED (code) / ? human (live first push) | `.github/workflows/deploy.yml` L15-32 (tag triggers), L77-85 (tag-match guard), L100-104 (arm64 buildx), L106-127 (OCIR login + push), L128-168 (env: production, SSH deploy, migrate-before-up, /api/health smoke, docker logout) |
| 2a  | SC2: ERR-01 photo upload retry (locked literals)                                                 | ✓ VERIFIED | `src/photos/retry.ts:21` `BACKOFF_MS = [2000, 4000, 8000] as const`; `:30` anchored `/^HTTP (\d{3})$/`; uploadQueue retry loop at `uploadQueue.ts:104-134`                                                                            |
| 2b  | SC2: ERR-03 MapTiler 429 → OSM raster fallback                                                   | ✓ VERIFIED | `src/reel/MapCanvas.tsx:56-74` `e.error instanceof AJAXError && e.error.status === 429`; `sessionStorage.setItem('map-fallback-active', '1')` at L67 **BEFORE** `map.setStyle(OSM_RASTER_STYLE, ...)` at L71                          |
| 2c  | SC2: ERR-04 + /app/trips empty-state cards with locked copy                                      | ✓ VERIFIED | `AppReelRoute.tsx:55-64` exact copy "No trips yet." + "Add your first city to start the camera flying." + amber `Add a city` CTA `Link to="/app/trips"`; `TripsRoute.tsx:126-132` `pointer-events-none` overlay + locked copy        |
| 2d  | SC2: ERR-02 MP4 fail card explicitly deferred to Phase 10                                        | ✓ VERIFIED (deferred) | CONTEXT.md L26-27 + L179 + 09-03-SUMMARY.md L62-63 + L158 — deferral chain documented across all three artifacts                                                                                                          |
| 3a  | SC3: health endpoints unchanged (no regression)                                                  | ✓ VERIFIED | `server/index.ts:49-50` — `/health` + `/api/health` both still present                                                                                                                                                                |
| 3b  | SC3: request logging includes request-id; x-request-id header echoed                             | ✓ VERIFIED | `server/index.ts:26` `app.use('*', requestId())` mounted FIRST; `:32-39` custom stderr logger interpolates `[requestId]`; built-in `hono/request-id` echoes header (tested in `server/index.requestId.test.ts`)                       |
| 3c  | SC3: error middleware sanitizes 500, no stack leak, request_id in body, HTTPException pass-through | ✓ VERIFIED | `server/index.ts:102-112` `onErrorHandler` — HTTPException via `err.getResponse()`, other Error → `process.stderr.write` stack + `c.json({ error: 'internal_error', request_id }, 500)`                                              |
| 4   | SC4: launch-shippable without MP4 (no MP4 import dependency)                                     | ✓ VERIFIED | No BullMQ/Redis/Puppeteer import anywhere in 09-01/02/03 changeset; ERR-02 deferral documented; typecheck + test suite green                                                                                                          |
| 5a  | F1.1 cloud-init pre-creates dhparam + options-ssl-nginx.conf BEFORE nginx start                  | ✓ VERIFIED (code) / ? human (live verify) | `infra/cloud-init.yaml:129-133` — `cp options-ssl-nginx.conf` + `openssl dhparam -out ... 2048` in `runcmd`. Nginx is NEVER started by cloud-init (operator brings it up later); files therefore precede first systemctl start by construction. |
| 5b  | F9 jwt.ts reads `https://timeline.bryanlam.dev/email` with `?? payload.email` fallback           | ✓ VERIFIED | `server/auth/jwt.ts:49` `EMAIL_CLAIM = 'https://timeline.bryanlam.dev/email'`; `:74` `(payload as Record<string, unknown>)[EMAIL_CLAIM] ?? p.email ?? ''`                                                                              |
| 6a  | Threat: OCIR token via `--password-stdin`; `docker logout` last                                  | ✓ VERIFIED | `deploy.yml:158` `echo "${OCIR_AUTH_TOKEN}" \| docker login ... --password-stdin`; `:163` `docker logout` as LAST script line                                                                                                          |
| 6b  | Threat: onErrorHandler does NOT leak err.message/err.stack to client                             | ✓ VERIFIED | `server/index.ts:107-109` — stack goes to `process.stderr.write`; client response is fixed shape `{ error: 'internal_error', request_id }` only                                                                                       |
| 6c  | Threat: anchored regex (no ReDoS); sessionStorage BEFORE setStyle; React text auto-escape        | ✓ VERIFIED | `retry.ts:30` fully-anchored `/^HTTP (\d{3})$/`; `MapCanvas.tsx:67` sessionStorage write BEFORE `:71` setStyle; all new UI uses JSX text children, zero `dangerouslySetInnerHTML`                                                       |
| 7   | DESIGN.md fidelity: single amber accent; no public-surface illustrations; ≥44px tap targets       | ✓ VERIFIED | grep over `AppReelRoute.tsx, TripsRoute.tsx, MapFallbackBanner.tsx, PhotoUploader.tsx` → ZERO `bg-blue-*`, `bg-red-*`, `bg-green-*`, `bg-purple-*`, `bg-pink-*` matches; `min-w-[44px]` on retry/dismiss/`Add photos`; no illustration assets added |
| 8   | Stderr discipline: no console.* in new server code                                                | ✓ VERIFIED | `grep "console\." server/index.ts server/auth/jwt.ts` → 1 comment-only mention at jwt.ts:83; no executable console.* introduced                                                                                                       |
| 9a  | `bun run typecheck` exits 0                                                                       | ✓ VERIFIED | Run during verification: `$ tsc -b --noEmit` exits cleanly, no errors                                                                                                                                                                 |
| 9b  | `bun run test` passes                                                                             | ✓ VERIFIED | Run during verification: 405/405 tests passing across 38 test files; new 09-02 + 09-03 test files included (request-id, error handler, retry classifier + loop, MapTiler fallback, empty-state cards)                                  |
| 10  | STATE.md/ROADMAP hygiene: commits on main, all SUMMARYs committed, no dangling continue-here     | ✓ VERIFIED | `git log --oneline` shows 09-01 (cb933c3, 7d01f51, 6430a2f, 3030c9a, 8b47b62, 3cca8d0), 09-02 (2d49804, 67e2177, eb11213, 9870fc4, 7c844be, 8cba19f, d21da6c, f25a50f), 09-03 (b621001..e30151e, baf2348) all on main; no `.continue-here.md` left in 09 dir |

**Score:** 4/4 ROADMAP success criteria covered in code (with the live deploy and Auth0 Action attach explicitly routed to operator human-verification per CONTEXT)

### Deferred Items (addressed in later phases)

| # | Item                                          | Addressed In                | Evidence                                                                              |
| - | --------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| 1 | ERR-02 MP4 render-fail notification card      | Phase 10                    | CONTEXT.md L26, L179: BullMQ + Redis + Puppeteer pipeline lands in Phase 10           |
| 2 | OIDC Identity Propagation Trust + TF workflow | Phase 9.1 micro (or Phase 10.1) | CONTEXT.md L17, L183: schema-discovery spike kept separate from app-code CI         |
| 3 | F4 Instance Principal switch (oci PEM)        | Post-launch hardening       | CONTEXT.md L17, L181                                                                  |
| 4 | MeRoute v2                                    | Phase 12 launch polish      | CONTEXT.md L27, L180                                                                  |

### Required Artifacts

| Artifact                              | Expected                                              | Status     | Details                                                                          |
| ------------------------------------- | ----------------------------------------------------- | ---------- | -------------------------------------------------------------------------------- |
| `.github/workflows/deploy.yml`        | NEW tag-triggered CI/CD pipeline                      | ✓ VERIFIED | 168 lines; 3 jobs verify→build-and-push→deploy; all locked literals present       |
| `docker-compose.prod.yml`             | api `image:` pin (no `build:`)                        | ✓ VERIFIED | `image: ${OCIR_REGISTRY}/${OCIR_REPO}:${IMAGE_TAG}` at L39; no `build:` key      |
| `infra/DEPLOY.md`                     | new `## CI/CD` section                                | ✓ VERIFIED | `## CI/CD` at L780; secrets/vars tables, rollback `gh workflow run` example     |
| `infra/cloud-init.yaml`               | F1.1 dhparam + options-ssl-nginx.conf in runcmd        | ✓ VERIFIED | L129-133, item 8 in header changelog at L31-37                                  |
| `server/index.ts`                     | requestId + custom logger + onErrorHandler            | ✓ VERIFIED | L26 requestId first; L32-39 stderr logger; L102-112 named-exported onErrorHandler |
| `server/auth/jwt.ts`                  | EMAIL_CLAIM constant + fallback chain                 | ✓ VERIFIED | L49 const; L74 single-line fallback `?? p.email ?? ''`                          |
| `src/photos/retry.ts`                 | NEW — anchored regex + locked backoff                 | ✓ VERIFIED | L21 `[2000, 4000, 8000] as const`; L30 fully anchored regex                      |
| `src/photos/uploadQueue.ts`           | retry loop wired to retry.ts; immutable updates       | ✓ VERIFIED | L104-134 `scheduleOne` consumes `BACKOFF_MS`, `MAX_AUTO_RETRIES`, `classifyError` |
| `src/components/PhotoUploader.tsx`    | amber retry tile + StrictMode-safe countdown          | ✓ VERIFIED | L181-191 retrying tile; L119-124 setInterval/cleanup; L33-39 mountedRef pattern  |
| `src/components/MapFallbackBanner.tsx`| NEW — amber dismissible banner                        | ✓ VERIFIED | L29 amber border, locked copy at L31, 44px dismiss tap target at L39             |
| `src/reel/MapCanvas.tsx`              | AJAXError 429 handler + sessionStorage BEFORE setStyle | ✓ VERIFIED | L56-74; flag write L67 BEFORE setStyle L71 (load-bearing invariant)             |
| `src/reel/osmRasterStyle.ts`          | NEW — parallel raster style                           | ✓ VERIFIED | OSM_RASTER_STYLE with `© OpenStreetMap contributors` attribution                  |
| `src/routes/AppReelRoute.tsx`         | empty-state card with locked copy + amber CTA         | ✓ VERIFIED | L51-68; exact copy match; amber CTA `Link to="/app/trips"`                       |
| `src/routes/TripsRoute.tsx`           | overlay card with `pointer-events-none` + locked copy | ✓ VERIFIED | L125-132; pointer-events-none preserves map-as-CTA                              |

### Key Link Verification

| From                                 | To                                                | Via                                                          | Status     | Details                                                                              |
| ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------ |
| deploy.yml verify job                | bun typecheck + bun test                          | `oven-sh/setup-bun@v2` + `bun run typecheck` + `bun run test`| ✓ WIRED    | L46-67                                                                                |
| deploy.yml build-and-push            | OCIR                                              | `docker/login-action@v3` + `docker/build-push-action@v6`     | ✓ WIRED    | L106-127, password from `secrets.OCIR_AUTH_TOKEN`                                    |
| deploy.yml deploy job                | OCI VM                                            | `appleboy/ssh-action@v1` + `docker compose pull/run/up`     | ✓ WIRED    | L138-163; migrate-before-up at L160 before `up -d` at L161                          |
| deploy.yml deploy job                | live `/api/health`                                | `curl --retry 5 --retry-delay 5 -fsSL`                       | ✓ WIRED    | L165-168                                                                              |
| server/index.ts requestId mw         | hono/request-id package                           | `app.use('*', requestId())`                                  | ✓ WIRED    | L26, before all other middleware                                                     |
| server/index.ts app.onError          | exported onErrorHandler                           | `app.onError(onErrorHandler)`                                | ✓ WIRED    | L112; importable for direct contract testing                                          |
| server/auth/jwt.ts requireJwt        | EMAIL_CLAIM with fallback                         | `(payload as Record<string, unknown>)[EMAIL_CLAIM] ?? p.email ?? ''` | ✓ WIRED | L74                                                                                  |
| uploadQueue.ts scheduleOne           | retry.ts BACKOFF_MS + classifyError               | named imports                                                | ✓ WIRED    | uploadQueue.ts:14 imports; L106-129 retry loop body                                  |
| PhotoUploader.tsx retry tile         | uploadQueue.retry()                               | `queueRef.current?.retry(it.id)`                             | ✓ WIRED    | L198                                                                                  |
| MapCanvas.tsx error handler          | OSM_RASTER_STYLE + sessionStorage flag            | `map.setStyle(OSM_RASTER_STYLE, { diff: false })` after flag | ✓ WIRED    | MapCanvas.tsx:67-71                                                                  |
| AppReelRoute empty branch            | /app/trips route                                  | `<Link to="/app/trips">`                                     | ✓ WIRED    | AppReelRoute.tsx:60                                                                  |

### Data-Flow Trace (Level 4)

| Artifact                | Data Variable           | Source                                                       | Produces Real Data | Status     |
| ----------------------- | ----------------------- | ------------------------------------------------------------ | ------------------ | ---------- |
| AppReelRoute.tsx        | `cities`                | `useCitiesQuery()` (Phase 5 — backed by GET /api/cities)     | Yes (with empty branch correctly rendered) | ✓ FLOWING |
| TripsRoute.tsx          | `cities`, `empty`       | `useCitiesQuery()` → `cities.length === 0`                   | Yes                | ✓ FLOWING |
| PhotoUploader.tsx       | `items`                 | `createUploadQueue(...).onItemUpdate` callback               | Yes (real XHR uploads + retry loop)        | ✓ FLOWING |
| MapCanvas.tsx           | `map` events            | `maplibregl.Map` instance + `'error'` event                  | Yes (AJAXError 429 -> setStyle)            | ✓ FLOWING |
| MapFallbackBanner.tsx   | `visible`               | local state (parent owns sessionStorage flag)                | Yes                | ✓ FLOWING |
| server/index.ts logger  | `requestId`             | `c.get('requestId')` populated by hono/request-id middleware | Yes (verified by request-id test cases)    | ✓ FLOWING |
| server/index.ts onError | `reqId`, `err`          | Hono onError dispatch                                        | Yes                | ✓ FLOWING |
| jwt.ts requireJwt       | `email`                 | JWT payload custom claim with fallback chain                 | Yes (jwt.test.ts 4 new cases prove fallback path) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                                    | Command                                           | Result            | Status   |
| ------------------------------------------- | ------------------------------------------------- | ----------------- | -------- |
| TypeScript compilation                      | `bun run typecheck`                               | exit 0, no errors | ✓ PASS   |
| Full test suite (incl. new 09-02 + 09-03)   | `bun run test`                                    | 405/405 passing across 38 files | ✓ PASS  |
| deploy.yml YAML well-formed                 | Parsed via verification of all referenced fields  | All references resolve | ✓ PASS |
| Live tag-driven deploy                      | `git push --tags v0.x.0` → CI run → /api/health   | Pending operator setup | ? SKIP (operator) |
| Auth0 Action custom-claim live              | Decode access token at jwt.io                     | Pending Auth0 dashboard action | ? SKIP (operator) |
| F1.1 cloud-init on fresh VM                 | `terraform taint && apply`                        | Pending rebuild event | ? SKIP (operator) |

### Requirements Coverage

| Requirement | Source Plan(s)  | Description                                                                         | Status              | Evidence                                                                       |
| ----------- | --------------- | ----------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| DEPLOY-03   | 09-01           | GHA CI builds + pushes to OCIR on tag                                               | ✓ SATISFIED         | deploy.yml build-and-push job L69-127                                          |
| DEPLOY-04   | 09-01           | Tagged-release auto-deploy to VM                                                    | ✓ SATISFIED (code), ? human (live first push) | deploy.yml deploy job L128-168; live verification pending operator setup |
| DEPLOY-06   | 09-02           | Production health + request logging + error middleware                              | ✓ SATISFIED         | server/index.ts L26 requestId, L32-39 logger, L102-112 onErrorHandler          |
| ERR-01      | 09-03           | Photo upload retry with exponential backoff, max 3 retries                          | ✓ SATISFIED         | retry.ts L21 + L30; uploadQueue.ts L104-134; PhotoUploader L181-203            |
| ERR-02      | (deferred)      | MP4 render-fail notification card                                                   | DEFERRED (Phase 10) | CONTEXT.md L26-27 + L179; ROADMAP Phase 10 BullMQ + Redis + Puppeteer scope    |
| ERR-03      | 09-03           | MapTiler 429 → OSM fallback + amber banner                                          | ✓ SATISFIED         | MapCanvas L56-74; osmRasterStyle.ts; MapFallbackBanner.tsx                     |
| ERR-04      | 09-03           | 0-city authenticated reel onboarding card                                           | ✓ SATISFIED         | AppReelRoute L51-68 + TripsRoute L125-132 (extension polish)                   |

### Anti-Patterns Found

| File                                | Line | Pattern                                              | Severity | Impact                                                                              |
| ----------------------------------- | ---- | ---------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| (none)                              | —    | No blockers found. No console.*, no leaked stacks, no unanchored regex, no `dangerouslySetInnerHTML`, no non-amber color tokens introduced. | —    | No anti-pattern remediation required. |

### Human Verification Required

See `human_verification:` block in frontmatter. Summary of 5 items routed to operator/human:

1. **End-to-end tag-driven deploy (SC1 live)** — needs operator secrets/vars/environment setup + first `git tag v0.1.0 && git push --tags`. Code path fully verified; live first-firing pending.
2. **Auth0 Action attached + populated email claim (F9 live)** — needs operator to deploy + attach the post-login Action in the Auth0 Dashboard, then verify by decoding a freshly-issued access token at jwt.io.
3. **F1.1 cloud-init verification on a fresh VM** — `terraform taint && apply` to confirm `nginx -t` passes on first boot. Deferred to next genuine rebuild event per 09-02 SUMMARY.
4. **ERR-01 retry tile visual UAT** — DevTools throttle/blocklist → confirm amber border, spinner, countdown, manual-retry button feel cinematic.
5. **ERR-03 MapTiler fallback visual UAT** — block MapTiler domain → confirm amber banner copy and dismissibility, sessionStorage scope, OSM tiles render.

### Gaps Summary

No code gaps. All ROADMAP Phase 9 success criteria are realised in the repo; in-scope requirements (DEPLOY-03/04/06, ERR-01/03/04) ship verified code with passing tests + clean typecheck. ERR-02 is correctly DEFERRED to Phase 10 per CONTEXT D-X and ROADMAP Phase 10 — verification does not fail.

The "human_needed" status reflects the irreducibly-external nature of:
- the first live tag-driven deploy (requires operator's secrets + production environment reviewer + OCIR token + SSH key),
- the Auth0 Action attach (external dashboard configuration),
- the cloud-init bootstrap (requires destructive VM rebuild),
- and the cinematic visual UAT on the new error/empty surfaces.

None of these are code defects; they are the documented operator-action handoff baked into the phase plan.

### Operator Punchlist (Documented-Pending, NOT Verification Failures)

1. **GitHub repo secrets** (4): `DEPLOY_SSH_KEY`, `OCIR_AUTH_TOKEN`, `DEPLOY_HOST`, `VITE_MAPTILER_KEY`
2. **GitHub repo vars** (6): `OCIR_USER`, `OCI_REGION`, `OCI_NAMESPACE`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`
3. **GitHub `production` environment** with required reviewer = `usbryanchlam`
4. **Dedicated SSH key generation** (`ssh-keygen -t ed25519 -f gha-deploy-key`) + `ssh-copy-id` to VM + paste private key into `DEPLOY_SSH_KEY` secret
5. **Auth0 Dashboard** — create + deploy + attach `inject-email-into-access-token` post-login Action to the Login flow
6. **One-off SQL backfill** for existing bryan user's empty `users.email` row
7. **First tag push**: `git tag v0.1.0 && git push origin v0.1.0` → approve `production` env gate in GHA UI → verify `/api/health` 200
8. **Optional F1.1 verification rebuild**: `terraform taint module.compute.oci_core_instance.app && terraform apply`

---

_Verified: 2026-06-01T16:25:00Z_
_Verifier: Claude (gsd-verifier, Opus 4.7 1M)_
