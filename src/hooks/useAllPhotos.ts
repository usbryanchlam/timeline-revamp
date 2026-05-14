import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/auth/useApi';
import { listPhotos } from '@/api/photos';
import type { CityDTO } from '@/types/city';
import type { PhotoCard } from '@/types/reel';

/**
 * Fan-out: for each city in `cities`, GET /api/cities/:id/photos.
 * Returns ReadonlyMap<cityId, readonly PhotoCard[]>.
 *
 * Implementation notes:
 * - One round-trip per city. With 10 cities this is 10 requests; in W12
 *   we may add a /api/photos?cityIds=... batch endpoint. For now, the
 *   browser parallelizes; the network tab will show a fan-out burst on
 *   first reel load.
 * - Errors per city are caught and the city contributes an empty array.
 *   We never want a single failed city to break the entire reel.
 * - reqIdRef sentinel mirrors useCitiesQuery's unmount discipline.
 */
export function useAllPhotos(
  cities: readonly CityDTO[] | undefined,
): ReadonlyMap<string, readonly PhotoCard[]> {
  const api = useApi();
  const [map, setMap] = useState<ReadonlyMap<string, readonly PhotoCard[]>>(() => new Map());
  const reqIdRef = useRef(0);

  // Sentinel -1 on unmount — any in-flight batch discards its result.
  useEffect(() => {
    return () => {
      reqIdRef.current = -1;
    };
  }, []);

  useEffect(() => {
    if (!cities) return;
    const myId = ++reqIdRef.current;
    void (async () => {
      const entries = await Promise.all(
        cities.map(async (c) => {
          try {
            const dtos = await listPhotos(api, c.id);
            const cards: PhotoCard[] = dtos.map((d) => ({
              id: d.id,
              masterUrl: d.masterUrl,
              thumbUrl: d.thumbUrl,
              alt: '',          // A11Y-05 — empty alt when no caption
              orderIndex: d.orderIndex,
            }));
            return [c.id, cards] as const;
          } catch {
            return [c.id, [] as readonly PhotoCard[]] as const;
          }
        }),
      );
      if (myId !== reqIdRef.current) return;
      setMap(new Map(entries));
    })();
  }, [api, cities]);

  return map;
}
