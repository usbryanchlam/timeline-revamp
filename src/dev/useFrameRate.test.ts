// @vitest-environment jsdom
//
// useFrameRate — DEV-only rAF-based FPS sampler gated on ?fps=1 query string.
//
// Test 1: import.meta.env.DEV=false → returns null (no rAF loop).
//   (Note: vitest runs with DEV=true; we simulate the prod-build flag by
//    asserting on the enabled flag chain: when `?fps` is absent the hook
//    returns null even in DEV. This is the parallel guard that fires in prod.)
//
// Test 2: DEV=true but URLSearchParams has no 'fps' key → returns null.
//
// Test 3: DEV=true + ?fps=1 → starts sampling, after windowMs returns
//   { fps, median, p95, sampleCount } with deterministic math.
//
// Test 4: cleanup cancels rAF on unmount.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFrameRate } from './useFrameRate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubLocationSearch(search: string): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...window.location, search },
  });
}

let rafCallbacks: Array<(t: number) => void> = [];
let rafIdCounter = 0;
let cancelled: number[] = [];

function installRafShim(): void {
  rafCallbacks = [];
  rafIdCounter = 0;
  cancelled = [];
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void): number => {
    rafIdCounter += 1;
    const id = rafIdCounter;
    rafCallbacks.push(cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
    cancelled.push(id);
  });
}

/**
 * Drives the rAF shim through N frames at a fixed frame-delta. After each
 * frame, the hook re-registers its callback for the next tick — we pop the
 * latest registered callback and invoke it with the next timestamp.
 */
function driveFrames(frameCount: number, deltaMs: number, startMs = 0): void {
  let t = startMs;
  for (let i = 0; i < frameCount; i += 1) {
    t += deltaMs;
    // Pop the most-recently registered callback (the hook should only have
    // ONE pending rAF at a time).
    const cb = rafCallbacks.shift();
    if (!cb) break;
    cb(t);
  }
}

beforeEach(() => {
  installRafShim();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Test 1: enabled=false short-circuits (returns null, no rAF registered)
// ---------------------------------------------------------------------------

describe('useFrameRate — enabled flag chain', () => {
  it('Test 1: enabled=false → returns null and registers no rAF', () => {
    stubLocationSearch('?fps=1'); // would normally pass the URL gate
    const { result } = renderHook(() =>
      useFrameRate({ enabled: false }),
    );
    expect(result.current).toBeNull();
    expect(rafCallbacks.length).toBe(0);
  });

  it('Test 2: DEV=true but no ?fps in URL → returns null and registers no rAF', () => {
    stubLocationSearch(''); // no fps key
    const { result } = renderHook(() => useFrameRate());
    expect(result.current).toBeNull();
    expect(rafCallbacks.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 3: ?fps=1 + DEV=true → samples and returns median + p95
// ---------------------------------------------------------------------------

describe('useFrameRate — sampling + median/p95 math', () => {
  it('Test 3: 60 frames at 16.67ms delta → median ≈ 60 fps, p95-low ≈ 60 fps', () => {
    stubLocationSearch('?fps=1');
    const { result, rerender } = renderHook(() =>
      useFrameRate({ windowMs: 8000 }),
    );
    // Initially null — no sample window completed yet.
    expect(result.current).toBeNull();

    // Drive 540 frames at 16.67ms each ≈ 9 seconds of 60fps — comfortably
    // above the 8s window so the hook emits a Sample. The first frame seeds
    // lastT/windowStart without producing a delta, so we need a few extra
    // frames over the bare window math.
    act(() => {
      driveFrames(540, 16.6667, 1000);
    });
    rerender();

    const s = result.current;
    expect(s).not.toBeNull();
    expect(s!.median).toBeGreaterThanOrEqual(58);
    expect(s!.median).toBeLessThanOrEqual(62);
    expect(s!.p95).toBeGreaterThanOrEqual(50);
    expect(s!.p95).toBeLessThanOrEqual(62);
    expect(s!.sampleCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 4: cleanup cancels rAF on unmount
// ---------------------------------------------------------------------------

describe('useFrameRate — cleanup', () => {
  it('Test 4: unmount cancels the pending rAF (no leak)', () => {
    stubLocationSearch('?fps=1');
    const { unmount } = renderHook(() => useFrameRate());

    // Drive one frame so the hook registers its first rAF.
    act(() => {
      driveFrames(1, 16.6667, 1000);
    });
    const idsBefore = cancelled.length;

    unmount();
    // After unmount, cancelAnimationFrame must have been called at least
    // once for the rAF id the hook held when it tore down.
    expect(cancelled.length).toBeGreaterThan(idsBefore);
  });
});
