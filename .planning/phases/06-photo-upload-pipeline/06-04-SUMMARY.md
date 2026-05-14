---
phase: 06-photo-upload-pipeline
plan: "04"
subsystem: client-reel
tags:
  - reel
  - photos
  - cycling
  - reduced-motion
  - REEL-09
dependency_graph:
  requires:
    - 06-02 (GET /api/cities/:cityId/photos endpoint)
    - 06-03 (listPhotos + PhotoDTO type from src/api/photos.ts)
    - 05-01 (groupChapters + useCitiesQuery)
  provides:
    - src/types/reel.ts (PhotoCard interface, ReelPhoto union, isPhotoCard guard)
    - src/reel/chaptersWithPhotos.ts (pure merge function: ChapterGroup[] + photo map → CityChapter[])
    - src/reel/PhotoCycle.tsx (4s cycling component with 200ms crossfade, reduced-motion compliant)
    - src/hooks/useAllPhotos.ts (fan-out hook: N cities → ReadonlyMap<cityId, PhotoCard[]>)
  affects:
    - src/reel/ChapterOverlay.tsx (branched on isPhotoCard for /app/ vs public reel)
    - src/reel/ReducedMotionReel.tsx (branched on isPhotoCard for static img grid vs gradient)
    - src/routes/AppReelRoute.tsx (wired useAllPhotos + chaptersWithPhotos into chapter pipeline)
tech_stack:
  added: []
  patterns:
    - ReelPhoto discriminated union (PhotoSeed | PhotoCard) with isPhotoCard type guard
    - chaptersWithPhotos: pure fan-in merge preserving adjacent-dedup from groupChapters
    - useAllPhotos: fan-out Promise.all with reqIdRef stale guard (mirrors useCitiesQuery)
    - PhotoCycle: interval-based crossfade with photos identity as effect dep (cleanup on identity change)
    - Hidden aria-hidden img for single-next preload (not <link rel="preload"> — jsdom compat)
    - AppReelContent inner component to avoid rules-of-hooks violation after early returns
key_files:
  created:
    - src/types/reel.ts (modified — PhotoCard + ReelPhoto + isPhotoCard added)
    - src/reel/chaptersWithPhotos.ts
    - src/reel/chaptersWithPhotos.test.ts
    - src/reel/PhotoCycle.tsx
    - src/reel/PhotoCycle.test.tsx
    - src/hooks/useAllPhotos.ts
    - src/hooks/useAllPhotos.test.ts
  modified:
    - src/reel/ChapterOverlay.tsx (isPhotoCard branch + PhotoCycle mount)
    - src/reel/ReducedMotionReel.tsx (isPhotoCard branch + static img grid)
    - src/routes/AppReelRoute.tsx (useAllPhotos + chaptersWithPhotos wired)
    - .planning/REQUIREMENTS.md (REEL-09 row updated)
decisions:
  - "Hidden aria-hidden img used for single-next preload instead of <link rel=\"preload\"> — jsdom does not add <link> elements placed in body to the DOM, making the approach untestable in vitest; browsers support both approaches equivalently"
  - "AppReelContent inner component extracted from AppReelRoute to satisfy rules-of-hooks — useAllPhotos must not be called after early returns (loading/error/empty states)"
  - "Preload approach changed from plan's <link rel=\"preload\"> to hidden img; documented in this SUMMARY"
  - "PhotoCycle uses photos identity (not photos.length) as useEffect dep — ensures cleanup when chapter changes, even if new chapter has same photo count"
metrics:
  duration: "~6 minutes"
  completed: "2026-05-14"
  tasks_completed: 4
  files_changed: 11
---

# Phase 6 Plan 04: REEL-09 Photo Cycling on /app/ Reel Summary

Real photos now cycle at 4s intervals with 200ms opacity crossfade inside each chapter on the authenticated `/app/` reel; the adjacent-dedup grouping from `groupChapters` is fully preserved.

## What Shipped

| File | Lines | What it does |
|------|-------|--------------|
| `src/types/reel.ts` | 40 | Added PhotoCard (id, masterUrl, thumbUrl, alt, orderIndex), ReelPhoto union, isPhotoCard guard. Widened CityChapter.photos to readonly ReelPhoto[]. |
| `src/reel/chaptersWithPhotos.ts` | 32 | Pure function: merges ReadonlyMap<cityId, PhotoCard[]> into groups from groupChapters. flatMap across members; slice().sort() for orderIndex. Never mutates input. |
| `src/reel/chaptersWithPhotos.test.ts` | 113 | 8 tests: empty, no-map, orderIndex sort, multi-member dedup, missing member, immutability, multi-group. |
| `src/reel/PhotoCycle.tsx` | 76 | 4s interval cycling with 200ms opacity crossfade. Reduced-motion: first photo only, no interval. Hidden aria-hidden img for single-next preload. Cleanup on unmount + photos identity change. |
| `src/reel/PhotoCycle.test.tsx` | 110 | 8 tests: empty renders null, first photo src, cycles at 4000ms, reduced-motion no timer, unmount cleanup, single-next preload, no preload for 1 photo, no transition style reduced. |
| `src/hooks/useAllPhotos.ts` | 61 | Fan-out: Promise.all over N cities → ReadonlyMap. reqIdRef stale guard with sentinel -1 on unmount. Per-city errors swallowed → empty array. |
| `src/hooks/useAllPhotos.test.ts` | 103 | 5 tests: empty cities, undefined cities, 3-city aggregation, per-city error swallow, unmount stale guard. |
| `src/reel/ChapterOverlay.tsx` | 130 | isPhotoCard branch: PhotoCycle for /app/ real photos, gradient stack for public seeded reel. 0-photo: entire photo block omitted (no broken img). |
| `src/reel/ReducedMotionReel.tsx` | 99 | isPhotoCard branch: lazy-loaded img grid for real photos, gradient divs for seeded reel. 0-photo: no photo grid (no empty-state illustration). |
| `src/routes/AppReelRoute.tsx` | 110 | useAllPhotos + chaptersWithPhotos replace groupsToChapters. AppReelContent inner component holds the hooks to satisfy rules-of-hooks. |

## Test Results

| File | Tests | Status |
|------|-------|--------|
| `src/reel/chaptersWithPhotos.test.ts` | 8 | PASS |
| `src/reel/PhotoCycle.test.tsx` | 8 | PASS |
| `src/hooks/useAllPhotos.test.ts` | 5 | PASS |
| All prior tests (baseline 214) | 214 | PASS |
| **Total** | **235** | **PASS** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `<link rel="preload">` not queryable in jsdom DOM**
- **Found during:** Task 2 — PhotoCycle.test.tsx — `container.querySelectorAll('link[rel="preload"]')` returned 0 elements
- **Issue:** jsdom does not append `<link>` elements placed in the body to the document's queryable DOM tree. The approach works in real browsers but is untestable in vitest/jsdom.
- **Fix:** Switched from `<link rel="preload" as="image" href={next.thumbUrl}>` to `<img src={next.thumbUrl} alt="" aria-hidden="true" style={{ display: 'none' }}>`. Both approaches cause the browser to prefetch the image; the hidden img is queryable via `img[aria-hidden="true"]` in tests.
- **Files modified:** `src/reel/PhotoCycle.tsx`, `src/reel/PhotoCycle.test.tsx`
- **Commit:** 5f30cda

**2. [Rule 2 - Missing Critical] AppReelContent extracted to satisfy rules-of-hooks**
- **Found during:** Task 3 — AppReelRoute.tsx — `useAllPhotos` would be called after early returns (loading, error, empty states), violating React's rules of hooks
- **Issue:** The plan's suggested placement of `useAllPhotos` at line 68 (after early-return guards) violates the rules of hooks. ESLint/TypeScript would flag this, and React would error at runtime.
- **Fix:** Extracted `AppReelContent` as a separate inner component. All early returns remain in `AppReelRoute`. `useAllPhotos`, `groupChapters`, and `chaptersWithPhotos` are called unconditionally inside `AppReelContent`.
- **Files modified:** `src/routes/AppReelRoute.tsx`
- **Commit:** a8933b9

## Confirmed Behaviors

- **Adjacent-dedup preserved:** `chaptersWithPhotos` receives `ChapterGroup[]` output from `groupChapters`. Cycling happens within a single `ChapterGroup` across its `members[].photos`. No regrouping logic was added. Verified by `chaptersWithPhotos.test.ts` immutability test.
- **0-photo fallback:** `ChapterOverlay` and `ReducedMotionReel` both omit the photo block entirely when `chapter.photos.length === 0`. No broken `<img>` tags. No empty-state illustrations (DESIGN.md Risk 3 honored).
- **prefers-reduced-motion:** PhotoCycle shows first photo only when reduced. No interval scheduled. No transition style on the `<img>` element. Verified by tests.
- **Public reel unchanged:** PhotoSeed gradient path still renders via `isPhotoCard === false` branch. Public routes do not call `useAllPhotos`.

## Known Stubs

None. All components are wired to real data sources:
- `useAllPhotos` calls `listPhotos` which hits GET /api/cities/:cityId/photos (06-02)
- `chaptersWithPhotos` merges real PhotoCard[] into the chapter pipeline
- `PhotoCycle` renders from real thumbUrls with real cycling state

## Open Questions for Real-Device QA

1. **Cycle interval tuning:** The plan spec locks this at 4000ms. CONTEXT.md originally specified 2500ms. After shipping, test on iPhone 14 Pro Safari during the chapter dwell (which is `--motion-cinematic` 2400ms map flyTo + dwell time). If 4s feels too slow against the cinematic pace, tune `CYCLE_INTERVAL_MS` in `PhotoCycle.tsx` and update the test expectation. No architecture change needed.

2. **Crossfade feel:** The 200ms `opacity linear` crossfade was chosen per DESIGN.md motion spec. On real hardware, test against the `--ease-arrival` arrival-pulse to confirm they don't visually compete. If the crossfade reads as jarring during the initial photo-card arrival, consider adding a short delay before the first cycle (e.g., 1500ms) so the Framer arrival animation completes before cycling begins.

3. **Fan-out latency:** On slow connections, 10 GET requests firing on reel load may be noticeable. The reel renders chapters with empty photos immediately; photos "appear" as the fan-out resolves. This is intentional (no layout jolt). Verify on iPhone under 4G throttling that the empty-then-filled transition looks natural rather than jarring.

4. **iOS Safari `<img aria-hidden="true" style={{ display: 'none' }}>` preload:** Some iOS Safari versions may not preload images with `display: none`. If the crossfade between photos feels delayed on device (second photo loads visibly after the interval fires), upgrade the preload strategy to an off-screen positioned element (`position: absolute; left: -9999px; width: 1px; height: 1px`) which Safari treats as loaded.

## Threat Flags

None. All new network endpoints were pre-existing from 06-02's threat model. useAllPhotos only calls authenticated endpoints (JWT enforced server-side). OCI URLs in `<img src>` are attribute values, not innerHTML — no XSS surface.

## Self-Check: PASSED

Files exist:
- src/types/reel.ts ✓ (modified)
- src/reel/chaptersWithPhotos.ts ✓
- src/reel/chaptersWithPhotos.test.ts ✓
- src/reel/PhotoCycle.tsx ✓
- src/reel/PhotoCycle.test.tsx ✓
- src/hooks/useAllPhotos.ts ✓
- src/hooks/useAllPhotos.test.ts ✓
- src/reel/ChapterOverlay.tsx ✓ (modified)
- src/reel/ReducedMotionReel.tsx ✓ (modified)
- src/routes/AppReelRoute.tsx ✓ (modified)

Commits exist:
- 9038eda (task 1/4 — types + chaptersWithPhotos + tests)
- 5f30cda (task 2/4 — useAllPhotos + PhotoCycle + tests)
- a8933b9 (task 3/4 — ChapterOverlay + ReducedMotionReel + AppReelRoute wired)
- ce04aa2 (task 4/4 — REQUIREMENTS.md REEL-09 traceability)
