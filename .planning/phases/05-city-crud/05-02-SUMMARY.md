---
phase: 05-city-crud
plan: 02
status: shipped
commits:
  - a5c05a0  # feat(server): POST /api/cities + Zod schemas + pgErrorCode helper (task 1)
  - c1a6986  # feat(server): PATCH + DELETE /api/cities/:id with cross-user 404 (task 2)
  - 0795009  # feat(client): CityForm + wire create/edit/delete in TripsRoute (task 3)
  - 98ab6ac  # fix(client): mount-guard, tz-anchor arrivedAt, mobile-sheet a11y (review feedback)
tests_added: 15
tests_total: 122
requirements_advanced:
  - DATA-04 (complete — pin → geocode → form → save/edit/delete shipped end-to-end)
---

## What Shipped

### Server
- `POST /api/cities` — server-authoritative `order_index = (SELECT COALESCE(MAX(order_index), -1) + 1 FROM cities WHERE user_id = :me)` runs inside `db.transaction()`. Both MAX and INSERT bound to the same `tx`, so concurrent POSTs cannot read stale MAX. If the deferrable unique constraint trips at COMMIT (23505), returns 409 `conflict_retry` so the client can retry.
- `PATCH /api/cities/:id` — updates only validated fields (name, caption, lat, lng, zoom, pitch, bearing, arrivedAt, tripLabel). `updateCitySchema = createCitySchema.partial().strict()`. Build the SET object from `parsed.data` via `Object.entries`, NEVER spread raw body. Mass-assignment is blocked at two layers (Zod `.strict()` + handler-side allowlist).
- `DELETE /api/cities/:id` — 204 empty body on success, 404 on cross-user or missing. Order_index gaps are intentional (compaction belongs to /reorder in 05-03). FK CASCADE drops photos.
- `server/validation/cityInput.ts` — `createCitySchema` + `updateCitySchema`, both `.strict()`, with `z.coerce.date()` for arrivedAt and defaults (12/50/0) for camera fields.
- `server/db/pgError.ts` — `pgErrorCode(err)` helper. Unwraps both raw pg `err.code` and Drizzle's `DrizzleQueryError.cause.code`. Applied to all four cities.ts catch blocks (GET /:id, POST, PATCH, DELETE) AND to me.ts's existing taken-handle 409 path (fixes the latent silent-500 bug discovered during 05-01 review — the duplicate-handle 409 had never fired under Drizzle wrapping).

### Client
- `src/components/CityForm.tsx` — single component, discriminated `mode: 'create' | 'edit'` prop. Form fields: name (required), arrivedAt (date input), caption (textarea, 500 char counter). Read-only lat/lng footer. Edit mode has Delete button gated by `window.confirm`. Submit error UX: 422 → `issues[0].message`, 409 → "Save conflicted with another change. Click Save again.", 404-on-delete → "Already gone — refreshing." + still propagates `onDeleted`, other errors → "Network error. Try again." Mobile slide-up sheet → desktop centered modal via Tailwind `md:` classes. `aria-modal`, Escape-to-close (skipped during submit/delete), initial focus on name input.
- `src/routes/TripsRoute.tsx` — DraftPinPanel placeholder deleted. CityForm wired for both create (map pick → reverseGeocode → form) and edit (CityCard click → form prefilled). Mutual exclusion enforced: opening one mode clears the other. `onSaved`/`onDeleted` call `refetch()` then `closePanel()`. `onCancel` closes without refetch.
- `arrivedAt` timezone anchor: client converts `"YYYY-MM-DD"` to `new Date(\`${ymd}T00:00:00\`).toISOString()` before sending, so the stored timestamp matches the user's local-midnight intent. Without this, a Tokyo user saving "today" at 10pm local would have stored timestamp `T00:00:00Z` rendering back as the previous day.
- CityForm mount guard: `mountedRef` blocks post-await state setters + `onSaved` invocation if the user cancels mid-submit. A "cancel during in-flight save" now drops the response silently.

## Deviations / Open Items

1. **MapPicker reactive marker sync deferred to 05-03.** After save/edit/delete, the bottom-half cities list refetches and updates immediately. The MapPicker still snapshots `cities` at mount, so map markers stay stale until route remount. The deferral is documented inline at `src/routes/TripsRoute.tsx:13-16`. 05-03 (reorder) already touches MapPicker, so it's the natural place to add diffing logic.
2. **Inline DraftPinPanel removed; inline CityCard kept.** CityCard (~12 lines) is still inline in TripsRoute. Extract when Phase 6 needs photo previews on the card.
3. **No CityForm component tests yet.** RTL isn't wired (TESTING.md flags it as a planned addition). All 15 new tests this plan are server-side. Manual verification at `/app/trips` covers the front end.
4. **`updatedAt` strictly-advances PATCH test uses a 50ms sleep.** Wall-clock-dependent but works locally. Deterministic alternative for CI: backdate the seeded `updatedAt` to `Date.now() - 1000`. Noted in `server/routes/cities.test.ts:453` review feedback. One-line follow-up.
5. **Mobile sheet does not trap focus.** `aria-modal` + Escape + initial focus shipped. Full focus-trap (Tab/Shift+Tab interception) was deferred because it's >30 lines of careful keyboard-handling. Phase 6 territory or earlier if a screen-reader audit comes up.
6. **Date input continues to slice ISO timestamp for edit mode display.** The asymmetry between display (slice off T...Z) and submit (anchor to local midnight) is documented in CityForm.tsx's arrivedAt block. Acceptable for v1; revisit if cross-tz editing becomes a real flow.

## Verification

- `bun run typecheck` — clean
- `bun run test` — **122 passed (5 files)**. Added 7 POST tests (Task 1) + 8 PATCH/DELETE tests (Task 2) = 15 new. Concurrency contract (`[201,201]` OR `[201,409]`) enforced with inline comment forbidding tightening.
- `bun run build` — succeeds; maplibre stays its own chunk (`maplibre-wqmL2Hxp.js`, 1.05 MB / 283 KB gzip).
- BigDataCloud architectural CI guard (from 05-01) still green: no server files reference `bigdatacloud`.

## What 05-03 Picks Up

- `PATCH /api/cities/reorder` — accepts array of `{id, order_index}`, wraps in `db.transaction()`, uses DEFERRABLE unique constraint behavior for atomic row-by-row swaps.
- @dnd-kit drag UI in TripsRoute list
- MapPicker reactive marker sync (deferred from 05-02 — open item 1)
- `groupChapters.ts` REEL-09 util
- Atomic Task 4: wire AppReelRoute + Reel + ReducedMotionReel to API data instead of SEEDED_CITIES
- Optional housekeeping: backdate updatedAt seed in PATCH test (open item 4); split cities.test.ts at the ~650-line mark; extract CityCard

## Workflow Used

`superpowers:subagent-driven-development` — fresh implementer subagent per task, two-stage review (spec compliance → code quality) per task, fix subagent for each Important issue. One stream-timeout mid-Task-2 — recovered by dispatching a fresh agent to write the remaining tests + commit; handler code from the timed-out agent was correct and verified by typecheck before resume. 4 feature/fix commits on `feature/05-02-cities-crud` in worktree `.worktrees/05-02-cities-crud`.
