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

  it('cycles to next photo after 2000ms with fake timers', () => {
    vi.useFakeTimers();
    mockUsePrefersReducedMotion.mockReturnValue(false);
    const photos = [makeCard('a'), makeCard('b'), makeCard('c')];
    render(<PhotoCycle photos={photos} />);
    expect(screen.getByRole('img').getAttribute('src')).toContain('thumb/a');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('img').getAttribute('src')).toContain('thumb/b');
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
    // No interval should have been scheduled for cycling
    // (the only setInterval calls should NOT include 2000ms cycle)
    const cycleCalls = setIntervalSpy.mock.calls.filter((args) => args[1] === 2000);
    expect(cycleCalls).toHaveLength(0);
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
