# Phase 9: Deploy part 2 + empty/error states — Pattern Map

**Mapped:** 2026-06-01
**Files analyzed:** 15 (new + modified)
**Analogs found:** 14 / 15 (one new-domain file — `src/photos/retry.ts` — has no in-repo analog; planner uses RESEARCH.md Pattern 5 instead)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.github/workflows/deploy.yml` (NEW) | CI/workflow | event-driven (tag push) | `.github/workflows/terraform.yml.deferred` | exact (same project conventions: jobs, env, perms, `set -euo pipefail`, `environment: production` gate) |
| `infra/cloud-init.yaml` (EDIT) | infra/cloud-init | batch (runcmd list) | `infra/cloud-init.yaml` lines 96–117 (existing runcmd blocks) | exact (in-file pattern reuse) |
| `infra/DEPLOY.md` (EDIT — append `## CI/CD`) | docs | n/a | `infra/DEPLOY.md` existing `##` sections + the lead-in stub at lines 780–790 | exact |
| `docker-compose.prod.yml` (EDIT — `image:` line) | infra/compose | n/a | `docker-compose.prod.yml` lines 19–43 (existing `api:` service) | exact (in-file pattern reuse) |
| `server/index.ts` (EDIT — add `requestId` + extended logger + `app.onError`) | server-middleware | request-response | `server/index.ts` line 21 (existing `app.use('*', logger())`) + the `process.stderr.write` discipline at `server/auth/jwt.ts:70` | exact role-match (Hono middleware) |
| `server/auth/jwt.ts` (EDIT — read custom-claim namespace) | server-auth | request-response | `server/auth/jwt.ts` lines 44–60 (existing `Auth0Payload` + `c.set('auth0Email', p.email ?? '')`) | exact (in-file extension) |
| `server/auth/lazyProvision.ts` (EDIT — pass-through; reads new `c.var.auth0Email`) | server-auth | request-response | `server/auth/lazyProvision.ts` lines 32–55 (consumer side already correct; no change needed) | exact |
| `src/photos/retry.ts` (NEW) | client-utility | transform (error classify + backoff) | NO in-repo analog (no prior backoff helper exists) — use RESEARCH.md Pattern 5 verbatim | none |
| `src/photos/uploadQueue.ts` (EDIT — wrap `runOne` with retry loop) | client-upload-queue | event-driven | `src/photos/uploadQueue.ts` lines 102–111 (existing `scheduleOne` + the `xhrUpload` reject contract at lines 64–68) | exact (in-file extension) |
| `src/components/PhotoUploader.tsx` (EDIT — render `retrying` status) | component | state-render | `src/components/PhotoUploader.tsx` lines 148–180 (existing `<ul>` of `items` w/ status branches) | exact (in-file extension) |
| `src/reel/MapCanvas.tsx` (EDIT — `map.on('error')` handler + style swap) | component | event-driven | `src/reel/MapCanvas.tsx` lines 20–57 (existing `map.on('dragstart' …)` pattern inside init effect) | exact (in-file extension) |
| `src/reel/mapStyle.ts` (EDIT — export both URLs) | client-config | transform | `src/reel/mapStyle.ts` lines 8–12 (existing `STYLE_URL` ternary) | exact (in-file extension) |
| `src/reel/osmRasterStyle.ts` (NEW) | client-config | transform | `src/reel/mapStyle.ts` (parallel module, sibling convention) | role-match |
| `src/components/MapFallbackBanner.tsx` (NEW) | component | state-render | `src/routes/AppReelRoute.tsx` lines 34–48 (existing amber-CTA dismissible-card shape) + `src/components/CityForm.tsx` modal shell convention | role-match |
| `src/routes/AppReelRoute.tsx` (EDIT — copy update) | client-empty-state | state-render | `src/routes/AppReelRoute.tsx` lines 51–68 (existing 0-cities branch — copy edit only) | exact (in-file copy edit) |
| `src/routes/TripsRoute.tsx` (EDIT — overlay card replaces glass-pill) | client-empty-state | state-render | `src/routes/TripsRoute.tsx` lines 125–129 (existing `empty &&` glass-pill block) + `src/routes/AppReelRoute.tsx:51-68` card shell | exact (in-file extension) |

---

## Pattern Assignments

### `.github/workflows/deploy.yml` (CI/workflow, event-driven)

**Analog:** `.github/workflows/terraform.yml.deferred`

**Why this analog:** Both are tag/branch-triggered GHA workflows targeting the same OCI infrastructure, same `environment: production` reviewer-gate convention, same `set -euo pipefail` discipline, same `vars` (non-secret) vs `secrets` split. The deferred-suffix is unrelated to applicability — Phase 9 explicitly inherits its shape.

**Header + `on` + `permissions` + `env` pattern** (lines 17–51):
```yaml
name: terraform
on:
  pull_request:
    paths:
      - 'infra/terraform/**'
      ...
  push:
    branches: [main]
    paths: [...]
  schedule:
    - cron: '0 12 * * 1'

permissions:
  contents: read
  id-token: write          # REQUIRED for OIDC token issuance
  issues: write
  pull-requests: write

env:
  TF_VERSION: '1.10.7'
  AWS_ACCESS_KEY_ID: ${{ secrets.OCI_S3_ACCESS_KEY }}
  ...
```
**Replicate for `deploy.yml`:** Same shape — `pull_request` + `push: branches/tags` + `workflow_dispatch` (per RESEARCH Pattern 1). `permissions: contents: read` (no `id-token` needed since OCIR uses auth token, NOT OIDC — see CONTEXT). `env:` carries `OCIR_REGISTRY`/`OCIR_REPO` per RESEARCH.

**`set -euo pipefail` discipline in script-step run blocks** (lines 60–79, 163–181):
```yaml
- name: Authenticate to OCI via OIDC token exchange
  run: |
    set -euo pipefail
    GH_OIDC=$(curl -sH "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" ...)
    ...
```
**Replicate:** Every multi-line `run: |` block AND the `appleboy/ssh-action` `script: |` block MUST start with `set -euo pipefail` (RESEARCH Pitfall 2 + Pattern 2). Direct precedent in two places in the analog.

**Apply-job `environment: production` reviewer-gate + `concurrency`** (lines 150–158):
```yaml
apply:
  needs: plan
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  environment: production           # D-17 manual reviewer gate (required reviewer = usbryanchlam)
  concurrency:
    group: terraform-apply
    cancel-in-progress: false       # queued applies WAIT — never cancel mid-flight
  steps:
    - uses: actions/checkout@v4
```
**Replicate for `deploy` job:** `environment: production` (CONTEXT default = yes); `concurrency: group: deploy-prod, cancel-in-progress: false` (never cancel mid-deploy — half-migrated state is worse than queued wait). Gate `if: startsWith(github.ref, 'refs/tags/v') || github.event_name == 'workflow_dispatch'`.

**Job dependency chain** (line 151 `needs: plan`):
```yaml
  apply:
    needs: plan
```
**Replicate:** `build-and-push: needs: verify`, `deploy: needs: build-and-push` so a failing verify aborts the chain.

**Action pin convention** (lines 57, 81, 108, 183, 187):
```yaml
- uses: actions/checkout@v4
- uses: hashicorp/setup-terraform@v3
- uses: actions/github-script@v7
- uses: actions/upload-artifact@v4
- uses: actions/download-artifact@v4
```
**Replicate:** Floating major-version tag for first-party + well-known community actions: `actions/checkout@v4`, `docker/setup-qemu-action@v3`, `docker/setup-buildx-action@v3`, `docker/login-action@v3`, `docker/build-push-action@v6`, `appleboy/ssh-action@v1` (per RESEARCH Open Question 2).

---

### `infra/cloud-init.yaml` (infra/cloud-init, batch)

**Analog:** Itself (the existing runcmd at `infra/cloud-init.yaml` lines 96–117) — F1.1 additions follow the same in-file conventions.

**Section-comment + idempotent runcmd block** (lines 96–102):
```yaml
  # --- /var/cache/nginx/public_reel (Phase 7 D-20 nginx cache zone) ---------
  # ops/nginx/timeline.conf declares `proxy_cache_path /var/cache/nginx/public_reel`.
  # Without the directory pre-created with www-data ownership, `nginx -t` errors
  # `mkdir() failed (2: No such file or directory)` the first time the operator
  # tries to validate after symlinking the config in Phase 8 Wave 2.
  - mkdir -p /var/cache/nginx/public_reel
  - chown -R www-data:www-data /var/cache/nginx/public_reel
```
**Replicate for F1.1 block:** Section banner comment with `--- … ---` style. Multi-line explanation tying the change back to the failure mode it prevents. 3–6 runcmd lines max per block. Insert AFTER line 102 (nginx cache block) and BEFORE line 104 (app dir block) — ordering by dependency: the certbot_nginx pkg (line 50) must be installed before its `tls_configs/` path is `cp`-able.

**RESEARCH-locked content for the new block** (RESEARCH Pattern 8):
```yaml
  # --- Pre-create certbot TLS template files (F1.1 bootstrap chicken-egg) ---
  - install -d -m 0755 /etc/letsencrypt
  - cp /usr/lib/python3/dist-packages/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf /etc/letsencrypt/options-ssl-nginx.conf
  - chmod 0644 /etc/letsencrypt/options-ssl-nginx.conf
  - openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
  - chmod 0644 /etc/letsencrypt/ssl-dhparams.pem
```

**Header changelog comment pattern** (lines 6–30):
```yaml
# Phase 8.1.1 — six bugs from Phase 8 Wave 3 + 8.1.1 first-apply UAT fixed.
# See .planning/phases/08-deploy-part-1/.continue-here.md F1 for the trail.
#   1. docker-compose-plugin removed from packages: ...
#   ...
#   7. (Added 2026-06-01, 8.1.1 second re-apply): /opt/timeline-revamp ...
```
**Replicate:** Append `#   8. (Added 2026-06-01, Phase 9 F1.1): pre-create certbot TLS template files so `nginx -t` passes on first boot and `certbot --nginx` (not `--standalone`) works end-to-end. See .continue-here.md F1.1 for the trail.`

---

### `infra/DEPLOY.md` (docs)

**Analog:** `infra/DEPLOY.md` lines 780–790 (the stub Phase 9 must replace) + existing `##` heading conventions (line counts at line 8, 27, 174, 191, 217, 274, 362, 460, 514, 600, 662, 749, 766, 780).

**Existing stub to REPLACE** (lines 780–790):
```markdown
## Phase 9 — what changes from this runbook

Phase 9 automates the manual ship loop:
- GitHub Actions builds the image on `git push --tags vX.Y.Z`.
- The image is pushed to OCI Container Registry.
- A deploy hook on the VM pulls the new tag and runs
  `docker compose pull && docker compose up -d`.
```
**Replicate:** Replace the stub with a full `## CI/CD` section. Mirror sibling sections' style (`## Bootstrap`, `## Environment Variables`) — short paragraph intro → bulleted prerequisite list → step-by-step block → troubleshooting subsection. Per RESEARCH Open Question 3, include the "When tag-match guard fails" recovery runbook.

**Pattern to copy from `## Environment Variables` (line 191):** Table-form secret/var enumeration. The new section adds `OCIR_AUTH_TOKEN`, `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `OCIR_USER`, `OCIR_REGISTRY` (per RESEARCH Runtime State Inventory).

---

### `docker-compose.prod.yml` (infra/compose)

**Analog:** Itself (lines 19–43, the existing `api:` service).

**Current `api:` service** (lines 19–43):
```yaml
  api:
    build:
      context: .
      args:
        VITE_MAPTILER_KEY: ${VITE_MAPTILER_KEY}
        VITE_AUTH0_DOMAIN: ${VITE_AUTH0_DOMAIN}
        VITE_AUTH0_CLIENT_ID: ${VITE_AUTH0_CLIENT_ID}
        VITE_AUTH0_AUDIENCE: ${VITE_AUTH0_AUDIENCE}
    env_file: .env
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://timeline:${POSTGRES_PASSWORD}@postgres:5432/timeline
      PORT: 8787
    ports:
      - "127.0.0.1:8787:8787"
    ...
```
**Replicate:** Replace `build:` block with `image: ${OCIR_REGISTRY}/${OCIR_REPO}:${IMAGE_TAG}` (per RESEARCH Pattern 2 — the deploy step writes `.env.tag` with these vars). Keep `env_file: .env` (existing); add `--env-file .env.tag` ordering on the SSH script side (NOT in the compose file — Compose merges in CLI-order, see RESEARCH Pitfall 3). The `env_file:` line stays unchanged because the SSH script supplies tag-overlay via the `--env-file` CLI flag, which takes precedence by Compose's last-wins merge semantics.

**Comment pattern** (lines 1–8):
```yaml
# Production override layered on top of docker-compose.yml.
# Compose merges by service key, so this file only declares the deltas:
#   - postgres: strip the dev port publish (D-11), restart=always.
#   - api: new service definition (dev doesn't run the API in compose;
#     dev uses tsx watch on the host instead).
#
# Invoke with:
#   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
**Replicate:** Update the header comment block — note the shift from `build:` to `image:` and that CI/CD invokes via `--env-file .env --env-file .env.tag` to pin `${IMAGE_TAG}`.

---

### `server/index.ts` (server-middleware, request-response)

**Analog:** `server/index.ts` itself (in-file extension) + `server/auth/jwt.ts:70` for the stderr discipline.

**Existing middleware order** (lines 19–21):
```typescript
export const app = new Hono();

app.use('*', logger());
```
**Replicate:** Add `app.use('*', requestId())` BEFORE the logger (RESEARCH Pattern 4 — request id must exist before the log line can include it). Replace the bare `logger()` with the custom logger middleware that interpolates `c.get('requestId')`.

**Existing `process.stdout` / `process.stderr` discipline** (line 102):
```typescript
serve(
  { fetch: app.fetch, port: env.PORT },
  (info) => {
    // process.stdout, not console — coding-style.md no-console-log rule.
    process.stdout.write(`API listening on http://localhost:${info.port}\n`);
  },
);
```
And `server/auth/jwt.ts` line 70:
```typescript
process.stderr.write(`JWT validation failed: ${msg}\n`);
```
**Replicate:** New `app.onError(...)` handler uses `process.stderr.write(...)`, NEVER `console.error` (project rule). Comment pattern: explicit reference to `coding-style.md` to document the intent.

**Existing comment style** (lines 53–58):
```typescript
// AUTHENTICATED — JWT validation, then lazy provisioning, then routes.
// Order matters: requireJwt MUST run before lazyProvisionUser because
// the latter reads c.var.auth0Sub set by the former.
//
// Hono path matching: ...
```
**Replicate:** New middleware blocks get inline rationale tying middleware order to the constraint it enforces. The `requestId()` → `logger` ordering deserves the same explicit comment.

**Mount-order invariant** (lines 79–81):
```typescript
// Mount-order invariant (load-bearing): every app.(get|use)('/api/...')
// above MUST register before this catch-all. Hono evaluates middleware
// in registration order — an earlier '/*' mount would swallow /api/*.
```
**Replicate:** `app.onError(...)` registration order is also load-bearing — it catches throws from anything registered BEFORE it. Place after all routes, before the SPA fallback's `if (Bun) {…}` block (the SPA fallback IS a route, so onError should still be after it for symmetry, but technically onError catches throws regardless of registration order — verify against current Hono behavior in test, not by reading code).

---

### `server/auth/jwt.ts` (server-auth, request-response)

**Analog:** `server/auth/jwt.ts` itself, lines 44–60.

**Existing `Auth0Payload` + email extract** (lines 44–60):
```typescript
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
    ...
```
**Replicate per RESEARCH Pattern 9:**
- Add `const EMAIL_CLAIM = 'https://timeline.bryanlam.dev/email';` near the top constants (line 21–22 area).
- Replace line 60 with: `const email = (payload as Record<string, unknown>)[EMAIL_CLAIM] as string | undefined ?? p.email ?? ''; c.set('auth0Email', email);`
- Keep the `?? p.email` fallback for back-compat during the brief in-flight-token window (RESEARCH Pitfall 8 + Runtime State Inventory).
- Update `Auth0Payload` interface comment noting the namespace lookup (the index-signature gymnastics noted in RESEARCH Pattern 9).

**Existing test mint pattern** (`server/auth/jwt.test.ts` lines 42–51):
```typescript
async function mint(opts: { exp?: number; aud?: string }): Promise<string> {
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: KID, typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(opts.aud ?? AUDIENCE)
    .setSubject('auth0|test-user')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 3600)
    .sign(signKey);
}
```
**Replicate for F9 tests:** Extend `mint()` to accept `claims?: Record<string, unknown>` and chain `.setClaim('https://timeline.bryanlam.dev/email', '...')` (or replace `SignJWT({})` with `SignJWT(claims)`). New test cases per RESEARCH Validation Architecture: `customClaimEmail`, `fallbackToStandardEmail`.

---

### `server/auth/lazyProvision.ts` (server-auth, request-response)

**Analog:** Itself, lines 32–55.

**Existing consumption of `c.var.auth0Email`** (lines 33–34):
```typescript
const auth0Sub = c.var.auth0Sub;
const auth0Email = c.var.auth0Email;
```
**Replicate:** NO code change needed — consumer reads the same `c.var.auth0Email` name; the source change happens in jwt.ts. Verify by greping for `auth0Email` — only one read site (this file, line 34) and one write site (jwt.ts:60 → modified per F9 above). The handle picker / me route reads via `c.var.user.email` (post-provisioning), so already insulated.

---

### `src/photos/retry.ts` (client-utility, transform)

**Analog:** NONE in-repo (project has no prior backoff/retry helper). Use RESEARCH.md Pattern 5 verbatim.

**Cross-cutting analog for module shape:** `src/photos/canvasResize.ts` (74 lines) and `src/reel/motion.ts` are existing examples of small focused utility modules with `export const` config blocks + exported pure functions, following the project's "many small files" rule (per coding-style.md).

**Direct code to lift from RESEARCH Pattern 5:**
```typescript
// src/photos/retry.ts
export const BACKOFF_MS = [2000, 4000, 8000] as const;
export const MAX_AUTO_RETRIES = BACKOFF_MS.length;

export type RetryClass = 'transient' | 'terminal-too-large' | 'terminal-other';

export function classifyError(err: unknown): RetryClass {
  if (!(err instanceof Error)) return 'terminal-other';
  const msg = err.message;
  if (msg === 'Network error') return 'transient';
  const m = msg.match(/^HTTP (\d{3})$/);
  if (!m) return 'terminal-other';
  const status = Number(m[1]);
  if (status === 413) return 'terminal-too-large';
  if (status === 429 || status >= 500) return 'transient';
  return 'terminal-other';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```
**Why these regexes are safe:** `^HTTP (\d{3})$` is fully anchored — no catastrophic backtracking (RESEARCH Security Domain V5). The reject shape is the contract emitted by `xhrUpload` in `uploadQueue.ts` lines 64–68: `reject(new Error(\`HTTP ${xhr.status}\`))` and `reject(new Error('Network error'))`.

**Tests:** New file `src/photos/retry.test.ts` (Wave 0 gap per RESEARCH). Standard vitest pattern; no in-repo analog needed.

---

### `src/photos/uploadQueue.ts` (client-upload-queue, event-driven)

**Analog:** Itself, lines 102–111 + the xhrUpload reject contract at lines 64–68.

**Existing `scheduleOne` (wrap target)** (lines 102–111):
```typescript
function scheduleOne(item: UploadQueueItem): void {
  void limit(async () => {
    try {
      await runOne(item, abortFlag);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      updateItem(item.id, { kind: 'failed', reason });
    }
  });
}
```
**Replicate per RESEARCH Pattern 5 pseudocode:** Wrap the `await runOne(item, abortFlag)` call in a for-loop over `[0..MAX_AUTO_RETRIES]`:
```typescript
for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
  try {
    await runOne(item, abortFlag);
    return;
  } catch (err) {
    const klass = classifyError(err);
    if (klass !== 'transient' || attempt === MAX_AUTO_RETRIES || abortFlag.aborted) {
      const reason = err instanceof Error ? err.message : String(err);
      updateItem(item.id, { kind: 'failed', reason });
      return;
    }
    const delay = BACKOFF_MS[attempt];
    updateItem(item.id, { kind: 'retrying', attempt: attempt + 1, nextAttemptAt: Date.now() + delay });
    await sleep(delay);
    if (abortFlag.aborted) return;
  }
}
```

**Extend `UploadStatus` union** (lines 19–24):
```typescript
export type UploadStatus =
  | { readonly kind: 'queued' }
  | { readonly kind: 'converting' }
  | { readonly kind: 'uploading'; readonly progress: number }
  | { readonly kind: 'done' }
  | { readonly kind: 'failed'; readonly reason: string };
```
**Replicate:** Add `| { readonly kind: 'retrying'; readonly attempt: number; readonly nextAttemptAt: number }` — the readonly + discriminated-union shape is preserved.

**Immutability rule** (lines 93–100 + module-level comment line 9):
```typescript
/**
 * Immutability: item status updates always produce a new UploadQueueItem object
 * via spread — items in the Map are never mutated in-place.
 */
...
function updateItem(id: string, status: UploadStatus): UploadQueueItem {
  const prev = items.get(id)!;
  // Immutable update: spread prev, replace status
  const next: UploadQueueItem = { ...prev, status };
  items.set(id, next);
  ...
}
```
**Replicate:** New `retrying` state goes through the SAME `updateItem(...)` helper. Never mutate the existing item in-place. (Aligns with `coding-style.md` immutability rule.)

**Manual `retry()` reset semantics** (lines 130–135):
```typescript
function retry(id: string): void {
  const item = items.get(id);
  if (!item || item.status.kind !== 'failed') return;
  const queued = updateItem(id, { kind: 'queued' });
  scheduleOne(queued);
}
```
**Replicate:** Existing manual `retry()` is the operator's "tap to retry" path. The auto-retry loop must NOT call this — it's internal to `scheduleOne` (RESEARCH Pattern 5 Pitfalls). The manual `retry()` re-enters `scheduleOne` which starts a FRESH `attempt=0` loop — counter naturally resets.

---

### `src/components/PhotoUploader.tsx` (component, state-render)

**Analog:** Itself, lines 148–180 (the existing `<ul>` of items with discriminated-status branches).

**Existing status-branch pattern** (lines 149–178):
```tsx
{items.map((it) => (
  <li key={it.id} className="flex items-center gap-3 text-[13px]">
    <span className="truncate flex-1">{it.file.name}</span>
    {it.status.kind === 'uploading' && (
      <div className="w-24 h-1.5 rounded-full bg-bg-elev overflow-hidden">
        <div className="h-full bg-amber-500" style={{ width: `${...}%` }} />
      </div>
    )}
    {it.status.kind === 'converting' && (<span className="text-ink-mute">Converting…</span>)}
    {it.status.kind === 'done' && (<span className="text-success-500">Done</span>)}
    {it.status.kind === 'failed' && (
      <button ... className="text-amber-500 underline ... min-w-[44px]">
        Upload failed. Tap to retry.
      </button>
    )}
  </li>
))}
```
**Replicate:** Add a new `{it.status.kind === 'retrying' && (...)}` branch with amber border + `Retrying in {N}s…` caption + spinner. Reuse the existing amber tokens (`bg-amber-500`, `text-amber-500`) — single-accent rule preserved. The countdown computes `Math.max(0, Math.ceil((it.status.nextAttemptAt - now) / 1000))` driven by a `useState(Date.now())` + `useEffect` setInterval tick at 1s cadence (or use `requestAnimationFrame` — RESEARCH defers detail to "Claude's Discretion").

**Tap-target rule** (line 135, 173):
```tsx
className="bg-amber-500 text-black px-4 py-2 rounded-lg font-semibold ... min-w-[44px]"
```
**Replicate:** Any new tappable element (the dismiss × button on terminal-fail tile per CONTEXT) gets `min-w-[44px]` tap target.

---

### `src/reel/MapCanvas.tsx` (component, event-driven)

**Analog:** Itself, lines 20–57 (existing init-effect with `map.on(...)` listeners).

**Existing `map.on(...)` registration site** (lines 27–47):
```tsx
const map = new maplibregl.Map({ container, style: STYLE_URL, ... });
mapRef.current = map;

// Forward user-initiated drag/zoom (when interactive is briefly enabled)
// up to the gesture machine via the parent callback.
map.on('dragstart', () => onUserMapInteract?.());
map.on('zoomstart', () => onUserMapInteract?.());
```
**Replicate per RESEARCH Pattern 6:** Inside the same init effect (after line 47, before line 49 cleanup), add:
```tsx
map.on('error', (e) => {
  if (!(e.error instanceof AJAXError)) return;
  if (e.error.status !== 429) return;
  if (!e.error.url.includes('api.maptiler.com')) return;
  if (sessionStorage.getItem('map-fallback-active')) return;
  const view = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
  sessionStorage.setItem('map-fallback-active', '1');
  map.setStyle(OSM_RASTER_STYLE, { diff: false });
  map.once('styledata', () => map.jumpTo(view));
  onFallbackActivated?.();
});
```
(RESEARCH Pattern 6 + Pitfall 6 — preserve view via getCenter/getZoom before setStyle.)

**Import shape** (line 2):
```tsx
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
```
**Replicate:** Extend to `import maplibregl, { AJAXError, type Map as MapLibreMap } from 'maplibre-gl';` — same default-with-named import already used.

**Style URL source** (line 4):
```tsx
import { STYLE_URL } from '@/reel/mapStyle';
```
**Replicate:** Add `import { OSM_RASTER_STYLE } from '@/reel/osmRasterStyle';` — sibling-module convention matches.

**Props shape + `onUserMapInteract?` callback** (lines 7–13):
```tsx
interface Props {
  readonly chapters: readonly CityChapter[];
  readonly chapterIndex: number;
  readonly stateName: ReelStateName;
  readonly onUserMapInteract?: () => void;
}
```
**Replicate:** Add `readonly onFallbackActivated?: () => void;` — same `readonly` + optional callback convention. Caller (a Reel ancestor) renders the `<MapFallbackBanner />` when triggered.

**Effect-deps + eslint-disable comment style** (lines 54–57):
```tsx
return () => { ... };
// chapters/onUserMapInteract intentionally not deps — the map is initialized
// exactly once and chapter changes drive flyTo via the next effect.
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```
**Replicate:** The new `map.on('error')` handler lives INSIDE the same init effect — no new dep changes needed.

---

### `src/reel/mapStyle.ts` (client-config, transform)

**Analog:** Itself, lines 8–12.

**Existing pattern** (lines 8–12):
```typescript
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;

export const STYLE_URL: string = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`
  : 'https://demotiles.maplibre.org/style.json';
```
**Replicate:** Either (a) keep as-is and add the OSM raster style in a parallel `osmRasterStyle.ts` (RESEARCH-recommended structure), OR (b) export `MAPTILER_STYLE_URL` and `OSM_RASTER_STYLE` from this module. Either is fine; RESEARCH defaults to (a) for the "many small files" rule.

**Module-load `console.warn`** (lines 14–21):
```typescript
if (!MAPTILER_KEY && typeof window !== 'undefined') {
  // Single warning at module load; never inside a render path.
  // eslint-disable-next-line no-console
  console.warn(
    '[mapStyle] VITE_MAPTILER_KEY not set — falling back to demotiles. ' +
      'See .env.example for setup.',
  );
}
```
**Note:** This `console.warn` is a documented exception (the `eslint-disable-next-line no-console` comment is explicit). Pre-existing technical debt; do NOT add NEW `console.*` calls without the same documented exception (project rule from `coding-style.md`).

---

### `src/reel/osmRasterStyle.ts` (client-config, transform) — NEW

**Analog:** `src/reel/mapStyle.ts` (sibling module, single-export config-as-data pattern).

**Replicate:** Single `export const OSM_RASTER_STYLE = { ... } as const;` shape with attribution literal. Lift verbatim from RESEARCH Pattern 6:
```typescript
export const OSM_RASTER_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'osm', type: 'raster', source: 'osm' },
  ],
} as const;
```
**`as const` rationale:** Matches the project's preference for narrowed literal types — same pattern as `src/photos/retry.ts:BACKOFF_MS` above and existing `STYLE_URL: string` type-annotation convention.

---

### `src/components/MapFallbackBanner.tsx` (component, state-render) — NEW

**Analog:** `src/routes/AppReelRoute.tsx` lines 51–68 (card shell) + `src/components/PhotoUploader.tsx` lines 169–178 (amber CTA button + dismiss pattern).

**Card shell** (AppReelRoute lines 51–66):
```tsx
<div className="app-reel-host h-[100dvh] bg-bg flex items-center justify-center p-6">
  <div className="space-y-4 text-center max-w-sm">
    <h2 className="text-display text-2xl">No trips yet.</h2>
    <p className="text-ink-mute">Add your first city to start the camera flying.</p>
    <Link to="/app/trips" className="inline-block bg-amber-500 text-black px-4 py-2 rounded-lg font-semibold ...">
      Add a city
    </Link>
  </div>
</div>
```
**Replicate for banner:** Top-of-map dismissible card. Position: `absolute top-4 left-1/2 -translate-x-1/2` (or `inset-x-0 top-4 mx-auto w-max`). Color tokens: `bg-bg-elev border border-amber-500/40 text-ink` (amber accent on the border only — single-accent rule). Copy: `Map service limited; some detail reduced.` Dismiss × button on the right with `min-w-[44px]` tap target and `text-ink-mute hover:text-ink`. Use `aria-live="polite"` for screen-reader announcement.

**Dismiss-pattern** (PhotoUploader lines 169–177):
```tsx
<button
  type="button"
  onClick={() => queueRef.current?.retry(it.id)}
  className="text-amber-500 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 min-w-[44px]"
>
  Upload failed. Tap to retry.
</button>
```
**Replicate:** `focus-visible:ring-2 focus-visible:ring-amber-500` focus ring is the project convention for any tappable element (a11y compliance per DESIGN.md). Apply to the × dismiss button.

**Dismiss state:** RESEARCH says dismissable but re-shows next session (sessionStorage flag `map-fallback-active`). The banner's `useState(true)` for visibility plus a `onDismiss?: () => void` callback to parent. Parent does NOT clear the sessionStorage flag (the style is still OSM until page reload).

---

### `src/routes/AppReelRoute.tsx` (client-empty-state, state-render)

**Analog:** Itself, lines 51–68.

**Existing 0-cities branch** (lines 51–68):
```tsx
if (cities.length === 0) {
  return (
    <div className="app-reel-host h-[100dvh] bg-bg flex items-center justify-center p-6">
      <div className="space-y-4 text-center max-w-sm">
        <h2 className="text-display text-2xl">Your reel will appear here.</h2>
        <p className="text-ink-mute">
          Add your first city to start the camera flying.
        </p>
        <Link to="/app/trips" className="inline-block bg-amber-500 text-black px-4 py-2 rounded-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg">
          Add a city
        </Link>
      </div>
    </div>
  );
}
```
**Replicate per RESEARCH Pattern 7:** ONLY edit is the h2 copy — replace `Your reel will appear here.` with `No trips yet.` (CONTEXT-locked). The `<p>` already matches CONTEXT (`Add your first city to start the camera flying.`). The `<Link>` already matches (`Add a city` + amber tokens). No structural change — copy edit only.

---

### `src/routes/TripsRoute.tsx` (client-empty-state, state-render)

**Analog:** Itself, lines 125–129 (existing glass-pill) + `AppReelRoute.tsx:51-68` card shell for the replacement.

**Existing 0-city pill** (lines 125–129):
```tsx
{empty && (
  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-max max-w-[90%] glass-pill px-4 py-3 rounded-full text-ink text-sm pointer-events-none">
    Drop a pin on the map to start your reel
  </div>
)}
```
**Replicate per RESEARCH Pattern 7 + CONTEXT lock:** Replace with a card overlaid on the map's LOWER half:
```tsx
{empty && (
  <div className="absolute inset-x-0 bottom-6 mx-auto w-max max-w-[90%]
                  bg-bg-elev border border-line rounded-2xl px-5 py-4 text-center
                  shadow-xl pointer-events-none">
    <p className="text-ink mb-1">Tap the map to add your first stop.</p>
    <span aria-hidden="true" className="inline-block text-amber-500 text-xl">↑</span>
  </div>
)}
```
- `bottom-6` instead of `top-1/2` — RESEARCH calls for the card on the lower half of the map (top half is the map).
- `bg-bg-elev border border-line rounded-2xl` instead of `glass-pill` — RESEARCH shows the card style. Glass-pill is replaced.
- `pointer-events-none` preserved — the map IS the CTA, the card must not block tap-through to the map.
- Amber arrow `↑` glyph pointing upward (at the map) — single-accent rule preserved; the arrow IS the only amber element.

**Parent layout `h-1/2 relative` on the map wrapper** (line 118) is preserved.

---

## Shared Patterns

### Authentication
**Source:** `server/auth/jwt.ts` + `server/auth/lazyProvision.ts`
**Apply to:** No new authenticated routes are added in Phase 9. The F9 modification preserves the existing `requireJwt` → `lazyProvisionUser` → route chain. New error middleware (`app.onError`) runs at the global Hono level and is independent of auth.

### Error Handling — server side
**Source:** `server/auth/jwt.ts:63-72` (the existing try/catch pattern that collapses jose's specific errors to a single 401 + stderr log)
```typescript
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`JWT validation failed: ${msg}\n`);
  return c.json({ error: 'invalid_token' }, 401);
}
```
**Apply to:** New `app.onError(err, c)` handler. Same stderr write convention, same `{ error: '...' }` JSON envelope (NO stack trace to client per RESEARCH Security Domain V7), same "collapse internal detail" discipline. The new handler ADDS request-id correlation:
```typescript
const requestId = c.get('requestId');
const stack = err instanceof Error && err.stack ? err.stack : String(err);
process.stderr.write(`[${requestId}] ERROR ${stack}\n`);
return c.json({ error: 'internal_error', request_id: requestId }, 500);
```

### Error Handling — client side
**Source:** `src/routes/AppReelRoute.tsx:34-48` (error retry card pattern)
```tsx
if (error) {
  return (
    <div className="app-reel-host h-[100dvh] bg-bg flex items-center justify-center p-6">
      <div className="space-y-3 text-center">
        <p className="text-ink">Couldn&apos;t load your reel.</p>
        <button type="button" onClick={() => void refetch()} className="bg-amber-500 text-black px-4 py-2 rounded-lg ...">
          Retry
        </button>
      </div>
    </div>
  );
}
```
**Apply to:** All new error/retry UI (the ERR-01 retry tile branch, the MapFallbackBanner). Card shell + amber CTA + `focus-visible:ring` is the project convention. Do not introduce new tokens, new icons, or new layout primitives.

### Immutability (CRITICAL — coding-style.md)
**Source:** `src/photos/uploadQueue.ts:9-11, 93-100` (the module-level comment + the `updateItem` spread)
**Apply to:** All client-side state updates in Phase 9 — `retry.ts` returns new objects, `uploadQueue.ts` retry-loop updates flow through `updateItem(...)`, `MapFallbackBanner` uses `useState` with replacement-not-mutation. Same rule from project `coding-style.md`: "ALWAYS create new objects, NEVER mutate existing ones."

### Logging discipline (CRITICAL — coding-style.md)
**Source:** `server/index.ts:102` + `server/auth/jwt.ts:70`
```typescript
// process.stdout, not console — coding-style.md no-console-log rule.
process.stdout.write(`API listening on http://localhost:${info.port}\n`);
```
**Apply to:** `app.onError` writes stack to `process.stderr.write(...)`, NEVER `console.error`. The new request-id-augmented logger writes via `process.stderr.write(...)`. Any new server-side log surface in Phase 9 uses stderr (errors) or stdout (informational). NEVER `console.log`/`console.error`/`console.warn` in NEW code. (Pre-existing `console.warn` at `src/reel/mapStyle.ts:17` has an explicit `eslint-disable` and is grandfathered.)

### Tap-target sizing (DESIGN.md — accessibility)
**Source:** `src/components/PhotoUploader.tsx:135, 173`
```tsx
className="... min-w-[44px]"
```
**Apply to:** Every new tappable element in Phase 9 — the retry tile's button, the MapFallbackBanner dismiss ×, the empty-state CTAs. 44×44 minimum.

### Amber-accent single-token rule (DESIGN.md L72, L85-87 — LOCKED)
**Source:** `src/routes/AppReelRoute.tsx:42, 61`, `src/components/PhotoUploader.tsx:135, 159, 173`
```tsx
className="bg-amber-500 text-black ..."  // primary CTA
className="text-amber-500 ..."           // accent text / link
className="focus-visible:ring-amber-500" // focus ring
```
**Apply to:** ALL new error/empty UI. RESEARCH Pattern 7 + CONTEXT lock: "Single-accent rule preserved." Never introduce blue/green/red CTAs. Acceptance check: `grep -E "bg-(blue|green|red|yellow|orange|pink|purple|indigo)-" src/components/MapFallbackBanner.tsx src/photos/RetryTile.tsx` should return zero matches.

### Tag pin convention (RESEARCH Open Question 2)
**Source:** `.github/workflows/terraform.yml.deferred:57, 81, 108, 183, 187`
**Apply to:** `.github/workflows/deploy.yml` — floating major version (`@v4`, `@v3`, `@v6`, `@v1`) for all GHA actions. Document precedent in the deploy.yml header comment.

### `set -euo pipefail` for every multi-line shell block
**Source:** `.github/workflows/terraform.yml.deferred:61, 164` + RESEARCH Pitfall 2
**Apply to:** Every `run: |` and `appleboy/ssh-action` `script: |` in `deploy.yml`. Mandatory first line.

---

## Patterns to AVOID

| Pattern | Why | Source of constraint |
|---------|-----|----------------------|
| `console.log` / `console.error` / `console.warn` in new code | Project rule: stderr/stdout only via `process.stderr.write` | `~/.claude/rules/typescript/coding-style.md` + existing `server/index.ts:101` comment |
| Mutating `UploadQueueItem.status` in-place | Project rule: immutability via spread | `~/.claude/rules/common/coding-style.md` + `src/photos/uploadQueue.ts:9-11` |
| `cat << 'EOF'` heredoc for file creation by the planner/implementer | Planner protocol: always use Write tool | gsd protocol |
| Empty-state illustrations (Lucide line-icons, SVG illustrations) on `/app` | CONTEXT lock: "skip for visual consistency" even though DESIGN.md allows on `/app` | CONTEXT.md, RESEARCH Pattern 7 Pitfalls |
| Non-amber CTAs (blue/green/red/etc.) | Single-amber-accent rule | DESIGN.md L85-87 + `CLAUDE.md` "Three locked risks" |
| `c.json({...}, 500)` in route handlers (silently swallowing errors) | Bypasses `app.onError` global logging; loses request-id correlation | RESEARCH Pattern 4 Pitfalls + RESEARCH Pitfall 5 |
| Hand-rolled UUID middleware | `hono/request-id` exists; configurable; zero deps | RESEARCH Don't Hand-Roll table |
| MapLibre `setStyle(s)` without `{ diff: false }` | Vector→raster source-type mismatch crashes diff mode | RESEARCH Pattern 6 Pitfalls |
| MapLibre style swap without preserving view (center/zoom/bearing/pitch) | `setStyle({diff:false})` resets map state to style defaults | RESEARCH Pitfall 6 |
| `docker login -p $TOKEN` plaintext (logs the token) | Credential disclosure | RESEARCH Anti-Patterns + Security V14 |
| Running `db:migrate` AFTER `docker compose up -d` | Race condition: new container starts with old schema, fails, restarts | RESEARCH Anti-Patterns |
| Using `:latest` tag in the deploy step (instead of pinned `vX.Y.Z`) | Defeats tag-pin rollback | RESEARCH Anti-Patterns + CONTEXT.md image-tag scheme |
| `appleboy/ssh-action@master` floating | Unstable; pin to `@v1` floating major instead | RESEARCH State of the Art |
| `bun install` on the VM during deploy | Image already contains `node_modules`; wasteful + non-reproducible | RESEARCH Anti-Patterns |
| `cp << 'EOF'` style file writes inside `runcmd` (multi-line) | Cloud-init runcmd parses YAML strictly; multi-line heredocs need explicit `|` block scalar | `infra/cloud-init.yaml:77-78` shows the only safe multi-line pattern |
| Grep-based acceptance check that doesn't strip comments | Comments containing `console.log` would falsely match | MEMORY: `feedback_grep_guard_vs_comments.md` |
| Re-introducing `glass-pill` class for the /app/trips empty card | RESEARCH explicitly says the pill is replaced by the bordered card | RESEARCH Pattern 7 |

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/photos/retry.ts` (NEW) | client-utility | transform | No prior backoff/retry helper exists. Planner uses RESEARCH.md Pattern 5 verbatim. Module-shape analog is `src/photos/canvasResize.ts` (small focused utility module with `export const` config + pure functions). |

---

## Metadata

**Analog search scope:**
- `.github/workflows/` — workflow analog (1 file)
- `infra/` — cloud-init + DEPLOY.md + compose (3 files)
- `server/` — middleware + auth + routes (8 files surveyed; 3 used)
- `src/photos/` — upload queue + components (3 files surveyed; 2 used)
- `src/reel/` — map components + style (3 files surveyed; 2 used)
- `src/routes/` — empty-state routes (5 files surveyed; 2 used)
- `src/components/` — UI primitives (1 file used)

**Files scanned:** 24
**Files read in full:** 11 (terraform.yml.deferred, cloud-init.yaml, server/index.ts, server/auth/jwt.ts, server/auth/lazyProvision.ts, src/photos/uploadQueue.ts, src/reel/MapCanvas.tsx, src/reel/mapStyle.ts, src/routes/AppReelRoute.tsx, src/routes/TripsRoute.tsx, src/components/PhotoUploader.tsx, docker-compose.yml, docker-compose.prod.yml)
**Files partially read (offset):** 2 (server/auth/jwt.test.ts head, infra/DEPLOY.md tail)
**Pattern extraction date:** 2026-06-01
