// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { CityDTO } from '@/types/city';
import type { PhotoDTO } from '@/api/photos';

// ---------------------------------------------------------------------------
// Mocks — control listPhotos behavior per test
// ---------------------------------------------------------------------------

const mockApiFn = vi.fn();

vi.mock('@/auth/useApi', () => ({
  useApi: () => mockApiFn,
}));

const mockListPhotos = vi.fn<(api: unknown, cityId: string) => Promise<readonly PhotoDTO[]>>();

vi.mock('@/api/photos', () => ({
  listPhotos: (...args: Parameters<typeof mockListPhotos>) => mockListPhotos(...args),
}));

// ---------------------------------------------------------------------------
// Import hook AFTER mocks are set up
// ---------------------------------------------------------------------------

const { useAllPhotos } = await import('@/hooks/useAllPhotos');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCity(id: string): CityDTO {
  return {
    id,
    userId: 'user-1',
    orderIndex: 0,
    name: id,
    tripLabel: null,
    lat: 0,
    lng: 0,
    zoom: 10,
    pitch: 45,
    bearing: 0,
    arrivedAt: '2026-01-01T00:00:00.000Z',
    caption: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makePhotoDTO(id: string, orderIndex = 0): PhotoDTO {
  return {
    id,
    masterUrl: `https://oci.test/master/${id}.jpg`,
    thumbUrl: `https://oci.test/thumb/${id}.jpg`,
    orderIndex,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAllPhotos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPhotos.mockReset();
  });

  it('returns an empty Map when cities array is empty', async () => {
    const { result } = renderHook(() => useAllPhotos([]));
    // Empty cities — no listPhotos call needed; map should start empty
    await waitFor(() => {
      expect(result.current.size).toBe(0);
    });
    expect(mockListPhotos).not.toHaveBeenCalled();
  });

  it('returns an empty Map when cities is undefined', () => {
    const { result } = renderHook(() => useAllPhotos(undefined));
    expect(result.current.size).toBe(0);
    expect(mockListPhotos).not.toHaveBeenCalled();
  });

  it('calls listPhotos once per city and aggregates results into Map', async () => {
    const cities = [makeCity('city-a'), makeCity('city-b'), makeCity('city-c')];
    const photoA = makePhotoDTO('photo-a', 0);
    const photoB = makePhotoDTO('photo-b', 0);

    mockListPhotos.mockImplementation(async (_api, cityId) => {
      if (cityId === 'city-a') return [photoA];
      if (cityId === 'city-b') return [photoB];
      return [];
    });

    const { result } = renderHook(() => useAllPhotos(cities));

    await waitFor(() => {
      expect(result.current.size).toBe(3);
    });

    expect(mockListPhotos).toHaveBeenCalledTimes(3);
    expect(result.current.get('city-a')).toHaveLength(1);
    expect(result.current.get('city-a')![0]!.id).toBe('photo-a');
    expect(result.current.get('city-b')![0]!.id).toBe('photo-b');
    expect(result.current.get('city-c')).toHaveLength(0);
  });

  it('swallows errors per city — failed city contributes empty array', async () => {
    const cities = [makeCity('city-ok'), makeCity('city-err')];
    const photo = makePhotoDTO('photo-ok', 0);

    mockListPhotos.mockImplementation(async (_api, cityId) => {
      if (cityId === 'city-ok') return [photo];
      throw new Error('network failure');
    });

    const { result } = renderHook(() => useAllPhotos(cities));

    await waitFor(() => {
      expect(result.current.size).toBe(2);
    });

    expect(result.current.get('city-ok')).toHaveLength(1);
    expect(result.current.get('city-err')).toHaveLength(0);
  });

  it('stale-response guard: unmount sentinel prevents state updates after teardown', async () => {
    let resolveFirst!: (v: readonly PhotoDTO[]) => void;
    const firstCallPromise = new Promise<readonly PhotoDTO[]>((res) => {
      resolveFirst = res;
    });

    mockListPhotos.mockReturnValueOnce(firstCallPromise);

    const cities = [makeCity('city-x')];
    const { result, unmount } = renderHook(() => useAllPhotos(cities));

    // Unmount before the promise resolves
    unmount();

    // Now resolve — should NOT update state (reqIdRef becomes -1 on unmount)
    resolveFirst([makePhotoDTO('photo-x', 0)]);

    // Give microtasks a chance to run
    await new Promise((res) => setTimeout(res, 10));

    // After unmount, the returned map should still be empty (no update happened)
    expect(result.current.size).toBe(0);
  });
});
