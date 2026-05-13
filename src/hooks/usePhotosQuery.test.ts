// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock @/auth/useApi before importing the hook
// ---------------------------------------------------------------------------

const mockApiFn = vi.fn();

vi.mock('@/auth/useApi', () => ({
  useApi: () => mockApiFn,
}));

// Mock @/api/photos — we control what listPhotos returns in each test
const mockListPhotos = vi.fn();

vi.mock('@/api/photos', () => ({
  listPhotos: (...args: unknown[]) => mockListPhotos(...args),
}));

// Import hook AFTER mocks are established
const { usePhotosQuery } = await import('./usePhotosQuery.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePhotosQuery', () => {
  it('returns { data: undefined } on first render before fetch resolves', () => {
    // Never resolves
    mockListPhotos.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => usePhotosQuery('city-1'));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it('data populates with PhotoDTO[] after fetch resolves', async () => {
    const photos = [
      { id: 'p1', masterUrl: 'https://example.com/master.jpg', thumbUrl: 'https://example.com/thumb.jpg', orderIndex: 0 },
    ];
    mockListPhotos.mockResolvedValue(photos);

    const { result } = renderHook(() => usePhotosQuery('city-1'));

    await waitFor(() => {
      expect(result.current.data).toEqual(photos);
    });
    expect(result.current.error).toBeNull();
  });

  it('error populates on fetch failure; data stays undefined', async () => {
    mockListPhotos.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePhotosQuery('city-1'));

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });
    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.data).toBeUndefined();
  });

  it('calling refetch() re-fetches and only the latest result lands in data', async () => {
    const firstPhotos = [
      { id: 'p1', masterUrl: 'https://example.com/master1.jpg', thumbUrl: 'https://example.com/thumb1.jpg', orderIndex: 0 },
    ];
    const secondPhotos = [
      { id: 'p2', masterUrl: 'https://example.com/master2.jpg', thumbUrl: 'https://example.com/thumb2.jpg', orderIndex: 0 },
    ];

    // First call (auto-fetch): resolves with firstPhotos
    // Second and third calls: we'll control ordering manually
    let resolveFirst!: (v: typeof firstPhotos) => void;
    let resolveSecond!: (v: typeof secondPhotos) => void;

    const firstPromise = new Promise<typeof firstPhotos>((r) => { resolveFirst = r; });
    const secondPromise = new Promise<typeof secondPhotos>((r) => { resolveSecond = r; });

    mockListPhotos
      .mockReturnValueOnce(firstPromise)   // auto-fetch on mount
      .mockReturnValueOnce(secondPromise); // first manual refetch

    const { result } = renderHook(() => usePhotosQuery('city-1'));

    // Trigger a refetch before the auto-fetch resolves (simulates racing requests)
    act(() => {
      void result.current.refetch();
    });

    // Resolve second before first — second wins (stale guard)
    resolveSecond(secondPhotos);
    await waitFor(() => {
      expect(result.current.data).toEqual(secondPhotos);
    });

    // Resolving first now should NOT overwrite the second result
    resolveFirst(firstPhotos);
    // Give a tick for any potential state update
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.data).toEqual(secondPhotos);
  });
});
