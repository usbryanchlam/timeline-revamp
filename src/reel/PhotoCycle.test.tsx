// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { PhotoCard } from '@/types/reel';

// ---------------------------------------------------------------------------
// Mock usePrefersReducedMotion so tests can control it
// ---------------------------------------------------------------------------

const mockUsePrefersReducedMotion = vi.fn<() => boolean>(() => false);

vi.mock('@/reel/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => mockUsePrefersReducedMotion(),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks are set up
// ---------------------------------------------------------------------------

const { PhotoCycle } = await import('@/reel/PhotoCycle');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCard(id: string): PhotoCard {
  return {
    id,
    masterUrl: `https://oci.test/master/${id}.jpg`,
    thumbUrl: `https://oci.test/thumb/${id}.jpg`,
    alt: `Photo ${id}`,
    orderIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PhotoCycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePrefersReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when photos is empty', () => {
    const { container } = render(<PhotoCycle photos={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the first photo with src=thumbUrl when given photos', () => {
    const photos = [makeCard('a'), makeCard('b')];
    render(<PhotoCycle photos={photos} />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toContain('thumb/a');
  });

  it('cycles to next photo after dwell/N ms (3 photos → 1500ms each)', () => {
    vi.useFakeTimers();
    mockUsePrefersReducedMotion.mockReturnValue(false);
    const photos = [makeCard('a'), makeCard('b'), makeCard('c')];
    // Pin dwell at 4500 explicitly so the test is hermetic against
    // AUTOPLAY_DWELL_MS tuning.
    render(<PhotoCycle photos={photos} dwellMs={4500} />);
    expect(screen.getByRole('img').getAttribute('src')).toContain('thumb/a');
    // 4500ms dwell ÷ 3 photos = 1500ms per photo.
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('img').getAttribute('src')).toContain('thumb/b');
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('img').getAttribute('src')).toContain('thumb/c');
  });

  it('two photos cycle at 2250ms each (4500ms / 2)', () => {
    vi.useFakeTimers();
    mockUsePrefersReducedMotion.mockReturnValue(false);
    const photos = [makeCard('a'), makeCard('b')];
    render(<PhotoCycle photos={photos} dwellMs={4500} />);
    act(() => {
      vi.advanceTimersByTime(2250);
    });
    expect(screen.getByRole('img').getAttribute('src')).toContain('thumb/b');
  });

  it('many photos clamp to the 800ms floor (10 photos → 800ms each, not 450ms)', () => {
    vi.useFakeTimers();
    mockUsePrefersReducedMotion.mockReturnValue(false);
    const photos = Array.from({ length: 10 }, (_, i) => makeCard(`p${i}`));
    render(<PhotoCycle photos={photos} dwellMs={4500} />);
    expect(screen.getByRole('img').getAttribute('src')).toContain('thumb/p0');
    // 4500 / 10 = 450ms, but the floor is 800ms — verify by advancing
    // just under the floor and confirming NO advance, then past the floor.
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByRole('img').getAttribute('src')).toContain('thumb/p0');
    act(() => {
      vi.advanceTimersByTime(400); // total 850ms → past 800ms floor
    });
    expect(screen.getByRole('img').getAttribute('src')).toContain('thumb/p1');
  });

  it('respects dwellMs prop override (3000ms dwell, 3 photos → 1000ms each)', () => {
    vi.useFakeTimers();
    mockUsePrefersReducedMotion.mockReturnValue(false);
    const photos = [makeCard('a'), makeCard('b'), makeCard('c')];
    render(<PhotoCycle photos={photos} dwellMs={3000} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('img').getAttribute('src')).toContain('thumb/b');
  });

  it('single photo: no interval scheduled', () => {
    vi.useFakeTimers();
    mockUsePrefersReducedMotion.mockReturnValue(false);
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    render(<PhotoCycle photos={[makeCard('only')]} />);
    expect(screen.getByRole('img').getAttribute('src')).toContain('thumb/only');
    // No cycle timer should be scheduled at all.
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('prefers-reduced-motion: shows only first photo, no timer scheduled', () => {
    vi.useFakeTimers();
    mockUsePrefersReducedMotion.mockReturnValue(true);
    const photos = [makeCard('a'), makeCard('b'), makeCard('c')];
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    render(<PhotoCycle photos={photos} />);
    // Should show first photo
    expect(screen.getByRole('img').getAttribute('src')).toContain('thumb/a');
    // Advance time — should NOT cycle
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.getByRole('img').getAttribute('src')).toContain('thumb/a');
    // No interval should have been scheduled for cycling under reduce-motion.
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('cleans up timer on unmount', () => {
    vi.useFakeTimers();
    mockUsePrefersReducedMotion.mockReturnValue(false);
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const photos = [makeCard('a'), makeCard('b')];
    const { unmount } = render(<PhotoCycle photos={photos} />);
    unmount();
    // clearInterval should have been called on cleanup
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('renders a hidden preload img for the next photo only (not all photos)', () => {
    mockUsePrefersReducedMotion.mockReturnValue(false);
    const photos = [makeCard('a'), makeCard('b'), makeCard('c')];
    const { container } = render(<PhotoCycle photos={photos} />);
    // Visible img for current photo + hidden preload img for next
    const allImgs = container.querySelectorAll('img');
    // One visible img (current=a) + one hidden preload img (next=b)
    expect(allImgs).toHaveLength(2);
    const hiddenImg = container.querySelector('img[aria-hidden="true"]');
    expect(hiddenImg).not.toBeNull();
    expect(hiddenImg!.getAttribute('src')).toContain('thumb/b');
  });

  it('no preload img when only one photo (no next)', () => {
    mockUsePrefersReducedMotion.mockReturnValue(false);
    const photos = [makeCard('a')];
    const { container } = render(<PhotoCycle photos={photos} />);
    // Only one img (visible, no preload)
    const allImgs = container.querySelectorAll('img');
    expect(allImgs).toHaveLength(1);
    expect(container.querySelector('img[aria-hidden="true"]')).toBeNull();
  });

  it('img has no transition style when reduced motion is true', () => {
    mockUsePrefersReducedMotion.mockReturnValue(true);
    const photos = [makeCard('a'), makeCard('b')];
    render(<PhotoCycle photos={photos} />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('style')).toContain('transition: none');
  });
});
