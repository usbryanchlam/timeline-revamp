---
phase: 06-photo-upload-pipeline
plan: "03"
subsystem: client-ui
tags:
  - photos
  - client
  - ui
  - sheet
  - upload
  - viewer
dependency_graph:
  requires:
    - 06-01 (heicToJpeg, canvasResize, uploadQueue, xhrUpload)
    - 06-02 (POST /upload-url, POST /finalize, DELETE /:id, GET /photos)
    - 05-01 (cities GET — CityDTO drives sheet title/caption)
  provides:
    - src/api/photos.ts (listPhotos, requestUploadUrl, finalizePhoto, deletePhoto, PhotoDTO)
    - src/hooks/usePhotosQuery.ts (usePhotosQuery — stale-response-guarded list hook)
    - src/components/PhotoGrid.tsx (thumbnail grid, 3-col mobile / 4-col md+)
    - src/components/PhotoUploader.tsx (multi-select + concurrency-3 + per-file progress)
    - src/components/PhotoDetailSheet.tsx (responsive bottom-sheet / centered modal)
    - src/components/PhotoViewer.tsx (full-screen viewer + per-photo delete)
    - src/routes/TripsRoute.tsx (Photos button wired per city)
  affects:
    - 06-04 (reel will import PhotoDTO type from src/api/photos.ts)
tech_stack:
  added:
    - "@testing-library/react 16.3.2 (RTL for component tests — was absent from project)"
    - "@testing-library/user-event 14.6.1 (user-event for file input simulation)"
    - "@testing-library/jest-dom 6.9.1 (jest-dom matchers)"
    - "jsdom 29.1.1 (DOM environment for vitest component tests)"
  patterns:
    - mountedRef StrictMode-safe re-anchor pattern (CityForm.tsx analog)
    - reqIdRef stale-response guard (useCitiesQuery analog)
    - xhrUpload (not fetch) for upload progress events
    - Responsive bottom-sheet/modal: rounded-t-3xl mobile, rounded-3xl md+
    - Optimistic delete with revert on server error
    - prefers-reduced-motion: skip transition-* classes on PhotoViewer master image
    - previousFocusRef focus capture+restore on both sheet and viewer
    - "@vitest-environment jsdom file-level annotation (not global — server tests stay node)"
key_files:
  created:
    - src/api/photos.ts
    - src/api/photos.test.ts
    - src/hooks/usePhotosQuery.ts
    - src/hooks/usePhotosQuery.test.ts
    - src/components/PhotoGrid.tsx
    - src/components/PhotoUploader.tsx
    - src/components/PhotoUploader.test.tsx
    - src/components/PhotoDetailSheet.tsx
    - src/components/PhotoDetailSheet.test.tsx
    - src/components/PhotoViewer.tsx
    - src/components/PhotoViewer.test.tsx
  modified:
    - src/routes/TripsRoute.tsx (added selectedCityId state + Photos buttons + PhotoDetailSheet mount)
    - vitest.config.ts (changed default environment node → node, added jsdom context note)
    - package.json (added @testing-library/* + jsdom devDependencies)
    - bun.lock
decisions:
  - "Install @testing-library/react + jsdom as Rule 3 deviation — plan stated 'RTL already installed' but project had no testing-library packages at baseline"
  - "per-file @vitest-environment jsdom annotation (not global) to preserve existing server tests which fail in jsdom due to jose library Uint8Array issues"
  - "PhotoViewer.tsx created during Task 3 (not Task 4) to resolve PhotoDetailSheet import dependency — avoids two-pass build failure; Task 4 owns the commit"
  - "Photos trigger in TripsRoute rendered as separate per-city button list (not via CityList prop) because CityList.tsx is Phase 5 scope (read-only for this plan)"
  - "PhotoViewer uses 'Couldn\\'t delete. Try again.' as exact error microcopy (DESIGN.md sentence-case, no exclamation)"
  - "Caption is read-only in both PhotoDetailSheet and PhotoViewer — caption EDIT deferred per CONTEXT.md"
metrics:
  duration: "~90 minutes"
  completed: "2026-05-13"
  tasks_completed: 4
  files_changed: 13
---

# Phase 6 Plan 03: Photo Detail Sheet UI + Multi-select Uploader + Full-screen Viewer + Per-photo Delete

JWT-auth-scoped photo UI: multi-select upload with real-time progress, thumbnail grid in a responsive sheet, full-screen viewer with swipe/keys/delete, all wired to 06-01's client pipeline and 06-02's server endpoints.

## What Shipped

| File | Lines | What it does |
|------|-------|--------------|
| `src/api/photos.ts` | 72 | Typed fetch wrappers: listPhotos, requestUploadUrl, finalizePhoto, deletePhoto. Parses error codes from JSON body for per-error throws. |
| `src/hooks/usePhotosQuery.ts` | 55 | React hook: GET /api/cities/:cityId/photos with reqIdRef stale-response guard; sentinel -1 on unmount; useCallback refetch. |
| `src/components/PhotoGrid.tsx` | 37 | Presentational thumbnail grid: 3-col mobile, 4-col md+, aspect-square, rounded-xl, empty-alt, min-44px tap targets. |
| `src/components/PhotoUploader.tsx` | 183 | Multi-select uploader: detectIsHeic → convertHeicToJpeg → resizeAndStrip → xhrUpload → finalizePhoto pipeline wired to createUploadQueue (concurrency 3). StrictMode-safe mountedRef. Exact DESIGN.md microcopy. |
| `src/components/PhotoDetailSheet.tsx` | 137 | Responsive bottom-sheet (rounded-t-3xl) / centered modal (md+). usePhotosQuery + localPhotos for optimistic delete sync. Focus capture/return. Escape-to-close. Mounts PhotoViewer on grid tap. |
| `src/components/PhotoViewer.tsx` | 268 | Full-screen single-photo viewer: ArrowLeft/Right + swipe + Escape + backdrop. Thumb placeholder while master loads. prefers-reduced-motion: opacity-only, no transition-*. Per-photo delete: trash → inline Cancel/Delete confirm → deletePhoto → onPhotoDeleted → close if empty. |
| `src/routes/TripsRoute.tsx` | +28 | Added selectedCityId state, selectedCity derived, per-city "Photos" amber ghost button list, PhotoDetailSheet mount. |

## Props Contracts

**PhotoDetailSheet:**
```typescript
interface PhotoDetailSheetProps {
  readonly city: CityDTO;
  readonly onClose: () => void;
}
```
Single-mode (view + upload). No edit affordance (deferred).

**PhotoViewer:**
```typescript
interface PhotoViewerProps {
  readonly photos: readonly PhotoDTO[];
  readonly initialIndex: number;
  readonly cityId: string;
  readonly onClose: () => void;
  readonly onPhotoDeleted: (photoId: string) => void;
}
```
`onPhotoDeleted` is called with the deleted photoId. PhotoDetailSheet uses this to update `localPhotos` optimistically.

## Trips Route Wiring

A separate photo-trigger button list is rendered below the CityList in TripsRoute. Each city gets an amber ghost button: "{cityName} — Photos". Clicking sets `selectedCityId` → mounts `<PhotoDetailSheet city={selectedCity} onClose={...} />`. The existing edit flow (CityList onCardClick → CityForm) is unchanged.

CityList.tsx was NOT modified (Phase 5 scope constraint).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @testing-library/react not installed**
- **Found during:** Task 1 first test run
- **Issue:** Plan stated "RTL + vitest already installed" but the project had no `@testing-library/*` packages in package.json or node_modules. `bun run test` exited with `Cannot find package '@testing-library/react'`.
- **Fix:** `bun add -d @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom`. Updated vitest.config.ts to use `@vitest-environment jsdom` per-file annotations (not global) because changing the global environment to `jsdom` broke server tests (jose library's `Uint8Array` type coercion differs in jsdom vs node).
- **Files modified:** `package.json`, `bun.lock`, `vitest.config.ts`, all 4 test files (added `// @vitest-environment jsdom` comment header)
- **Commits:** c02e460

**2. [Rule 1 - Deviation] PhotoViewer created during Task 3 (not Task 4)**
- **Found during:** Task 3 — PhotoDetailSheet imports PhotoViewer which didn't exist yet
- **Issue:** Sequential task plan assumed PhotoViewer import would resolve during Task 4. In practice, TypeScript and the test runner both fail if the import target doesn't exist, blocking Task 3's tests.
- **Fix:** Created the full PhotoViewer implementation during Task 3's implementation window. Task 4's commit owns the file as planned.
- **Commits:** df929ad

## Deferred Items (NOT shipped per CONTEXT.md)

- Caption EDIT: no textarea or edit affordance in PhotoDetailSheet or PhotoViewer. Caption renders read-only when present.
- Photo reorder UI: no drag-reorder affordance within the grid.
- Bulk delete UI: no multi-select or bulk-delete affordance.
- Photo dedup, AVIF/WebP variants, Live Photo motion track, EXIF re-attach.

## SHIPPED Items (LOCKED in CONTEXT.md)

- Full-screen PhotoViewer with swipe-to-next/prev
- Per-photo delete via trash icon → inline confirm → DELETE /api/photos/:id
- Focus return on both PhotoDetailSheet and PhotoViewer (previousFocusRef pattern)
- prefers-reduced-motion: PhotoViewer suppresses slide animations (opacity only)

## Test Results

| File | Tests | Status |
|------|-------|--------|
| `src/api/photos.test.ts` | 11 | PASS |
| `src/hooks/usePhotosQuery.test.ts` | 4 | PASS |
| `src/components/PhotoUploader.test.tsx` | 6 | PASS |
| `src/components/PhotoDetailSheet.test.tsx` | 6 | PASS |
| `src/components/PhotoViewer.test.tsx` | 9 | PASS |
| All other tests (baseline 178) | 178 | PASS |
| **Total** | **214** | **PASS** |

## Known Stubs

None. All components are wired to real data sources:
- PhotoGrid receives photos from PhotoDetailSheet's `localPhotos` state (fed by usePhotosQuery)
- PhotoUploader calls real API endpoints via `requestUploadUrl` + `finalizePhoto`
- PhotoViewer calls `deletePhoto` API on confirm
- usePhotosQuery calls `listPhotos` which hits GET /api/cities/:cityId/photos (06-02)

## Threat Flags

None. All new network endpoints (GET /photos, DELETE /photos/:id, POST /upload-url, POST /finalize) were pre-existing from 06-02's threat model. This plan adds only client-side consumers.

## Self-Check: PASSED

Files exist:
- src/api/photos.ts ✓
- src/hooks/usePhotosQuery.ts ✓
- src/components/PhotoGrid.tsx ✓
- src/components/PhotoUploader.tsx ✓
- src/components/PhotoDetailSheet.tsx ✓
- src/components/PhotoViewer.tsx ✓
- src/routes/TripsRoute.tsx (modified) ✓

Commits exist:
- c02e460 (task 1/4 — API wrappers + hook + RED scaffolds)
- dcf5d00 (task 2/4 — PhotoGrid + PhotoUploader GREEN)
- 74a9af9 (task 3/4 — PhotoDetailSheet + Trips wiring GREEN)
- df929ad (task 4/4 — PhotoViewer + per-photo delete GREEN)
