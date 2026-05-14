import { chaptersWithPhotos } from '@/reel/chaptersWithPhotos';
import type { ChapterGroup } from '@/reel/groupChapters';
import type { PhotoCard } from '@/types/reel';
import type { CityDTO } from '@/types/city';

function makeCity(id: string, lat = 0, lng = 0): CityDTO {
  return {
    id,
    userId: 'user-1',
    orderIndex: 0,
    name: id,
    tripLabel: null,
    lat,
    lng,
    zoom: 10,
    pitch: 45,
    bearing: 0,
    arrivedAt: '2026-01-01T00:00:00.000Z',
    caption: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeGroup(id: string, members: CityDTO[]): ChapterGroup {
  return { id, center: [members[0]!.lng, members[0]!.lat], members };
}

function makePhoto(id: string, orderIndex = 0): PhotoCard {
  return {
    id,
    masterUrl: `https://oci.test/master/${id}.jpg`,
    thumbUrl: `https://oci.test/thumb/${id}.jpg`,
    alt: '',
    orderIndex,
  };
}

describe('chaptersWithPhotos', () => {
  it('returns empty array for empty groups', () => {
    const result = chaptersWithPhotos([], new Map());
    expect(result).toEqual([]);
  });

  it('chapter has empty photos array when cityId not in map', () => {
    const city = makeCity('city-a', 35.0, 139.0);
    const group = makeGroup('city-a', [city]);
    const result = chaptersWithPhotos([group], new Map());
    expect(result).toHaveLength(1);
    expect(result[0]!.photos).toEqual([]);
  });

  it('single-member group merges photos in orderIndex order', () => {
    const city = makeCity('city-a', 35.0, 139.0);
    const group = makeGroup('city-a', [city]);
    const p1 = makePhoto('p1', 1);
    const p2 = makePhoto('p2', 0);
    const photoMap = new Map([['city-a', [p1, p2]]]);
    const result = chaptersWithPhotos([group], photoMap);
    expect(result).toHaveLength(1);
    // Should be sorted by orderIndex ascending: p2 (0), p1 (1)
    expect(result[0]!.photos).toHaveLength(2);
    expect(result[0]!.photos[0]!.id).toBe('p2');
    expect(result[0]!.photos[1]!.id).toBe('p1');
  });

  it('multi-member adjacent-dedup group concatenates photos across members', () => {
    const cityA = makeCity('city-a', 35.0, 139.0);
    const cityB = makeCity('city-b', 35.0, 139.0);
    const cityC = makeCity('city-c', 35.0, 139.0);
    const group = makeGroup('city-a', [cityA, cityB, cityC]);
    const pA = makePhoto('pA', 0);
    const pB1 = makePhoto('pB1', 0);
    const pB2 = makePhoto('pB2', 1);
    const photoMap = new Map([
      ['city-a', [pA]],
      ['city-b', [pB1, pB2]],
      // city-c intentionally absent
    ]);
    const result = chaptersWithPhotos([group], photoMap);
    expect(result).toHaveLength(1);
    // city-a contributes pA, city-b contributes pB1+pB2 sorted, city-c contributes []
    expect(result[0]!.photos).toHaveLength(3);
    expect(result[0]!.photos[0]!.id).toBe('pA');
    expect(result[0]!.photos[1]!.id).toBe('pB1');
    expect(result[0]!.photos[2]!.id).toBe('pB2');
  });

  it('missing member contributes zero photos without breaking siblings', () => {
    const cityA = makeCity('city-a', 35.0, 139.0);
    const cityB = makeCity('city-b', 35.0, 139.0);
    const group = makeGroup('city-a', [cityA, cityB]);
    const pA = makePhoto('pA', 0);
    const photoMap = new Map([['city-a', [pA]]]);
    // city-b not in map — should be treated as []
    const result = chaptersWithPhotos([group], photoMap);
    expect(result).toHaveLength(1);
    expect(result[0]!.photos).toHaveLength(1);
    expect(result[0]!.photos[0]!.id).toBe('pA');
  });

  it('does not mutate the input ChapterGroup', () => {
    const a = makeCity('a');
    const g = makeGroup('a', [a]);
    const snapshot = JSON.parse(JSON.stringify(g)) as ChapterGroup;
    chaptersWithPhotos([g], new Map([['a', [makePhoto('p1')]]]));
    expect(g).toEqual(snapshot);
  });

  it('sorts photos within a city by orderIndex ascending', () => {
    const city = makeCity('city-a', 35.0, 139.0);
    const group = makeGroup('city-a', [city]);
    const photos = [makePhoto('c', 2), makePhoto('a', 0), makePhoto('b', 1)];
    const photoMap = new Map([['city-a', photos]]);
    const result = chaptersWithPhotos([group], photoMap);
    expect(result[0]!.photos.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('multiple groups produce multiple chapters with their respective photos', () => {
    const city1 = makeCity('city-1', 1.0, 1.0);
    const city2 = makeCity('city-2', 2.0, 2.0);
    const group1 = makeGroup('city-1', [city1]);
    const group2 = makeGroup('city-2', [city2]);
    const p1 = makePhoto('p1', 0);
    const p2 = makePhoto('p2', 0);
    const photoMap = new Map([
      ['city-1', [p1]],
      ['city-2', [p2]],
    ]);
    const result = chaptersWithPhotos([group1, group2], photoMap);
    expect(result).toHaveLength(2);
    expect(result[0]!.photos[0]!.id).toBe('p1');
    expect(result[1]!.photos[0]!.id).toBe('p2');
  });
});
