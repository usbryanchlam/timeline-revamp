// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks (declared BEFORE component import)
// ---------------------------------------------------------------------------

const mockSetBearing = vi.fn();
const mockGetBearing = vi.fn(() => 0);
const mockSetProjection = vi.fn();
const mockRemove = vi.fn();

// Capture handlers registered via map.on so the test can fire 'style.load'
// manually and assert ordering.
const onHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};
const mockOn = vi.fn((evt: string, cb: (...args: unknown[]) => void) => {
  if (!onHandlers[evt]) onHandlers[evt] = [];
  onHandlers[evt].push(cb);
});

const mockMapConstructor = vi.fn();

// Use a regular constructor function (arrow functions have no [[Construct]]).
function MockMap(this: Record<string, unknown>, opts: Record<string, unknown>) {
  mockMapConstructor(opts);
  this.setBearing = mockSetBearing;
  this.getBearing = mockGetBearing;
  this.setProjection = mockSetProjection;
  this.on = mockOn;
  this.remove = mockRemove;
}

vi.mock('maplibre-gl', () => ({
  default: { Map: MockMap },
  Map: MockMap,
}));

const mockUseBearingOrbit = vi.fn();
vi.mock('@/reel/useBearingOrbit', () => ({
  useBearingOrbit: (ref: unknown, dps: number, enabled: boolean) =>
    mockUseBearingOrbit(ref, dps, enabled),
}));

vi.mock('@/reel/CTAPill', () => ({
  CTAPill: () => <div data-testid="cta-pill" />,
}));

const { GlobeReel } = await import('./GlobeReel');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GlobeReel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(onHandlers)) delete onHandlers[key];
  });

  afterEach(() => {
    cleanup();
  });

  it('init uses center [0, 20], zoom 1, pitch 0, interactive: false', () => {
    render(<GlobeReel />);
    const opts = mockMapConstructor.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(opts.center).toEqual([0, 20]);
    expect(opts.zoom).toBe(1);
    expect(opts.pitch).toBe(0);
    expect(opts.interactive).toBe(false);
  });

  it('setProjection is called INSIDE the style.load handler, not synchronously', () => {
    render(<GlobeReel />);
    // map.on('style.load', cb) MUST have been registered.
    expect(mockOn).toHaveBeenCalledWith('style.load', expect.any(Function));
    // setProjection MUST NOT have fired before the style.load callback runs.
    expect(mockSetProjection).not.toHaveBeenCalled();
    // Fire the captured style.load handler.
    const handlers = onHandlers['style.load'];
    expect(handlers && handlers.length).toBe(1);
    handlers![0]!();
    // Now setProjection({ type: 'globe' }) should have been called.
    expect(mockSetProjection).toHaveBeenCalledWith({ type: 'globe' });
  });

  it('invokes useBearingOrbit(ref, 10, true)', () => {
    render(<GlobeReel />);
    expect(mockUseBearingOrbit).toHaveBeenCalled();
    const lastCall = mockUseBearingOrbit.mock.calls[mockUseBearingOrbit.mock.calls.length - 1];
    expect(lastCall?.[1]).toBe(10);
    expect(lastCall?.[2]).toBe(true);
  });

  it('renders the literal caption "No trips yet. Check back soon."', () => {
    render(<GlobeReel />);
    expect(screen.getByText('No trips yet. Check back soon.')).toBeTruthy();
  });

  it('renders CTAPill', () => {
    render(<GlobeReel />);
    expect(screen.getByTestId('cta-pill')).toBeTruthy();
  });

  it('cleanup on unmount calls map.remove()', () => {
    const { unmount } = render(<GlobeReel />);
    unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
