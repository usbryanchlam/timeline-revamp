import type { CityDTO } from '@/types/city';
import type { CityChapter } from '@/types/reel';

// cityToChapter: pure mapper from server DTO → reel-ready CityChapter.
//
// LOAD-BEARING: `center` is `[lng, lat]` (longitude FIRST). This is the
// GeoJSON / MapLibre convention — flyTo({ center }) expects [lng, lat].
// Swapping these silently teleports cities to wrong continents (e.g. NYC's
// (-74, 40) becomes (40, -74), somewhere in the Indian Ocean).
//
// Defaults documented:
// - caption: '' when null (CityChapter.caption is non-nullable string)
// - country: '' (DB schema has no country column in v1; the reel UI may
//   upgrade to a real value in a later phase)
// - photos: [] (photo CRUD is a future phase; v1 ships chapters without)
//
// Pure: returns a fresh object every call; never mutates input.
export function cityToChapter(c: CityDTO): CityChapter {
  return {
    id: c.id,
    name: c.name,
    country: '',
    center: [c.lng, c.lat] as const,
    zoom: c.zoom,
    pitch: c.pitch,
    bearing: c.bearing,
    arrivedAt: c.arrivedAt,
    caption: c.caption ?? '',
    photos: [],
  };
}

// citiesToChapters: maps an ordered list of CityDTOs to CityChapters.
// Preserves input order (the server already sorts by order_index, so the
// mapper's job is purely structural — it must NOT re-sort).
export function citiesToChapters(
  cs: readonly CityDTO[],
): readonly CityChapter[] {
  return cs.map(cityToChapter);
}
