import { cityToChapter } from '@/data/cityToChapter';
import type { ChapterGroup } from '@/reel/groupChapters';
import type { CityChapter, PhotoCard } from '@/types/reel';

/**
 * Merge real photos into the chapter pipeline produced by groupChapters.
 *
 * Adjacent-dedup behavior: groupChapters collapses byte-equal lat/lng
 * adjacent cities into one ChapterGroup. chaptersWithPhotos preserves
 * that grouping — photos cycle WITHIN one chapter, never across.
 * If users want each visit to surface separately, that's a future
 * "show as distinct trip" feature; out of scope for REEL-09.
 *
 * Photos are sorted by orderIndex ascending within each city; cities
 * appear in members[] order (which is roadmap order from groupChapters).
 *
 * Immutable: every input is treated as read-only; output is fresh arrays.
 */
export function chaptersWithPhotos(
  groups: readonly ChapterGroup[],
  photosByCityId: ReadonlyMap<string, readonly PhotoCard[]>,
): readonly CityChapter[] {
  return groups.map((g) => {
    const base = cityToChapter(g.members[0]!);
    const photos = g.members.flatMap((m) => {
      const list = photosByCityId.get(m.id) ?? [];
      // Sort by orderIndex without mutating the source readonly array.
      return list.slice().sort((a, b) => a.orderIndex - b.orderIndex);
    });
    return { ...base, photos };
  });
}
