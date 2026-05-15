import { useEffect } from 'react';
import { useParams } from 'react-router';
import { usePublicReel, type PublicReelDTO, type PublicReelPhotoDTO } from '@/api/publicReel';
import { groupChapters } from '@/reel/groupChapters';
import { chaptersWithPhotos } from '@/reel/chaptersWithPhotos';
import { Reel } from '@/reel/Reel';
import { ReducedMotionReel } from '@/reel/ReducedMotionReel';
import { OrbitReel } from '@/reel/OrbitReel';
import { GlobeReel } from '@/reel/GlobeReel';
import { OrbitReducedMotionReel } from '@/reel/OrbitReducedMotionReel';
import { GlobeReducedMotionReel } from '@/reel/GlobeReducedMotionReel';
import { usePrefersReducedMotion } from '@/reel/usePrefersReducedMotion';
import { NotFoundHandleRoute } from '@/routes/NotFoundHandleRoute';
import type { PhotoCard } from '@/types/reel';

// PUBLIC-01/02/03 + REEL-08 (Phase 7 D-10/11). Public reel surface, no auth.
// Branches on cities.length to render the right cinematic variant; layer two
// is the reduced-motion swap on each variant. Title is static per D-22; OG
// image (PUBLIC-05) is deferred to Phase 12.

export function HandleReelRoute() {
  const { handle = '' } = useParams<{ handle: string }>();
  const reduced = usePrefersReducedMotion();
  const result = usePublicReel(handle);

  useEffect(() => {
    const previous = document.title;
    document.title = `@${handle} — Timeline`;
    return () => {
      document.title = previous;
    };
  }, [handle]);

  if (result.kind === 'loading') {
    return <div className="h-[100dvh] bg-bg-map" />;
  }
  if (result.kind === 'not_found') {
    return <NotFoundHandleRoute handle={handle} />;
  }
  if (result.kind === 'error') {
    return (
      <div className="h-[100dvh] bg-bg flex items-center justify-center p-6">
        <p className="text-ink">Couldn&apos;t load this reel.</p>
      </div>
    );
  }
  return <HandleReelContent data={result.data} reduced={reduced} />;
}

// Inner content component: Phase 6 06-04 SUMMARY established this rules-of-
// hooks pattern. Hooks called inside the chapter pipeline helpers stay
// unconditional because this component only mounts on the 'ok' branch.
function HandleReelContent({
  data,
  reduced,
}: {
  readonly data: PublicReelDTO;
  readonly reduced: boolean;
}) {
  const { cities, photos } = data;

  if (cities.length === 0) {
    return reduced ? <GlobeReducedMotionReel /> : <GlobeReel />;
  }
  if (cities.length === 1) {
    const city = cities[0]!;
    const cityPhotos = photos.filter((p) => p.cityId === city.id);
    return reduced ? (
      <OrbitReducedMotionReel city={city} photos={cityPhotos} />
    ) : (
      <OrbitReel city={city} photos={cityPhotos} />
    );
  }
  // >=2 cities → existing multi-chapter Reel.
  const photosByCityId = groupPhotosByCityId(photos);
  const groups = groupChapters([...cities]);
  const chapters = chaptersWithPhotos(groups, photosByCityId);
  return reduced ? <ReducedMotionReel chapters={chapters} /> : <Reel chapters={chapters} />;
}

function groupPhotosByCityId(
  photos: readonly PublicReelPhotoDTO[],
): ReadonlyMap<string, readonly PhotoCard[]> {
  const map = new Map<string, PhotoCard[]>();
  for (const p of photos) {
    const card: PhotoCard = {
      id: p.id,
      masterUrl: p.masterUrl,
      thumbUrl: p.thumbUrl,
      alt: '',
      orderIndex: p.orderIndex,
    };
    const arr = map.get(p.cityId);
    if (arr) arr.push(card);
    else map.set(p.cityId, [card]);
  }
  for (const [k, arr] of map) {
    map.set(k, [...arr].sort((a, b) => a.orderIndex - b.orderIndex));
  }
  return map;
}
