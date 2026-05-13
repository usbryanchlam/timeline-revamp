---
phase: 6
phase_name: Photo upload pipeline
phase_slug: photo-upload-pipeline
date: 2026-05-12
mode: discuss
---

<domain>
**Phase 6 delivers:** end-to-end photo upload pipeline plus reel-side cycling. User opens the photo detail sheet on a city, picks photos (multi-select up to remaining 10-photo slot), HEIC files convert to JPEG client-side, images resize to 2048px max long-edge and have EXIF stripped, then upload to OCI Object Storage via short-lived per-upload PARs. Server generates a 400px thumbnail via `sharp` and writes both objects under a public-read bucket prefix. Once photos exist, the `/app/` reel cycles through each chapter's photos during dwell — closing REEL-09 completely.

**Locked by ROADMAP / PROJECT.md (do not re-litigate):**
- OCI Object Storage via Pre-Authenticated Requests (PARs) — no S3 signed URLs
- Public-read bucket prefix for photos — one PAR for thumbnails (PROJECT.md decision)
- Per-city limit: 10 photos
- Per-photo limit: 5 MB
- 2048px max long-edge, EXIF stripped
- HEIC → JPEG client-side conversion
- Backend stays Hono + Drizzle + Postgres 16 (Phase 4)
- Auth + lazy provisioning chain stays as-is (Phase 4)
- DESIGN.md single amber accent + locked tokens
</domain>

<prior_decisions>

**Project-level (PROJECT.md):**
- OCI Object Storage + PARs as the storage primitive
- Public-read bucket prefix for photos, single PAR for all thumbnails (originally — refined below)
- iPhone 14 Pro is canonical reference device (HEIC files are the dominant input)
- iOS 17+ Safari, Chrome 109+ as browser floor

**Phase 5 carry-overs that this phase touches:**
- `ChapterGroup.members` array already preserved on the type for cycling
- `groupsToChapters` helper encapsulates the `members[0]` projection — Phase 6 expands the helper or adds a parallel helper for cycling
- `cityToChapter` defaults `photos: []` — Phase 6 wires real photo arrays

**Phase 5 housekeeping carried into Phase 6 (not gated, but candidates for early sweep):**
- `cities.test.ts` at 945 lines — split before adding more route tests
- `mapReadyTick` smell in MapPicker
- Keyed marker diff in MapPicker (defer until 100+ cities)
- `formatArrived` dedupe between CityList + ChapterOverlay
- TOCTOU race fix on PATCH /reorder pre-flight
</prior_decisions>

<decisions>

### HEIC conversion library

**Locked: `heic-to`** (WASM, ~600KB minified+gz, MIT, actively maintained 2024+).

- Lazy-loaded behind `/app/` route boundary so public reel (`/`, `/u/:handle`) stays unaffected by the WASM bundle.
- Wrapper module `src/photos/heicToJpeg.ts` — input: File (HEIC), output: Blob (JPEG). Caller pipes the Blob into the canvas-resize step.
- Detection: `file.type === 'image/heic'` || `file.type === 'image/heif'` || extension check on `.heic`/`.heif` (Safari sometimes reports `application/octet-stream` for HEIC).
- Non-HEIC files (JPEG/PNG) skip the conversion step entirely.

### Thumbnail strategy

**Locked: server-side via `sharp` on Hono+Bun.**

- Frontend uploads ONE file (the 2048px JPEG master) to the master object key.
- Server endpoint `POST /api/photos/:id/finalize` reads the just-uploaded master via OCI signed-GET (or pipes it from the same PAR), runs `sharp(buffer).resize(400).jpeg({quality: 80}).toBuffer()`, then PUTs the thumb to the thumb object key.
- Both keys live under a public-read bucket prefix (`photos/{userId}/{photoId}/master.jpg` and `.../thumb.jpg`).
- Phase 8 VM CPU sizing must account for `sharp` workload (low — single 2048px → 400px resize is ~50ms CPU on Ampere A1).
- `sharp` adds ~30 MB to server image + native deps; document in 06-02 plan.

### PAR (Pre-Authenticated Request) scope + lifetime

**Locked: per-upload, short-lived PAR.**

- Server endpoint `POST /api/photos/upload-url` accepts `{ cityId, contentType, sizeBytes }`, validates:
  - city belongs to requester (`eq(cities.userId, me.id)`)
  - `current_photo_count(cityId) < 10` (DATA-06)
  - `sizeBytes <= 5_242_880` (DATA-06: 5 MB)
  - `contentType` in allowed set (`image/jpeg`, `image/png` — HEIC arrives as JPEG after client-side conversion)
- On success, server creates a new `photos` row with status `pending`, mints a fresh write-scoped PAR via OCI API for the exact object key (`photos/{userId}/{photoId}/master.jpg`), lifetime 5 minutes, returns `{ photoId, uploadUrl }`.
- Frontend PUTs the resized JPEG directly to `uploadUrl`. On 2xx, frontend POSTs `/api/photos/:id/finalize` which: verifies the object exists, generates thumb via sharp, marks the row `ready`. On 4xx/5xx or timeout, frontend can call `DELETE /api/photos/:id` (only works on `pending` rows) to clean up the orphan DB row.
- Stale `pending` rows >1h old can be swept by a future cron — out of scope for Phase 6.

### Upload UX

**Locked: multi-select with parallel uploads.**

- `<input type="file" multiple accept="image/jpeg,image/png,image/heic,image/heif">` — accepts HEIC/HEIF at the input boundary; conversion happens in JS.
- After selection, UI shows a queue of cards, one per file: filename, size, status badge (`Queued` → `Converting` → `Uploading` → `Done` / `Failed (retry)`), progress bar.
- Concurrency limit: **3 simultaneous uploads** to avoid mobile bandwidth thrash. Worker-pool pattern with a semaphore (~30 lines).
- Per-file retry button on failure.
- Aggregate progress (`5 of 8 done`) at the top of the queue.
- Add-photos button disabled if `current_count + selected_count > 10`; inline error: "You can add N more photos to this city."

### REEL-09 photo cycling (closes the requirement)

**Locked: separate plan 06-04.**

- 06-04 ships after 06-01/02/03. Adds:
  - `GET /api/cities/:id/photos` endpoint (returns array of `{ id, masterUrl, thumbUrl, order }`)
  - Frontend: extend `useCitiesQuery` or sister hook to fetch photos for the loaded city list (one round-trip per session, indexed by cityId)
  - `groupChapters` already preserves `members: CityDTO[]`. New helper `chaptersWithCycling(groups, photosByCityId)` produces chapters whose `photos` field is the union of all members' photos
  - Reel + ChapterOverlay: during chapter dwell (existing arrival-pulse landing), cycle photo cards. Photo dwell ≈ 2.5s, crossfade 200ms, respects `prefers-reduced-motion` (no crossfade, instant swap).
- Scope guard: 06-04 ONLY adds cycling. No new MP4 export logic, no new analytics, no public-route changes.

### Photo detail sheet (06-03)

- Bottom sheet (mobile) / modal (desktop) — same responsive pattern as CityForm (Phase 5).
- Renders the city's photo grid (thumbnails) + a header with the city name + caption.
- Tapping a thumbnail opens a full-screen photo viewer (single photo, swipe to next/prev within the city, close via Escape or backdrop tap).
- Trigger surface: tap a city marker on Reel (already calls onCityClick) → opens photo detail sheet for that city. Reuse of existing event wiring; no new gesture.
- Add Photos button at the bottom of the sheet → multi-select upload UX described above.
- Per-photo delete (long-press or dedicated trash icon in viewer) — calls `DELETE /api/photos/:id`.

</decisions>

<specifics>

**Library + version pins to discover during research:**
- `heic-to` latest stable (~2024 release line)
- `sharp` latest stable that supports Bun (Bun has historically had sharp compatibility issues; researcher MUST verify Bun + sharp works on Ampere A1 in 2026; if not, fallback to `@napi-rs/canvas` or a Node sidecar)
- OCI SDK: `oci-objectstorage` (TypeScript SDK) — confirm PAR creation API + auth pattern
- File picker MIME types verified on Safari iOS 17 (iOS sometimes reports `application/octet-stream` for HEIC)

**Test fixtures to gather:**
- Real iPhone HEIC sample (5-10 MB, 4032×3024) for end-to-end test
- Real iPhone Live Photo HEIC (animated MOV-coupled) — verify heic-to extracts the still frame correctly, ignores the motion track
- JPEG with extensive EXIF (GPS, camera model, timestamp) — verify resize step strips it
- Edge case: portrait orientation JPEG with EXIF orientation flag — verify canvas-resize respects orientation OR explicitly rotates

**OCI bucket structure:**
```
photos/
  {userId}/
    {photoId}/
      master.jpg   (2048px JPEG, EXIF stripped)
      thumb.jpg    (400px JPEG, quality 80)
```

**Schema (server/db/schema.ts) — add `photos` table:**
```typescript
export const photos = pgTable('photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  cityId: uuid('city_id').notNull().references(() => cities.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'ready', 'failed'] }).notNull().default('pending'),
  masterKey: text('master_key').notNull(),  // OCI object key
  thumbKey: text('thumb_key'),               // nullable until finalize completes
  caption: text('caption'),                  // user-editable, defaults null
  orderIndex: integer('order_index').notNull(),  // per-city ordering, 0..N-1
  createdAt, updatedAt
});
```

Note: `cities.userId` already provides the auth boundary; `photos.userId` is denormalized for query simplicity (and FK enforcement separate from the CASCADE through cities). Optional — researcher can recommend whether to keep or drop.

**Photo ordering:** per-city `order_index` similar to cities. Phase 6 doesn't ship a reorder UI; default order = creation order. Reorder added in a future polish phase if needed.

</specifics>

<canonical_refs>

- `.planning/ROADMAP.md:114-130` — Phase 6 success criteria
- `.planning/REQUIREMENTS.md` — DATA-05, DATA-06, DATA-07 definitions
- `.planning/PROJECT.md` — OCI/PAR storage primitive, photo limits
- `DESIGN.md` — bottom sheet vs modal pattern (used by CityForm reference at `src/components/CityForm.tsx`), amber accent token
- `server/db/schema.ts:1-17` — DATA-02 OWNERSHIP NOTICE block (model for any new schema-owned-by-migration patterns Phase 6 introduces; photo table likely doesn't need a custom migration but the pattern is the reference)
- `server/db/pgError.ts` — Phase 5 helper; Phase 6 server code uses it for any 23xxx error checks
- `src/components/CityForm.tsx` — discriminated mode prop pattern, mobile sheet + desktop modal pattern, mountedRef-on-mount pattern (StrictMode-safe)
- `src/components/MapPicker.tsx` — lazy-import pattern for heavy libraries (mirrors how heic-to will be lazy-loaded)
- `src/reel/groupChapters.ts` + `groupsToChapters` — extension point for REEL-09 cycling (06-04)
- `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/feedback_lazy_chunk_css.md` — hoist library CSS out of lazy chunks (relevant for heic-to and any sharp-derived assets)
- `~/.claude/projects/-Users-bryanlam-Workspaces-timeline-revamp/memory/feedback_mountedref_strictmode.md` — StrictMode mountedRef pattern (relevant to the photo viewer mount logic)

</canonical_refs>

<deferred_ideas>

Captured during discussion but explicitly out of Phase 6 scope:

- **Photo reorder UI** — drag-reorder within the photo grid. Defer to a future polish phase if user demand surfaces.
- **Stale `pending` photo sweeper** — cron to delete `photos` rows stuck in `pending` >1h with no corresponding OCI object. Defer to Phase 8 (deploy) or later — local dev can manually clean.
- **Photo captions on the reel overlay** — caption ALONG WITH photo cycling. Currently REEL-09 cycles photos only; the chapter's text overlay stays static. If captions-per-photo lands later, that's a Phase 9+ polish.
- **Live Photo motion track support** — heic-to extracts the still frame; the MOV motion track is ignored. Adding playback would be a Phase 12+ exploration if anyone asks.
- **Photo metadata edit (EXIF re-attach)** — Phase 6 strips EXIF on upload; we keep zero EXIF server-side. If users want to retain "camera + lens" subtitles, that's a v2 feature.
- **Bulk delete UI** — Phase 6 ships per-photo delete. Multi-select delete is a v2 ergonomic.
- **Photo dedup on upload** — detect if user is uploading the same photo twice (content hash). v2.
- **Image format negotiation (AVIF/WebP)** — Phase 6 always serves JPEG. If perf budgets demand it, add an Accept-header based variant pipeline in Phase 9 or v2.

</deferred_ideas>

---

*Generated by /gsd-discuss-phase on 2026-05-12. Five gray areas discussed, all resolved. Ready for /gsd-plan-phase 6.*
