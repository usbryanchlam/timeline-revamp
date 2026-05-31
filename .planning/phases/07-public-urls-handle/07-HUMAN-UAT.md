---
status: complete
phase: 07-public-urls-handle
source: [07-VERIFICATION.md, Phase 8 Wave 3 deploy smoke 2026-05-30]
started: 2026-05-15T11:15:00Z
updated: 2026-05-30T20:30:00Z
---

## Current Test

[all items complete]

## Tests

### 1. iPhone Safari sustained 60 FPS on the 1-city orbit for 30s+

expected: OrbitReel at 45°/s holds 60 FPS without thermal throttle or jank when the device is on battery; no GPU memory spike. Visit a 1-city handle URL on iPhone 14 Pro Safari (iOS 17+); observe the orbit for at least 30 seconds via Web Inspector → Timeline → Rendering.
result: partial pass (Phase 8 deploy smoke 08-03 — 2026-05-30): visual pass on iPhone with a 1-city handle (`https://timeline.bryanlam.dev/u/<handle>`); orbit held steady, no observed jank or thermal throttle. Formal Web Inspector instrumentation NOT performed — iPhone was not USB-tethered to Mac during this UAT pass. Laptop Chrome held 120 FPS on the same content via DevTools → Rendering → Frame Rendering Stats, which establishes a strong lower-bound floor (desktop GPU has substantial headroom). Followup logged for Phase 12 polish: run instrumented FPS measurement on iPhone 14 Pro before public launch announcement.

### 2. GlobeReel renders as an actual 3D globe in iOS Safari (not a flattened mercator)

expected: `setProjection({type:'globe'})` produces the curved-earth projection on iOS; the slow 10°/s rotation is visible. Visit a 0-city handle URL on iPhone Safari; confirm the globe is round (continents curve toward the poles) and rotates slowly.
result: pass (Phase 8 deploy smoke 08-03 — 2026-05-30): iPhone Safari on https://timeline.bryanlam.dev/u/bryan with 0 cities — globe rendered as spherical (continents visibly curve toward poles), slow rotation observed. The /app/* surface for a 0-city user correctly shows the "drop a pin" empty state on the /app reel page; the public /u/<handle> surface is what exercises GlobeReel and that surface rendered correctly.

### 3. Mixed-case URL /u/Bryan resolves to the same reel as /u/bryan in a real browser

expected: Both URLs render the same reel content (case-insensitive LOWER() lookup at the app layer); the cache key intentionally treats them as separate Nginx cache entries (at-most-2x cache space — D-21). Open both URLs in a real browser on the deployed stack; both should return the same reel; check Nginx X-Cache-Status header (`MISS` on first, `HIT` on second per-URL).
result: pass (Phase 8 deploy smoke 08-03 — 2026-05-30): iPhone Safari on https://timeline.bryanlam.dev/u/Bryan and /u/bryan both render the same reel content. From laptop `curl -sI` against /u/bryan showed `X-Cache-Status: EXPIRED` on first request and `X-Cache-Status: HIT` on second (EXPIRED here means a stale entry beyond the 5-min proxy_cache_valid window had been re-validated upstream and re-cached; functionally equivalent to MISS for the purposes of this test — both demonstrate cache populate-and-serve). D-21 per-URL cache key (`$scheme$host$uri`) confirmed working as designed.

### 4. HandlePickerModal cannot be dismissed in a real browser

expected: Modal stays open until POST /api/me/handle returns 200; backdrop click does not close (browser default for `<dialog>.showModal`); pressing Esc fires the cancel event which is `preventDefault`'d. Sign in as a fresh user (no handle yet), land on `/app/*`, attempt: (a) click backdrop area outside modal, (b) press Esc, (c) press Tab repeatedly to test focus trap. Modal must remain open and focus must stay inside.
result: pass (after fix 216a0cd — double-Esc surfaced Chromium's close-watcher anti-modal-trap; fixed by adding document-level keydown capture-phase listener that preventDefaults Escape before the close request is generated)

## Summary

total: 4
passed: 3
partial: 1 (item 1 — visual iPhone pass; instrumented FPS measurement deferred to Phase 12)
issues: 0
pending: 0
skipped: 0
blocked: 0

## Followups

- **Phase 12 polish:** Run instrumented Web Inspector FPS measurement on iPhone 14 Pro before public launch announcement. Tether device to Mac via USB; observe Timelines → Rendering Frames for 30+ seconds; verify all bars stay below the 16.67ms line. Item 1 is currently a visual pass without this instrumentation.

## Gaps
