---
status: partial
phase: 07-public-urls-handle
source: [07-VERIFICATION.md]
started: 2026-05-15T11:15:00Z
updated: 2026-05-15T11:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. iPhone Safari sustained 60 FPS on the 1-city orbit for 30s+

expected: OrbitReel at 45°/s holds 60 FPS without thermal throttle or jank when the device is on battery; no GPU memory spike. Visit a 1-city handle URL on iPhone 14 Pro Safari (iOS 17+); observe the orbit for at least 30 seconds via Web Inspector → Timeline → Rendering.
result: [pending]

### 2. GlobeReel renders as an actual 3D globe in iOS Safari (not a flattened mercator)

expected: `setProjection({type:'globe'})` produces the curved-earth projection on iOS; the slow 10°/s rotation is visible. Visit a 0-city handle URL on iPhone Safari; confirm the globe is round (continents curve toward the poles) and rotates slowly.
result: [pending]

### 3. Mixed-case URL /u/Bryan resolves to the same reel as /u/bryan in a real browser

expected: Both URLs render the same reel content (case-insensitive LOWER() lookup at the app layer); the cache key intentionally treats them as separate Nginx cache entries (at-most-2x cache space — D-21). Open both URLs in a real browser on the deployed stack; both should return the same reel; check Nginx X-Cache-Status header (`MISS` on first, `HIT` on second per-URL).
result: [pending]

### 4. HandlePickerModal cannot be dismissed in a real browser

expected: Modal stays open until POST /api/me/handle returns 200; backdrop click does not close (browser default for `<dialog>.showModal`); pressing Esc fires the cancel event which is `preventDefault`'d. Sign in as a fresh user (no handle yet), land on `/app/*`, attempt: (a) click backdrop area outside modal, (b) press Esc, (c) press Tab repeatedly to test focus trap. Modal must remain open and focus must stay inside.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
