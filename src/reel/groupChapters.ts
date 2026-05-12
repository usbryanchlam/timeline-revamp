import type { CityDTO } from '@/types/city';

export interface ChapterGroup {
  readonly id: string;
  readonly center: readonly [number, number]; // [lng, lat], MapLibre order
  readonly members: readonly CityDTO[];
}

/**
 * REEL-09: collapse ADJACENT cities with identical (lat, lng) into one
 * chapter group. Adjacency is required — [A, B, A] produces three groups,
 * not two — because REEL-09 specifies "two adjacent chapters with identical
 * coordinates collapse." Non-adjacent same-coord cities are still distinct
 * trips; the camera should re-arrive even if to the same geographic point.
 *
 * Equality is exact. We do NOT round to N decimals or use a tolerance —
 * cities created by reverse-geocoding the same map click WILL produce
 * byte-equal coordinates; cities created weeks apart from manually-typed
 * coords likely won't, and that's fine.
 *
 * NOTE — empty country (v1 limitation): API-driven CityDTOs have
 * country: '' because the DB schema (server/db/schema.ts) has no
 * `country` column; cityToChapter defaults the field to ''. As a result,
 * ChapterOverlay's country subtitle renders blank for /app/-reel chapters
 * (seeded `/` and `/u/:handle` cities still have country populated from
 * src/data/seeded-cities.ts). If subtitle emptiness becomes a UX issue,
 * add a `country` column in a future phase and route it through
 * cityToChapter; the DB schema is the source of truth.
 */
export function groupChapters(cities: readonly CityDTO[]): readonly ChapterGroup[] {
  if (cities.length === 0) return [];

  const groups: ChapterGroup[] = [];
  let currentMembers: CityDTO[] = [cities[0]!];

  for (let i = 1; i < cities.length; i++) {
    const prev = currentMembers[currentMembers.length - 1]!;
    const curr = cities[i]!;
    if (curr.lat === prev.lat && curr.lng === prev.lng) {
      currentMembers.push(curr);
    } else {
      const head = currentMembers[0]!;
      groups.push({
        id: head.id,
        center: [head.lng, head.lat] as const,
        members: currentMembers,
      });
      currentMembers = [curr];
    }
  }

  // Flush the final run.
  const head = currentMembers[0]!;
  groups.push({
    id: head.id,
    center: [head.lng, head.lat] as const,
    members: currentMembers,
  });

  return groups;
}
