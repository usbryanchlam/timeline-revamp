---
phase: 06-photo-upload-pipeline
plan: 01
status: shipped
shipped: 2026-05-12
commits:
  - 8c9f3ed
  - daf049f
  - 3741b75
test_delta: 140 → 159 (+19 in src/photos/)
---

# Plan 06-01 — HEIC convert + resize + EXIF strip on client

## What shipped

Pure client-side image pipeline behind the lazy import boundary. Three modules + three test files:

| File | Lines | What it does |
|------|-------|--------------|
| `src/photos/heicToJpeg.ts` | 60 | Lazy dynamic-imports `heic-to` only when filename matches `.heic`/`.heif`/`.HEIC`/`.HEIF` (extension fast-path). JPEG / PNG bypass WASM entirely. Returns a `Blob` with `type: 'image/jpeg'`. |
| `src/photos/canvasResize.ts` | 76 | Canvas-based resize to 2048px longest-edge (or shorter if requested). Respects EXIF orientation by drawing before re-encode; the output JPEG has no EXIF (canvas drops it on `toBlob`). Quality 0.88. |
| `src/photos/uploadQueue.ts` | 142 | Bounded-concurrency upload queue. Per-file state machine: `queued → converting → uploading(progress) → done | failed(reason)`. Concurrency 3 via `p-limit`. XHR (not fetch) for upload-progress events. AbortController per file. Retry-on-fail callback. |

Tests: 19 passing (8 heicToJpeg + 5 canvasResize + 6 uploadQueue).

## Commits (atomic per task)

1. `8c9f3ed` — RED: failing test scaffolds (proves module-not-found pre-implementation)
2. `daf049f` — GREEN: heicToJpeg + canvasResize implementations
3. `3741b75` — GREEN: uploadQueue (XHR + p-limit + state machine)

## Requirements closed

- **DATA-05** (client side): HEIC → JPEG conversion proven; non-HEIC bypasses WASM
- **DATA-06** (client side): 2048px resize + EXIF strip; 5MB / 10-photo caps wire in 06-03 once they have the file list

DATA-05 + DATA-06 server-side enforcement lives in 06-02; DATA-07 (display/serve) lives in 06-03/06-04.

## Deviations + their rationale

1. **`vi.doMock` + `vi.resetModules()` instead of top-of-file `vi.mock`** — vitest hoists `vi.mock(...)` to module top, which broke per-test variable bindings the plan called for. Per-test `doMock` + module-cache reset is the vitest-idiomatic way to prove WASM isolation per spec. No behavior change.

2. **`MockImageConstructor` / `class MockXHR` regular constructors** — `vi.stubGlobal('Image', vi.fn().mockImplementation(...))` and same for `XMLHttpRequest` fail with "not a constructor" when called via `new`. Switched to plain `function` and `class` so `new` works. Behavior identical.

3. **`.filter()` + last-index instead of `.findLast()`** — `findLast` is ES2023; this project's tsconfig is ES2022. Functionally equivalent.

4. **Plan's RED-verification grep matches zero lines** — plan looked for `.ts` extensions in error output but vitest resolves `.js` → `.ts` so error paths show `.js`. RED was proven by the test count anyway (all 19 failed pre-impl). Plan-level grep quirk, not an implementation issue. Flagged for housekeeping in a future plan revision.

## Bundle impact

`heic-to` (~600KB WASM) stays behind dynamic-import boundary — verified by extension fast-path tests that run without `vi.doMock('heic-to')`. JPEG / PNG uploads never load the WASM.

## What 06-03 will consume

```typescript
import { convertHeicIfNeeded } from '@/photos/heicToJpeg';     // (file: File) → Promise<File>
import { resizeAndStripExif } from '@/photos/canvasResize';     // (file: File, maxEdge?: number) → Promise<File>
import { createUploadQueue } from '@/photos/uploadQueue';       // ({ concurrency, runOne }) → { enqueue, cancel, retry }
import { xhrUpload } from '@/photos/uploadQueue';               // (url: string, file: Blob, onProgress) → Promise<void>
```

PhotoUploader (06-03) composes: `convertHeicIfNeeded → resizeAndStripExif → xhrUpload → finalizePhoto`, with the queue gating concurrency at 3 and surfacing per-file state to the UI.

## Cross-plan notes for integrator

- Wave 1 partner (06-02) finished in parallel: `server/oci/parClient.ts` + `server/routes/photos.ts` + photos_v2 migration applied. No file-tree conflicts (verified — different dirs).
- Full suite: 178/178 tests pass across both plans + Phase 5 baseline (140 → 178, +38 from both plans combined; 19 from 06-01).
- `typecheck` exits 0 on the whole repo.

## Carry-overs

None blocking. Plan revision could fix the RED-step grep quirk noted above; not worth a dedicated commit.
