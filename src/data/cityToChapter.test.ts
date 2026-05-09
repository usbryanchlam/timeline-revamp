import { cityToChapter, citiesToChapters } from '@/data/cityToChapter';
import type { CityDTO } from '@/types/city';

function makeCity(overrides: Partial<CityDTO> = {}): CityDTO {
  return {
    id: 'city-1',
    userId: 'user-1',
    orderIndex: 0,
    name: 'New York',
    tripLabel: null,
    lat: 40.7128,
    lng: -74.006,
    zoom: 10,
    pitch: 45,
    bearing: 0,
    arrivedAt: '2024-01-15T12:00:00.000Z',
    caption: null,
    createdAt: '2024-01-15T12:00:00.000Z',
    updatedAt: '2024-01-15T12:00:00.000Z',
    ...overrides,
  };
}

describe('cityToChapter', () => {
  it('center is [lng, lat] in GeoJSON / MapLibre order (load-bearing)', () => {
    const dto = makeCity({ lng: -74.006, lat: 40.7128 });
    const chapter = cityToChapter(dto);
    expect(chapter.center[0]).toBe(-74.006); // lng FIRST
    expect(chapter.center[1]).toBe(40.7128); // lat SECOND
    // Defensive: swapping would put us at lat=-74 which is below -90 (impossible).
    expect(chapter.center[1]).toBeGreaterThanOrEqual(-90);
    expect(chapter.center[1]).toBeLessThanOrEqual(90);
  });

  it('null caption maps to empty string', () => {
    const dto = makeCity({ caption: null });
    expect(cityToChapter(dto).caption).toBe('');
  });

  it('non-null caption is preserved verbatim', () => {
    const dto = makeCity({ caption: 'Skyline at dusk' });
    expect(cityToChapter(dto).caption).toBe('Skyline at dusk');
  });

  it('country defaults to empty string (no DB column in v1)', () => {
    const dto = makeCity();
    expect(cityToChapter(dto).country).toBe('');
  });

  it('photos defaults to empty array', () => {
    const dto = makeCity();
    expect(cityToChapter(dto).photos).toEqual([]);
  });

  it('passes through arrivedAt as the original ISO string', () => {
    const iso = '2024-06-01T08:30:00.000Z';
    const dto = makeCity({ arrivedAt: iso });
    expect(cityToChapter(dto).arrivedAt).toBe(iso);
  });

  it('passes through camera fields (zoom, pitch, bearing)', () => {
    const dto = makeCity({ zoom: 12.5, pitch: 60, bearing: 30 });
    const chapter = cityToChapter(dto);
    expect(chapter.zoom).toBe(12.5);
    expect(chapter.pitch).toBe(60);
    expect(chapter.bearing).toBe(30);
  });

  it('does not mutate the input DTO', () => {
    const dto = makeCity({ caption: null });
    const snapshot = { ...dto };
    cityToChapter(dto);
    expect(dto).toEqual(snapshot);
  });
});

describe('citiesToChapters', () => {
  it('returns empty array for empty input', () => {
    expect(citiesToChapters([])).toEqual([]);
    expect(citiesToChapters([]).length).toBe(0);
  });

  it('preserves input order ([A, B, C] → [A, B, C])', () => {
    const a = makeCity({ id: 'a', name: 'A', orderIndex: 0 });
    const b = makeCity({ id: 'b', name: 'B', orderIndex: 1 });
    const c = makeCity({ id: 'c', name: 'C', orderIndex: 2 });
    const chapters = citiesToChapters([a, b, c]);
    expect(chapters.map((ch) => ch.id)).toEqual(['a', 'b', 'c']);
    expect(chapters.map((ch) => ch.name)).toEqual(['A', 'B', 'C']);
  });

  it('does NOT re-sort by orderIndex (trusts server ordering)', () => {
    // Even if the server sent them out of order (it won't, but the mapper
    // is a structural transform — sorting is the server's job).
    const out = makeCity({ id: 'x', orderIndex: 5 });
    const mid = makeCity({ id: 'y', orderIndex: 2 });
    const chapters = citiesToChapters([out, mid]);
    expect(chapters[0].id).toBe('x');
    expect(chapters[1].id).toBe('y');
  });

  it('does not mutate the input array', () => {
    const arr = [makeCity({ id: 'a' }), makeCity({ id: 'b' })];
    const snapshot = arr.map((c) => ({ ...c }));
    citiesToChapters(arr);
    expect(arr).toEqual(snapshot);
  });
});
