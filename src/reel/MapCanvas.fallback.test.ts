// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// We mock maplibre-gl wholesale because the real implementation needs WebGL,
// which jsdom does not provide. We test that MapCanvas wires the error handler
// correctly and that the swap logic preserves view state.

// vi.mock is hoisted; mockMapInstances + FakeAJAXError must use vi.hoisted to be
// available inside the factory closure.
const hoisted = vi.hoisted(() => {
  class FakeAJAXErrorImpl extends Error {
    status: number;
    url: string;
    constructor(opts: { status: number; url: string }) {
      super(`AJAXError ${opts.status}`);
      this.status = opts.status;
      this.url = opts.url;
    }
  }
  return {
    FakeAJAXError: FakeAJAXErrorImpl,
    mockMapInstances: [] as Array<unknown>,
  };
});

const FakeAJAXError = hoisted.FakeAJAXError;

interface MockMapInst {
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  setStyle: ReturnType<typeof vi.fn>;
  jumpTo: ReturnType<typeof vi.fn>;
  getCenter: () => { lng: number; lat: number };
  getZoom: () => number;
  getBearing: () => number;
  getPitch: () => number;
  remove: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
}
const mockMapInstances = hoisted.mockMapInstances as MockMapInst[];

vi.mock('maplibre-gl', () => {
  // Must be a real constructor (class or function) so `new maplibregl.Map(...)`
  // returns the inst object — vi.fn() arrow returns are rejected as non-constructor.
  function Map(this: unknown) {
    const inst = {
      on: vi.fn(),
      once: vi.fn(),
      setStyle: vi.fn(),
      jumpTo: vi.fn(),
      getCenter: () => ({ lng: 10, lat: 20 }),
      getZoom: () => 5,
      getBearing: () => 30,
      getPitch: () => 40,
      remove: vi.fn(),
      flyTo: vi.fn(),
      dragPan: { enable: vi.fn(), disable: vi.fn() },
      touchZoomRotate: { enable: vi.fn(), disable: vi.fn() },
      scrollZoom: { enable: vi.fn(), disable: vi.fn() },
      doubleClickZoom: { enable: vi.fn(), disable: vi.fn() },
      resize: vi.fn(),
    };
    hoisted.mockMapInstances.push(inst);
    return inst;
  }
  return {
    default: { Map },
    Map,
    AJAXError: hoisted.FakeAJAXError,
  };
});

// Import AFTER the mock so MapCanvas binds to the fake maplibregl namespace.
import { MapCanvas } from './MapCanvas';

// Use a loose cast: the test only exercises the init effect's error path,
// not chapter content. CityChapter requires fields we don't care about here.
const chapters = [
  {
    id: 'a',
    name: 'A',
    caption: '',
    center: [0, 0] as [number, number],
    zoom: 12,
    pitch: 0,
    bearing: 0,
    country: '',
    arrivedAt: '',
    photos: [],
  },
] as never;

describe('MapCanvas — ERR-03 MapTiler 429 fallback', () => {
  beforeEach(() => {
    mockMapInstances.length = 0;
    sessionStorage.removeItem('map-fallback-active');
    // jsdom doesn't provide matchMedia; the chapter effect reads
    // prefers-reduced-motion. Stub to a non-matching MediaQueryList shape.
    if (!window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
          onchange: null,
        })),
      });
    }
  });
  afterEach(() => {
    sessionStorage.removeItem('map-fallback-active');
  });

  function getErrorHandler() {
    const inst = mockMapInstances[0]!;
    const errorCall = inst.on.mock.calls.find((c) => c[0] === 'error');
    if (!errorCall) throw new Error('error handler not registered');
    return errorCall[1] as (e: { error: unknown }) => void;
  }

  it('swaps style + preserves view on MapTiler 429', () => {
    const onFallbackActivated = vi.fn();
    render(
      React.createElement(MapCanvas, {
        chapters,
        chapterIndex: 0,
        stateName: 'IDLE' as never,
        onFallbackActivated,
      }),
    );
    const inst = mockMapInstances[0]!;
    const handler = getErrorHandler();

    handler({
      error: new FakeAJAXError({
        status: 429,
        url: 'https://api.maptiler.com/maps/streets-v2-dark/style.json',
      }),
    });

    expect(inst.setStyle).toHaveBeenCalledTimes(1);
    expect(inst.setStyle.mock.calls[0]![1]).toEqual({ diff: false });
    expect(onFallbackActivated).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('map-fallback-active')).toBe('1');

    // styledata -> jumpTo wiring should call jumpTo with preserved view.
    expect(inst.once).toHaveBeenCalledWith('styledata', expect.any(Function));
    const styleCb = inst.once.mock.calls.find((c) => c[0] === 'styledata')![1] as () => void;
    styleCb();
    expect(inst.jumpTo).toHaveBeenCalledWith({
      center: { lng: 10, lat: 20 },
      zoom: 5,
      bearing: 30,
      pitch: 40,
    });
  });

  it('ignores non-MapTiler 429 (OSM 429 cannot fall further)', () => {
    const onFallbackActivated = vi.fn();
    render(
      React.createElement(MapCanvas, {
        chapters,
        chapterIndex: 0,
        stateName: 'IDLE' as never,
        onFallbackActivated,
      }),
    );
    const inst = mockMapInstances[0]!;
    const handler = getErrorHandler();
    handler({
      error: new FakeAJAXError({
        status: 429,
        url: 'https://tile.openstreetmap.org/12/3/4.png',
      }),
    });
    expect(inst.setStyle).not.toHaveBeenCalled();
    expect(onFallbackActivated).not.toHaveBeenCalled();
  });

  it('ignores non-429 errors', () => {
    render(
      React.createElement(MapCanvas, {
        chapters,
        chapterIndex: 0,
        stateName: 'IDLE' as never,
      }),
    );
    const inst = mockMapInstances[0]!;
    const handler = getErrorHandler();
    handler({
      error: new FakeAJAXError({
        status: 404,
        url: 'https://api.maptiler.com/maps/streets-v2-dark/style.json',
      }),
    });
    expect(inst.setStyle).not.toHaveBeenCalled();
  });

  it('ignores non-AJAXError errors', () => {
    render(
      React.createElement(MapCanvas, {
        chapters,
        chapterIndex: 0,
        stateName: 'IDLE' as never,
      }),
    );
    const inst = mockMapInstances[0]!;
    const handler = getErrorHandler();
    handler({ error: new Error('plain error') });
    expect(inst.setStyle).not.toHaveBeenCalled();
  });

  it('does not re-fire after sessionStorage flag is set (no infinite loop)', () => {
    sessionStorage.setItem('map-fallback-active', '1');
    render(
      React.createElement(MapCanvas, {
        chapters,
        chapterIndex: 0,
        stateName: 'IDLE' as never,
      }),
    );
    const inst = mockMapInstances[0]!;
    const handler = getErrorHandler();
    handler({
      error: new FakeAJAXError({
        status: 429,
        url: 'https://api.maptiler.com/maps/streets-v2-dark/style.json',
      }),
    });
    expect(inst.setStyle).not.toHaveBeenCalled();
  });
});
