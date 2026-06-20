import { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { CityDTO } from '@/types/city';
import type { PublicReelPhotoDTO } from '@/api/publicReel';
import type { CityChapter, PhotoCard } from '@/types/reel';
import { useBearingOrbit } from '@/reel/useBearingOrbit';
import { ChapterOverlay } from '@/reel/ChapterOverlay';
import { CTAPill } from '@/reel/CTAPill';
import { STYLE_URL } from '@/reel/mapStyle';
import { FpsBadge } from '@/dev/FpsBadge';

export interface OrbitReelProps {
  readonly city: CityDTO;
  readonly photos: readonly PublicReelPhotoDTO[];
}

// D-12: continuous 360° orbit at 45°/s = 8s/revolution.
// D-13: no inter-chapter flyTo (only one chapter). PhotoCycle inside
// ChapterOverlay handles cycling — timer-driven, transition-independent.
const DEGREES_PER_SECOND = 45;

function photosToCards(photos: readonly PublicReelPhotoDTO[]): readonly PhotoCard[] {
  return photos.map((p) => ({
    id: p.id,
    masterUrl: p.masterUrl,
    thumbUrl: p.thumbUrl,
    alt: '',
    orderIndex: p.orderIndex,
  }));
}

export function OrbitReel({ city, photos }: OrbitReelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const chapter: CityChapter = useMemo(
    () => ({
      id: city.id,
      name: city.name,
      country: '',
      center: [city.lng, city.lat],
      zoom: 14,
      pitch: 60,
      bearing: 0,
      arrivedAt: city.arrivedAt,
      caption: city.caption ?? '',
      photos: photosToCards(photos),
    }),
    [city, photos],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [city.lng, city.lat],
      zoom: 14,
      pitch: 60,
      bearing: 0,
      interactive: false,
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // City lng/lat are stable for the route's lifetime (one city). Re-init on
    // change is fine but unnecessary; lock to mount-only to match MapCanvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useBearingOrbit(mapRef, DEGREES_PER_SECOND, true);

  return (
    <div className="reel-root relative h-[100dvh] bg-bg-map">
      <div ref={containerRef} className="absolute inset-0" />
      <ChapterOverlay chapter={chapter} chapterNumber={1} totalChapters={1} />
      <CTAPill />
      {/* DEV-only FPS readout for the 8s orbit (closes Phase 7 UAT #1). The
          literal `import.meta.env.DEV` is replaced with `false` by Vite at
          prod build time, and Rollup's minifier dead-codes the whole branch
          including the FpsBadge import binding — verified by
          `bun run verify:tree-shake`. */}
      {import.meta.env.DEV && <FpsBadge />}
    </div>
  );
}
