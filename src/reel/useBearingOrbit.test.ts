// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef, type RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useBearingOrbit } from './useBearingOrbit';

type MockMap = {
  getBearing: ReturnType<typeof vi.fn>;
  setBearing: ReturnType<typeof vi.fn>;
  _current: () => number;
};

function makeMockMap(initialBearing = 0): MockMap {
  let bearing = initialBearing;
  return {
    getBearing: vi.fn(() => bearing),
    setBearing: vi.fn((b: number) => {
      bearing = b;
    }),
    _current: () => bearing,
  };
}

// Deterministic RAF: callbacks captured, fired manually via tick(t).
let rafCallbacks: Array<{ id: number; cb: (t: number) => void }> = [];
let nextRafId = 1;

function tick(t: number): void {
  const drain = rafCallbacks;
  rafCallbacks = [];
  for (const { cb } of drain) cb(t);
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useBearingOrbit', () => {
  beforeEach(() => {
    rafCallbacks = [];
    nextRafId = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = nextRafId++;
      rafCallbacks.push({ id, cb });
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      rafCallbacks = rafCallbacks.filter((entry) => entry.id !== id);
    });
    setHidden(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rafCallbacks = [];
  });

  // Helper to render the hook with a ref already pointing at a mock map.
  function renderWithMap(map: MockMap | null, dps: number, enabled: boolean) {
    return renderHook(() => {
      const ref = useRef(map as unknown as maplibregl.Map | null);
      useBearingOrbit(ref as RefObject<maplibregl.Map | null>, dps, enabled);
    });
  }

  it('first RAF tick after 1000ms delta calls setBearing(45) at 45 deg/s', () => {
    const map = makeMockMap(0);
    renderWithMap(map, 45, true);
    // First tick establishes lastT; no setBearing call.
    tick(0);
    expect(map.setBearing).not.toHaveBeenCalled();
    // Second tick at t=1000 yields dt=1000ms → +45° → setBearing(45).
    tick(1000);
    expect(map.setBearing).toHaveBeenCalledWith(45);
  });

  it('enabled=false registers no RAF', () => {
    const map = makeMockMap(0);
    renderWithMap(map, 45, false);
    expect(rafCallbacks).toHaveLength(0);
  });

  it('10 deg/s globe rate: after 1000ms delta calls setBearing(10)', () => {
    const map = makeMockMap(0);
    renderWithMap(map, 10, true);
    tick(0);
    tick(1000);
    expect(map.setBearing).toHaveBeenLastCalledWith(10);
  });

  it('pauses on document.hidden — no setBearing while hidden', () => {
    const map = makeMockMap(0);
    renderWithMap(map, 45, true);
    tick(0);
    tick(500); // → setBearing(22.5)
    expect(map.setBearing).toHaveBeenCalledWith(22.5);
    map.setBearing.mockClear();
    setHidden(true);
    tick(1000);
    tick(2000);
    expect(map.setBearing).not.toHaveBeenCalled();
  });

  it('lastT resets on resume — no time-warp from hidden duration', () => {
    const map = makeMockMap(0);
    renderWithMap(map, 45, true);
    tick(0);
    tick(500); // setBearing(22.5)
    setHidden(true);
    tick(5000); // hidden — no setBearing
    map.setBearing.mockClear();
    setHidden(false);
    // First post-resume tick re-baselines lastT, no integration of the gap.
    tick(6000);
    expect(map.setBearing).not.toHaveBeenCalled();
    // Next tick at +1000ms after resume baseline → +45° on top of current bearing 22.5.
    tick(7000);
    expect(map.setBearing).toHaveBeenCalledTimes(1);
    expect(map.setBearing.mock.calls[0]?.[0]).toBeCloseTo((22.5 + 45) % 360, 5);
  });

  it('cleanup on unmount cancels RAF and removes the visibilitychange listener', () => {
    const map = makeMockMap(0);
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const { unmount } = renderWithMap(map, 45, true);
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('double mount/unmount cycle stays leak-free: only one RAF chain alive', () => {
    const map = makeMockMap(0);
    const { unmount: u1 } = renderWithMap(map, 45, true);
    u1();
    const { unmount: u2 } = renderWithMap(map, 45, true);
    // After the second mount: exactly one pending RAF callback.
    expect(rafCallbacks.length).toBe(1);
    u2();
    expect(rafCallbacks.length).toBe(0);
  });

  it('bearing wraps % 360 — never overflows', () => {
    const map = makeMockMap(350);
    renderWithMap(map, 45, true);
    tick(0);
    tick(1000); // 350 + 45 = 395 % 360 = 35
    expect(map.setBearing).toHaveBeenLastCalledWith(35);
  });

  it('mapRef.current === null → no-op (no RAF registered)', () => {
    renderWithMap(null, 45, true);
    expect(rafCallbacks).toHaveLength(0);
  });
});
