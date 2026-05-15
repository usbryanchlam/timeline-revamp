# Phase 7: Public URLs + handle reservation - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 makes `/u/:handle` work unauthenticated so recruiters can open Bryan's reel without signing in, and forces every authenticated user to pick a handle before they can use `/app/*`. Specifically:

1. **Handle picker UI (AUTH-07)** — Blocking modal on first `/app/*` visit if `users.handle IS NULL`. Live debounced uniqueness check. Backend already exists (Phase 4: `POST /api/me/handle`, regex/reserved-word validation in `server/handles/`).
2. **Public read API (PUBLIC-01)** — New `GET /api/public/u/:handle` returns `{ user, cities, photos }` in one shot, no JWT. Frontend `/u/:handle` route swaps from its Phase 3 seeded-data stub to fetching this endpoint.
3. **Empty / 1-city states (PUBLIC-02, PUBLIC-03, REEL-08)** — Unknown handle → dedicated 404 route. Known handle with 0 cities → slow-rotating globe + "No trips yet. Check back soon." Known handle with 1 city → continuous 360° orbit at zoom 14 / pitch 60 / 8s per revolution.
4. **Nginx cache config (PUBLIC-04)** — Phase 7 commits `ops/nginx/timeline.conf` to the repo with `proxy_cache_path` + `proxy_cache_key` directives + Cache-Control headers from the app. Phase 8 wires the file into the live VM.

**Locked by ROADMAP / PROJECT.md / earlier phases (do not re-litigate):**
- Handle regex `^[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])?$`, length 3–20, lowercase-enforced — `server/handles/validate.ts` (Phase 4)
- Reserved word list — `server/handles/reservedWords.ts` (Phase 4)
- `POST /api/me/handle` endpoint with 23505 → 409 collapse — `server/routes/me.ts` (Phase 4)
- Route stubs `/u/:handle` (`HandleReelRoute`) and `/` (`PublicReelRoute`) — Phase 3
- `useCitiesQuery` + `useAllPhotos` shape — Phase 5 / Phase 6 (server-side mirrors must keep the DTO compatible)
- Single amber accent + no empty-state illustrations on public surfaces — DESIGN.md locked risk #3
- `prefers-reduced-motion` honored on all motion — project-wide
- StrictMode-safe `mountedRef` pattern in every async-loading component — `feedback_mountedref_strictmode.md`
- Hono route ordering: literal routes before parameterized routes — regression mirror from `cities.ts /reorder`

</domain>

<decisions>
## Implementation Decisions

### Handle picker UX

- **D-01:** Blocking modal on first `/app/*` route visit when `users.handle IS NULL`. No close button; cannot dismiss until claimed. Renders ABOVE the route content, not replacing it (route component mounts behind the modal so layout doesn't flash on dismiss).
- **D-02:** Live uniqueness check via new `GET /api/handles/check?candidate=<input>` returning `{ available: bool, reason?: 'too_short'|'too_long'|'invalid_chars'|'reserved'|'taken' }`. Frontend debounces 300ms after typing stops. Inline status icon next to input (amber check / muted X). Endpoint runs the same `validateHandle()` server-side, then a uniqueness query — single source of truth.
- **D-03:** `POST /api/me/handle` remains the authoritative claim path. Live check is advisory only; the server re-validates and re-checks uniqueness on submit so a race between two pickers still collapses to 409 via the existing 23505 path.
- **D-04:** Caching policy on `/api/handles/check` — `Cache-Control: no-store`. Live answer matters; do not let Nginx serve a stale "available" between racers.
- **D-05:** UI copy is minimal — title "Pick your handle", input with placeholder `e.g. bryan`, URL preview line `timeline.bryanlam.dev/u/<input>`, single primary button `Claim`. No close, no "skip for now", no help text beyond the regex hint `lowercase letters, numbers, hyphens · 3–20 chars`.

### Public read API surface

- **D-06:** New endpoint `GET /api/public/u/:handle` (mounted OUTSIDE the JWT-protected router tree) returns one of:
  - `200 OK { user: { handle, displayName?: null }, cities: City[], photos: Photo[] }`
  - `404 Not Found { error: 'not_found' }` if no `users` row matches `handle` (case-insensitive lookup, but the URL itself is lowercase-enforced via 301 if needed — defer 301 normalization decision to plan)
- **D-07:** DTO shape matches the existing authenticated `useCitiesQuery` + `useAllPhotos` payloads so the frontend Reel component is unchanged (it just receives data from a different fetcher). `photos[]` is a flat array with `cityId` key; the client groups them — same shape as `useAllPhotos`.
- **D-08:** Cache-Control headers from the app: `Cache-Control: public, max-age=300, s-maxage=300` on 200 responses; `Cache-Control: public, max-age=60` on 404. App-layer headers are the contract; Nginx `proxy_cache_valid` directives must match.
- **D-09:** `displayName` is intentionally `null` for v1 — the schema doesn't have a separate display name today and we don't want to expose email or Auth0 `name` claim publicly. The field exists in the DTO so future addition doesn't break the client.

### Frontend routing changes (`/u/:handle`)

- **D-10:** `HandleReelRoute.tsx` (currently stub showing seeded data) becomes a real data-fetching route:
  - Calls `usePublicReel(handle)` — new hook in `src/api/publicReel.ts` mirroring the `useCitiesQuery` pattern (TanStack Query, `mountedRef`, error/loading branches).
  - On 404 → renders new `NotFoundHandleRoute` (or returns `<Navigate to="/404/handle" />`).
  - On 200 with `cities.length === 0` → renders empty-state reel.
  - On 200 with `cities.length === 1` → renders single-city orbit reel.
  - On 200 with `cities.length >= 2` → renders normal multi-chapter reel.
- **D-11:** A separate `NotFoundHandleRoute` distinct from the generic `NotFoundRoute` — copy speaks specifically to "this handle doesn't exist" with a link back to `/`. The 0-city case shares the normal reel surface (just with different camera + caption), not a 404 surface.

### 1-city orbit camera (REEL-08)

- **D-12:** Continuous 360° rotation at constant bearing rate of 45°/s = 8s per full revolution. Loops indefinitely until user input (gesture or `visibilitychange` per existing state machine). Holds zoom 14, pitch 60.
- **D-13:** No inter-chapter `flyTo` for the 1-city case — the chapter rail still renders (single chapter), the arrival pulse fires once on initial land, photo cycling continues normally within the orbit.
- **D-14:** Implemented as a new reel state path branched on `cities.length`. Rotation runs via `requestAnimationFrame` updating `map.setBearing()` each frame; pauses on `document.hidden` and resumes on `visibilitychange` (mirrors existing gesture-machine suspend/resume).
- **D-15:** `prefers-reduced-motion: reduce` — render a static single-photo card view (reuse `ReducedMotionReel` pattern), no orbit, no camera animation. Caption still fades in normally.

### 0-city empty state (PUBLIC-02)

- **D-16:** Slow-rotating globe view — zoom 1, pitch 0, bearing rotates at ~10°/s (≈36s per full revolution). Caption "No trips yet. Check back soon." anchored bottom via the existing `ChapterOverlay`-style layout slot. No empty-state illustration (locked design risk #3).
- **D-17:** `prefers-reduced-motion: reduce` — static globe at fixed bearing, caption identical, no motion.

### Nginx cache (PUBLIC-04)

- **D-18:** Phase 7 ships `ops/nginx/timeline.conf` in the repo with:
  - `proxy_cache_path /var/cache/nginx/public_reel levels=1:2 keys_zone=public_reel:10m max_size=1g inactive=24h;`
  - `location ~ ^/api/public/u/[^/]+$` block with `proxy_cache public_reel`, `proxy_cache_key $scheme$host$uri`, `proxy_cache_valid 200 5m`, `proxy_cache_valid 404 1m`, `proxy_cache_bypass $http_x_no_cache`, `add_header X-Cache-Status $upstream_cache_status`.
  - `location ~ ^/u/[^/]+$` block caching the SPA HTML the same way (5m TTL) — the HTML is identical across handles since data comes from the API; caching it just trims the upstream hop.
- **D-19:** Phase 8 (deploy) symlinks `ops/nginx/timeline.conf` into `/etc/nginx/conf.d/`. The file is reviewable as code now, executed as ops in Phase 8.
- **D-20:** Invalidation strategy: **TTL-only (5 minutes), no active invalidation.** Owner edits a city → cache serves stale up to 5 minutes → expires → next request repopulates. Acceptable trade-off for a portfolio reel (recruiters won't refresh within 5 min; owner sees their own changes via the authenticated `/app/*` view).
- **D-21:** Vary policy: cache key is `$scheme$host$uri` — no Vary header, no per-Accept-Language variation (English only, locked in PROJECT.md out-of-scope).

### OG image / SEO

- **D-22:** Phase 7 sets a minimal static `<title>@{handle} — Timeline</title>` and a static `<meta name="description">` on the `/u/:handle` route. Real OG image (`PUBLIC-05`) is locked to Phase 12 — do NOT add `@vercel/og` or Puppeteer rendering here.

### Claude's Discretion

- TanStack Query key shape for `usePublicReel(handle)` — pick something consistent with `useCitiesQuery`.
- Modal animation timing (entry fade-in duration, focus-trap details) — DESIGN.md tokens apply; pick what feels right.
- 404 page exact copy — keep it terse and on-brand.
- Whether the `/api/handles/check` endpoint also returns the canonical lowercased form to surface the transformation in the UI (consistent with how the picker already lowercases on input).
- Where the live-uniqueness fetch is keyed (TanStack Query vs raw fetch + AbortController) — both fine; pick the one that fits the existing API layer.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §"Phase 7" — success criteria, plan breakdown (07-01 handle reservation, 07-02 public route + empty states, 07-03 Nginx config)
- `.planning/REQUIREMENTS.md` — AUTH-05, AUTH-06, AUTH-07, PUBLIC-01, PUBLIC-02, PUBLIC-03, PUBLIC-04, REEL-08
- `.planning/PROJECT.md` §"Key Decisions" — public-read OCI bucket prefix, lazy user provisioning

### Design system (mandatory before any UI work)
- `DESIGN.md` — typography tokens, color (single amber accent), motion tokens, locked risks #1 (single amber), #2 (arrival-pulse easing), #3 (no empty-state illustrations on public surfaces)

### Phase 4 — handle backend (already shipped, treat as locked contract)
- `server/handles/validate.ts` — `validateHandle()` discriminated-union result; reuse server-side for `/api/handles/check`
- `server/handles/reservedWords.ts` — `RESERVED_HANDLES: ReadonlySet<string>`; frontend imports this Set too for client-side hint
- `server/routes/me.ts` — `POST /api/me/handle` claim path; 23505 → 409 collapse pattern is canonical
- `server/db/schema.ts` — `users.handle` column is `text('handle').unique()`, nullable until picked

### Phase 5 / 6 — data shapes the public route must mirror
- `src/api/cities.ts` — `useCitiesQuery` payload shape; public API DTO must be assignment-compatible
- `src/hooks/useAllPhotos.ts` — flat `photos[]` with `cityId` key, the client groups
- `src/reel/chaptersWithPhotos.ts` — adjacent-dedup logic that runs over the merged shape

### Phase 3 — route scaffolding
- `src/routes/HandleReelRoute.tsx` — current stub, gets rewritten in 07-02
- `src/routes/PublicReelRoute.tsx` — `/` landing; NOT touched in Phase 7 (still uses seeded data; real owner-default route is post-launch)
- `src/routes/NotFoundRoute.tsx` — pattern reference for the new `NotFoundHandleRoute`

### Project-wide patterns (load-bearing across phases)
- `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/feedback_mountedref_strictmode.md` — `mountedRef` must reset to `true` on mount, re-anchor inside the effect body
- `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/project_drizzle_pg_error_wrapping.md` — `err.code` is undefined on `DrizzleQueryError`; check `err.cause.code` for 23505
- Hono route ordering: literal routes BEFORE parameterized routes (regression: `cities.ts /reorder` had to move above `/:id`)

### Cross-phase constraint
- `feedback_oci_cors_via_s3.md` — irrelevant to Phase 7 unless plan touches CORS; flagged because public photo URLs cross origin from `timeline.bryanlam.dev` to OCI Object Storage public-read prefix (already verified working in Phase 6, but worth noting if the public reel surfaces new asset-loading paths)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`server/handles/validate.ts`** — `validateHandle(rawInput)` returns discriminated union; reuse directly in `GET /api/handles/check` handler. No need to duplicate.
- **`server/handles/reservedWords.ts`** — Frozen `ReadonlySet<string>`. Import from both server and frontend (`src/photos/heicToJpeg.ts` already shows this dual-import pattern works).
- **`server/routes/me.ts`** — `POST /api/me/handle` shows the canonical 23505→409 collapse via `err.cause.code` (Drizzle wrapping). New `/api/handles/check` runs the same lookup logic without the claim.
- **`src/api/cities.ts`** — `useCitiesQuery` is the pattern template for `usePublicReel(handle)` (TanStack Query + mountedRef + error/loading).
- **`src/hooks/useAllPhotos.ts`** — Fan-out hook shape; the new public hook collapses fan-out into one API call but keeps the data shape so the reel renderers are unchanged.
- **`src/reel/Reel.tsx` + `src/reel/MapCanvas.tsx`** — Existing camera + chapter machinery; 1-city orbit is a NEW state path that swaps the inter-chapter flyTo for a continuous bearing animation, but otherwise reuses the same map setup.
- **`src/reel/ReducedMotionReel.tsx`** — Pattern for reduced-motion fallback; the 1-city orbit and 0-city globe both need their own reduced-motion variants but follow this template.
- **`src/routes/NotFoundRoute.tsx`** — Pattern for `NotFoundHandleRoute`.

### Established Patterns

- **JWT middleware boundary** — Hono routes under the authenticated tree have JWT middleware; public routes (Phase 3 `/u/:handle`, new `/api/public/u/:handle`) sit OUTSIDE that tree. Plan must mount the public router with explicit no-auth wiring.
- **DTO compatibility across auth boundaries** — The `City` and `Photo` DTOs returned to authenticated `/api/cities` callers must match what `/api/public/u/:handle` returns, so the reel renderers stay agnostic. The public DTO is a SUBSET (no edit affordances, no user-private fields like `email`); use the same Drizzle `select()` projection.
- **StrictMode mountedRef** — `useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, [])` re-anchors on mount; required for every component with async fetches under React.StrictMode (project-wide).
- **Hono route ordering** — Literal routes BEFORE parameterized. New `/api/public/u/:handle` is parameterized; no literal sibling under `/api/public/u/` so order doesn't matter yet, but document this for future-proofing.
- **`prefers-reduced-motion`** — Every motion component branches on `usePrefersReducedMotion()`; 1-city orbit and 0-city globe both need reduced-motion variants.

### Integration Points

- **Backend:** new `server/routes/handlesCheck.ts` (live-availability endpoint) + `server/routes/publicReel.ts` (one-shot public payload). Both mounted OUTSIDE JWT middleware. New router file or extend `me.ts` — plan decides; keep cohesion high.
- **Frontend:** new `src/api/handlesCheck.ts` (hook for picker) + `src/api/publicReel.ts` (hook for `/u/:handle`). `HandleReelRoute.tsx` rewrite. New `src/components/HandlePickerModal.tsx`. New `src/components/NotFoundHandleRoute.tsx`.
- **App Layout:** `AppLayout.tsx` mounts the picker modal as a sibling to the route outlet, conditional on `me.handle === null`. The `useMeQuery()` hook (existing) drives the conditional.
- **Reel state machine:** Branch on `cities.length` in the public route renderer — 0 → globe component, 1 → orbit component, ≥2 → existing multi-chapter Reel. The branch lives in `HandleReelRoute.tsx`, not deep in `Reel.tsx`.
- **Ops:** New `ops/nginx/timeline.conf` (committed but not deployed in Phase 7). Phase 8 plan references this file.

</code_context>

<specifics>
## Specific Ideas

- Modal copy is minimal — title "Pick your handle", URL preview line `timeline.bryanlam.dev/u/<input>`, primary button `Claim`. No "skip for now", no close button.
- Live check endpoint: `GET /api/handles/check?candidate=bryan` returns `{ available: bool, reason?: string }`. Frontend debounces 300ms. `Cache-Control: no-store` on this endpoint.
- Public payload: one-shot `{ user, cities, photos }`. Cache-Control `public, max-age=300` on 200; `max-age=60` on 404.
- 1-city orbit: 45°/s = 8s per revolution. Continuous loop, no inter-chapter flyTo, arrival pulse fires once on land.
- 0-city: globe at zoom 1 / pitch 0, bearing rotates at ~10°/s. Caption "No trips yet. Check back soon." bottom-anchored.
- Nginx: `proxy_cache_path … keys_zone=public_reel:10m max_size=1g inactive=24h`, key = `$scheme$host$uri`, TTL 5m on 200, 1m on 404, bypass on `X-No-Cache` header (for future use).
- TTL-only invalidation. Owner edits → up to 5min staleness → acceptable for a portfolio reel.
- OG image: deferred to Phase 12 per PUBLIC-05.

</specifics>

<deferred>
## Deferred Ideas

- **Real OG image rendering** (`PUBLIC-05`) — server-rendered 1200×630 PNG via `@vercel/og` or Puppeteer. Locked to Phase 12.
- **Handle rename UI** — v1 has no rename; `POST /api/me/handle` refuses to overwrite (409 if different). v2 candidate.
- **Owner-active cache invalidation** — fire-and-forget repopulate on mutation. Considered, rejected in favor of TTL-only for simplicity. Revisit if staleness complaints land.
- **Admin purge endpoint** — `POST /admin/purge?handle=X` for manual cache eviction. Considered, rejected for the same reason; YAGNI for portfolio scale.
- **301 redirect for uppercase handles** — `/u/Bryan` → 301 → `/u/bryan`. Possibly handled at Nginx level. Plan decides whether to add now (cheap) or defer.
- **Live-uniqueness rate limiting** — `GET /api/handles/check` could be brute-forced to enumerate taken handles. Acceptable risk at portfolio scale; revisit if abused. Could add IP rate limit in Phase 8 (Nginx-level).
- **Display name / about-me field** — DTO has `displayName: null` placeholder; schema doesn't have it. Adding a separate `display_name` column is a v2 enhancement.
- **Per-photo public/private flag** — All photos under a user's public handle are visible. Per-photo privacy is v2.
- **Static `/` landing page redesign** — `PublicReelRoute` still uses seeded data. Phase 7 does not touch it; a default-owner-redirect (e.g., `/` → `/u/bryan`) is a launch-week decision (Phase 12).

</deferred>

---

*Phase: 7-public-urls-handle*
*Context gathered: 2026-05-14*
