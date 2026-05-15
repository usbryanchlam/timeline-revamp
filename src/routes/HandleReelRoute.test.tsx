// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import type { CityDTO } from '@/types/city';
import type { PublicReelState, PublicReelPhotoDTO } from '@/api/publicReel';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUsePublicReel = vi.fn<(h: string) => PublicReelState>();
const mockReducedRef = { current: false };

vi.mock('@/api/publicReel', () => ({
  usePublicReel: (handle: string) => mockUsePublicReel(handle),
}));

vi.mock('@/reel/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => mockReducedRef.current,
}));

vi.mock('@/reel/Reel', () => ({ Reel: () => <div data-testid="reel" /> }));
vi.mock('@/reel/ReducedMotionReel', () => ({
  ReducedMotionReel: () => <div data-testid="reduced-reel" />,
}));
vi.mock('@/reel/OrbitReel', () => ({ OrbitReel: () => <div data-testid="orbit" /> }));
vi.mock('@/reel/GlobeReel', () => ({ GlobeReel: () => <div data-testid="globe" /> }));
vi.mock('@/reel/OrbitReducedMotionReel', () => ({
  OrbitReducedMotionReel: () => <div data-testid="orbit-reduced" />,
}));
vi.mock('@/reel/GlobeReducedMotionReel', () => ({
  GlobeReducedMotionReel: () => <div data-testid="globe-reduced" />,
}));

const { HandleReelRoute } = await import('./HandleReelRoute');
const { NotFoundHandleRoute } = await import('./NotFoundHandleRoute');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function city(id: string, lat = 35, lng = 135.7): CityDTO {
  return {
    id,
    userId: 'u1',
    orderIndex: 0,
    name: id.toUpperCase(),
    tripLabel: null,
    lat,
    lng,
    zoom: 14,
    pitch: 60,
    bearing: 0,
    arrivedAt: '2026-04-01T00:00:00.000Z',
    caption: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  };
}

function photo(id: string, cityId: string, order = 0): PublicReelPhotoDTO {
  return {
    id,
    cityId,
    masterUrl: `https://oci.test/master/${id}.jpg`,
    thumbUrl: `https://oci.test/thumb/${id}.jpg`,
    orderIndex: order,
  };
}

function renderWithHandle(handle: string) {
  return render(
    <MemoryRouter initialEntries={[`/u/${handle}`]}>
      <Routes>
        <Route path="/u/:handle" element={<HandleReelRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HandleReelRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReducedRef.current = false;
  });

  afterEach(() => {
    cleanup();
  });

  it('loading: renders skeleton (no orbit/globe/reel)', () => {
    mockUsePublicReel.mockReturnValue({ kind: 'loading' });
    renderWithHandle('bryan');
    expect(screen.queryByTestId('orbit')).toBeNull();
    expect(screen.queryByTestId('globe')).toBeNull();
    expect(screen.queryByTestId('reel')).toBeNull();
  });

  it('not_found: renders NotFoundHandleRoute with the handle param', () => {
    mockUsePublicReel.mockReturnValue({ kind: 'not_found' });
    renderWithHandle('asdf');
    expect(screen.getByText('No reel at @asdf')).toBeTruthy();
  });

  it('error: renders generic error UI', () => {
    mockUsePublicReel.mockReturnValue({ kind: 'error', error: new Error('boom') });
    renderWithHandle('bryan');
    expect(screen.getByText(/Couldn.t load this reel/)).toBeTruthy();
  });

  it('ok + 0 cities + motion: renders GlobeReel', () => {
    mockReducedRef.current = false;
    mockUsePublicReel.mockReturnValue({
      kind: 'ok',
      data: { user: { handle: 'bryan', displayName: null }, cities: [], photos: [] },
    });
    renderWithHandle('bryan');
    expect(screen.getByTestId('globe')).toBeTruthy();
    expect(screen.queryByTestId('orbit')).toBeNull();
  });

  it('ok + 0 cities + reduced: renders GlobeReducedMotionReel', () => {
    mockReducedRef.current = true;
    mockUsePublicReel.mockReturnValue({
      kind: 'ok',
      data: { user: { handle: 'bryan', displayName: null }, cities: [], photos: [] },
    });
    renderWithHandle('bryan');
    expect(screen.getByTestId('globe-reduced')).toBeTruthy();
    expect(screen.queryByTestId('globe')).toBeNull();
  });

  it('ok + 1 city + motion: renders OrbitReel', () => {
    mockReducedRef.current = false;
    const c = city('c1');
    mockUsePublicReel.mockReturnValue({
      kind: 'ok',
      data: {
        user: { handle: 'bryan', displayName: null },
        cities: [c],
        photos: [photo('p1', 'c1')],
      },
    });
    renderWithHandle('bryan');
    expect(screen.getByTestId('orbit')).toBeTruthy();
    expect(screen.queryByTestId('orbit-reduced')).toBeNull();
  });

  it('ok + 1 city + reduced: renders OrbitReducedMotionReel', () => {
    mockReducedRef.current = true;
    const c = city('c1');
    mockUsePublicReel.mockReturnValue({
      kind: 'ok',
      data: {
        user: { handle: 'bryan', displayName: null },
        cities: [c],
        photos: [photo('p1', 'c1')],
      },
    });
    renderWithHandle('bryan');
    expect(screen.getByTestId('orbit-reduced')).toBeTruthy();
    expect(screen.queryByTestId('orbit')).toBeNull();
  });

  it('ok + 3 cities + motion: renders multi-chapter Reel', () => {
    mockReducedRef.current = false;
    mockUsePublicReel.mockReturnValue({
      kind: 'ok',
      data: {
        user: { handle: 'bryan', displayName: null },
        cities: [city('c1', 35, 135), city('c2', 40, 140), city('c3', 45, 145)],
        photos: [],
      },
    });
    renderWithHandle('bryan');
    expect(screen.getByTestId('reel')).toBeTruthy();
    expect(screen.queryByTestId('reduced-reel')).toBeNull();
  });

  it('ok + 3 cities + reduced: renders ReducedMotionReel', () => {
    mockReducedRef.current = true;
    mockUsePublicReel.mockReturnValue({
      kind: 'ok',
      data: {
        user: { handle: 'bryan', displayName: null },
        cities: [city('c1', 35, 135), city('c2', 40, 140), city('c3', 45, 145)],
        photos: [],
      },
    });
    renderWithHandle('bryan');
    expect(screen.getByTestId('reduced-reel')).toBeTruthy();
    expect(screen.queryByTestId('reel')).toBeNull();
  });

  it('document.title is set to @<handle> — Timeline on mount and restored on unmount', () => {
    mockUsePublicReel.mockReturnValue({ kind: 'loading' });
    const before = document.title;
    const { unmount } = renderWithHandle('bryan');
    expect(document.title).toBe('@bryan — Timeline');
    unmount();
    expect(document.title).toBe(before);
  });
});

describe('NotFoundHandleRoute', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the literal copy "No reel at @<handle>" with the handle interpolated', () => {
    render(
      <MemoryRouter>
        <NotFoundHandleRoute handle="asdf" />
      </MemoryRouter>,
    );
    expect(screen.getByText('No reel at @asdf')).toBeTruthy();
  });

  it('has a link back to /', () => {
    render(
      <MemoryRouter>
        <NotFoundHandleRoute handle="asdf" />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /Back to home/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/');
  });
});
