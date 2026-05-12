import { groupChapters } from '@/reel/groupChapters';
import type { CityDTO } from '@/types/city';

function makeCity(id: string, lat: number, lng: number): CityDTO {
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

describe('groupChapters', () => {
  it('returns empty array for empty input', () => {
    expect(groupChapters([])).toEqual([]);
  });

  it('single city → single group with one member', () => {
    const a = makeCity('a', 40.7128, -74.006);
    const result = groupChapters([a]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('a');
    expect(result[0]!.center).toEqual([-74.006, 40.7128]);
    expect(result[0]!.members).toHaveLength(1);
    expect(result[0]!.members[0]).toBe(a);
  });

  it('two adjacent cities with identical coords collapse into one group', () => {
    const a = makeCity('a', 35.6812, 139.7671);
    const b = makeCity('b', 35.6812, 139.7671);
    const result = groupChapters([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('a'); // first member's id
    expect(result[0]!.members).toHaveLength(2);
    expect(result[0]!.members[0]).toBe(a);
    expect(result[0]!.members[1]).toBe(b);
  });

  it('three adjacent cities with identical coords collapse into one group', () => {
    const a = makeCity('a', 48.8566, 2.3522);
    const b = makeCity('b', 48.8566, 2.3522);
    const c = makeCity('c', 48.8566, 2.3522);
    const result = groupChapters([a, b, c]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('a');
    expect(result[0]!.members).toHaveLength(3);
  });

  it('same coords but NON-adjacent [A, B, A] do NOT collapse (adjacency-only)', () => {
    const a1 = makeCity('a1', 35.6812, 139.7671);
    const b = makeCity('b', 51.5074, -0.1278);
    const a2 = makeCity('a2', 35.6812, 139.7671); // same coords as a1, but not adjacent
    const result = groupChapters([a1, b, a2]);
    expect(result).toHaveLength(3);
    expect(result.map((g) => g.id)).toEqual(['a1', 'b', 'a2']);
    expect(result.map((g) => g.members.length)).toEqual([1, 1, 1]);
  });

  it('near-but-not-equal coords (35.6812 vs 35.68120001) do NOT collapse (exact equality)', () => {
    const a = makeCity('a', 35.6812, 139.7671);
    const b = makeCity('b', 35.68120001, 139.7671);
    const result = groupChapters([a, b]);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('a');
    expect(result[1]!.id).toBe('b');
  });

  it('mixed [A, A, B, C, C, C, D] → 4 groups with member counts [2, 1, 3, 1]', () => {
    const a1 = makeCity('a1', 35.6812, 139.7671);
    const a2 = makeCity('a2', 35.6812, 139.7671);
    const b = makeCity('b', 51.5074, -0.1278);
    const c1 = makeCity('c1', 48.8566, 2.3522);
    const c2 = makeCity('c2', 48.8566, 2.3522);
    const c3 = makeCity('c3', 48.8566, 2.3522);
    const d = makeCity('d', 40.7128, -74.006);
    const result = groupChapters([a1, a2, b, c1, c2, c3, d]);
    expect(result).toHaveLength(4);
    expect(result.map((g) => g.members.length)).toEqual([2, 1, 3, 1]);
    expect(result.map((g) => g.id)).toEqual(['a1', 'b', 'c1', 'd']);
  });

  it('preserves input order across groups', () => {
    const a = makeCity('a', 1, 1);
    const b = makeCity('b', 2, 2);
    const c = makeCity('c', 3, 3);
    const d = makeCity('d', 4, 4);
    const result = groupChapters([a, b, c, d]);
    expect(result.map((g) => g.id)).toEqual(['a', 'b', 'c', 'd']);
    // And the inner member arrays must contain the cities in the same order as input.
    expect(result.flatMap((g) => g.members.map((m) => m.id))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('group.center is [lng, lat] in MapLibre/GeoJSON order (load-bearing)', () => {
    // NYC: lat=40.7128, lng=-74.006. Asymmetric — if order were swapped,
    // result[0].center[1] would be -74.006 which is outside the valid lat
    // range [-90, 90].
    const a = makeCity('a', 40.7128, -74.006);
    const result = groupChapters([a]);
    expect(result[0]!.center[0]).toBe(-74.006); // lng FIRST
    expect(result[0]!.center[1]).toBe(40.7128); // lat SECOND
    expect(result[0]!.center[1]).toBeGreaterThanOrEqual(-90);
    expect(result[0]!.center[1]).toBeLessThanOrEqual(90);
  });
});
