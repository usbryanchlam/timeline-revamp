// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import type { ReelState } from '@/gestures/stateMachine';
import type { ReelStateName } from '@/types/reel';

// jsdom doesn't implement matchMedia. usePrefersReducedMotion (called via
// PhotoCycle inside ChapterOverlay) reads it on mount; provide a stub.
beforeAll(() => {
  if (typeof window !== 'undefined' && !window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

// ---------------------------------------------------------------------------
// Mock useGestureMachine so the test can feed a deterministic state.
// ---------------------------------------------------------------------------

let mockState: ReelState = {
  name: 'IDLE',
  chapterIndex: 0,
  scrubT: null,
  pointerCount: 0,
  gestureStartedAt: null,
  gestureDx: 0,
  gestureDy: 0,
};

vi.mock('@/gestures/useGestureMachine', () => ({
  useGestureMachine: () => ({
    state: mockState,
    dispatch: vi.fn(),
    bind: vi.fn(),
  }),
}));

// MapCanvas is lazy-loaded; the Suspense fallback (MapPoster) renders by
// default in tests. No need to mock unless tests hit map code.
vi.mock('@/reel/MapCanvas', () => ({
  MapCanvas: () => null,
}));

const { Reel } = await import('@/reel/Reel');

function setMockState(name: ReelStateName, chapterIndex: number) {
  mockState = {
    name,
    chapterIndex,
    scrubT: null,
    pointerCount: 0,
    gestureStartedAt: null,
    gestureDx: 0,
    gestureDy: 0,
  };
}

describe('Reel — A11Y-04 aria-live arrival-pulse alignment', () => {
  it('announces chapter name on initial render (state.name=IDLE)', () => {
    setMockState('IDLE', 0);
    const { container } = render(<Reel />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    // Pattern: "<Name>, <Month> <Year>" e.g. "Kyoto, October 2024"
    expect(live!.textContent).toMatch(/.+,\s+\w+\s+\d{4}/);
  });

  it('does NOT announce mid-flight when state.name=CHAPTER_SWIPE', () => {
    setMockState('CHAPTER_SWIPE', 2);
    const { container } = render(<Reel />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    // Effect early-returns when state.name is not IDLE/PAUSED, so the live
    // region must stay empty on first mount under a mid-flight state.
    expect(live!.textContent ?? '').toBe('');
  });

  it('announces chapter name when state.name=PAUSED', () => {
    setMockState('PAUSED', 1);
    const { container } = render(<Reel />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live!.textContent).toMatch(/.+,\s+\w+\s+\d{4}/);
  });
});
