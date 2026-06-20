# TODOS

Deferred items from v1 design (`~/.gstack/projects/usbryanchlam-timeline-revamp/bryanlam-main-design-20260423-104825.md`).
Each entry is What / Why / Pros / Cons / Context / Depends-on.

## v2 — MP4 export (cut from v1 per Phase 11 Branch D)

- MP4-04 (rung 2 fallback): Client `MediaRecorder` + `canvas.captureStream(30)` — cut from v1 per Phase 11 Branch D selection (Phase 10 server-side MP4 stayed on hold; Branches A/B/C not pursued). Revisit in v2.
- MP4-05 (rung 3 fallback): 10-second looping GIF export — cut from v1 per Phase 11 Branch D selection. Revisit in v2.
- MP4-06 (cut path): Documented in `.planning/phases/11-mp4-rung-2-3-or-mobile-polish-a11y-audit/11-SUMMARY.md` Branch D narrative. The requirement ("If all three rungs fail, MP4 is cut from v1 and shipped as v2 feature") is satisfied by this documentation.

## v2 — Product features

### Trip-grouping entity

- **What:** First-class `trips` table joining a date range, a name, and a set of `cities` rows. UI groups the reel and Trips list by trip.
- **Why:** Users with 50+ cities have a "Tokyo 2024" mental model; flat ordering loses that.
- **Pros:** Better navigation at scale, supports multi-trip exports ("export my Japan 2024 reel"), enables future trip-level sharing.
- **Cons:** Schema migration, reorder semantics get more complex, frontend list view doubles in complexity.
- **Context:** v1 schema includes `trip_label text` on `cities` as a free-text shim. Migration path: backfill `trips` rows from distinct `trip_label` values per user; nullable FK on cities.
- **Depends on:** v1 launch + at least one user with >20 cities.

### Auto-import from Google Takeout / Apple Photos

- **What:** Upload a Google Takeout zip or Apple Photos export → parse location data → suggest cities to add.
- **Why:** Manually entering a 5-year travel history is the friction that kills adoption.
- **Pros:** Massive onboarding lift; turns 1-hour setup into 5 minutes.
- **Cons:** Format drift (Google Takeout schema changes), privacy concerns (uploading entire photo library), parser maintenance.
- **Context:** Google Takeout location history is JSON in `Records.json`; Apple Photos export is XML in `Library/Application Support/.../photos.db`. Parser is the rabbit hole — either ship a thin "drop your KML here" or invest 4-6 weekends in real parsing.
- **Depends on:** product-market signal post-launch.

### AI-generated captions / voiceover

- **What:** Optional per-chapter AI caption (1-2 sentences) generated from city + date + photos.
- **Why:** Reduces blank-page paralysis on adding notes; makes reels narratively richer.
- **Pros:** Voiceover is a TikTok/Reels-killer feature for shareable artifacts.
- **Cons:** LLM cost, quality control on user-facing text, voice generation cost (ElevenLabs ~$0.30/min).
- **Context:** Claude Haiku would do captions cheaply (~/k tokens); voiceover is the real cost. Start text-only.
- **Depends on:** v1 export pipeline working.

### Social / friend graph

- **What:** Follow other users, see their public reels in a feed, co-author trip groups.
- **Why:** Increases stickiness, viral surface, "who's been there" discovery.
- **Pros:** Network effects.
- **Cons:** Moderation, privacy controls, abuse vectors. This is a real product not a portfolio piece.
- **Context:** Out of scope for portfolio framing. If/when this becomes a side-project that earns it, talk to YC.
- **Depends on:** clear user demand + decision to take this seriously as a product.

### i18n (multi-language support)

- **What:** Translation infrastructure (i18next or similar) + 2-3 locales beyond en-US.
- **Why:** Travel app, international audience.
- **Pros:** Wider reach.
- **Cons:** Translation costs, layout breakage on long German strings, RTL support adds complexity.
- **Context:** v1 is en-US only. Add when an actual user complains.
- **Depends on:** signal of non-EN users.

### 3D terrain on hero chapters

- **What:** MapLibre 3D terrain (`raster-dem` source) on 1-2 hero chapters of the demo reel.
- **Why:** Even more cinematic, especially for mountain/coastal cities (Kyoto, Cape Town, Queenstown).
- **Pros:** Wow factor.
- **Cons:** Tile cost (terrain tiles are heavy), Puppeteer rendering complexity multiplies, potential perf hit on Lighthouse score.
- **Context:** Cut from v1 due to MP4 worker complexity. Reconsider once server-side render pipeline is proven.
- **Depends on:** MP4 server path shipping in v1.

## v2 — Infrastructure

### Self-hosted tileserver-gl

- **What:** Run `klokantech/tileserver-gl` container on the OCI VM, swap MapTiler API for self-hosted endpoint.
- **Why:** MapTiler free tier caps at 100k tile loads/mo. If reel goes viral, costs escalate.
- **Pros:** Unlimited tile serving, no MapTiler dependency.
- **Cons:** Tile data (~30GB for OpenMapTiles planet), VM disk + memory pressure, occasional style drift.
- **Context:** Ship MapTiler in v1, swap if monitoring shows >50k tile loads/mo or paid tier triggers.
- **Depends on:** post-launch traffic measurement.

### Dedicated MP4 worker VM

- **What:** Move BullMQ worker container to its own OCI VM, scale independently from API/DB.
- **Why:** A second concurrent MP4 render currently OOMs the 8GB shared VM (per RAM math in design doc).
- **Pros:** Higher concurrency, isolation from API perf.
- **Cons:** Cost (~USD 10-30/mo), more deploy complexity (2 VMs, 2 docker-compose files).
- **Context:** v1 ships with `BULL_CONCURRENCY=1` + 5/24h per-user rate limit, which is enough for portfolio traffic. Revisit if queue depth ever exceeds 5 concurrent.
- **Depends on:** observed queue saturation.

### Optimistic locking on city updates

- **What:** Add `version` integer column to `cities`, return 409 on stale writes.
- **Why:** Multi-tab editing today silently last-wins.
- **Pros:** Prevents data loss in the (rare) multi-tab case.
- **Cons:** Schema migration, frontend retry logic, more complex API contract.
- **Context:** Solo-user portfolio likely never hits this. Add when a user reports lost edits.
- **Depends on:** observed user pain.

### Full-screen photo gallery

- **What:** Tap photo card → fullscreen swipeable gallery with pinch zoom.
- **Why:** Reel detail sheet is fine for quick context but doesn't let users actually look at the photos.
- **Pros:** More native-feeling photo experience.
- **Cons:** New gesture surface to test on mobile, focus trapping, swipe-down-to-dismiss interactions.
- **Context:** v1 ships with detail sheet only; gallery is post-MVP.
- **Depends on:** v1 launch.

### Soft delete + GDPR-compliant export

- **What:** Add `deleted_at` to all tables, add `/api/me/export` returning a JSON dump, add `/api/me/delete` queueing a 30-day soft-delete.
- **Why:** GDPR right-to-export and right-to-erasure for any users in EU.
- **Pros:** Real compliance posture.
- **Cons:** Schema change, scrubbing pipeline, 30-day grace period requires a cron.
- **Context:** v1 uses hard cascade-delete on user-delete (intentional). EU users get full erasure but no export. Upgrade if any user requests data.
- **Depends on:** real user signal.

### Service worker / offline mode

- **What:** Cache the seeded demo reel (tiles + photos + JS) so the public landing page works offline after first view.
- **Why:** Slight perceived perf bump on second visit; works on flaky airplane wifi.
- **Pros:** Lighthouse PWA category points.
- **Cons:** Service worker debugging is painful, cache invalidation is hard, scope-creep risk.
- **Context:** Cut from v1 to preserve weekend budget. Measure post-launch whether it matters.
- **Depends on:** post-launch perf measurement.
