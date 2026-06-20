import type { CityDTO } from '@/types/city';
import type { PublicReelPhotoDTO } from '@/api/publicReel';
import { CTAPill } from '@/reel/CTAPill';

// D-15: prefers-reduced-motion fallback for the 1-city orbit. No map, no
// motion — just a static photo stack. Acceptance criterion forbids any
// reference to the map library here so the no-WebGL contract is grep-locked.

export interface OrbitReducedMotionReelProps {
  readonly city: CityDTO;
  readonly photos: readonly PublicReelPhotoDTO[];
}

export function OrbitReducedMotionReel({ city, photos }: OrbitReducedMotionReelProps) {
  return (
    <section
      className="reel-static-root bg-bg text-ink min-h-dvh"
      role="region"
      aria-label="Single city travel reel (reduced motion)"
    >
      <header className="p-6 space-y-2">
        <h1 className="text-display text-2xl">{city.name}</h1>
        {city.caption && <p className="text-ink-mute">{city.caption}</p>}
      </header>
      {photos.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 p-6">
          {photos.map((p) => (
            <li key={p.id}>
              <img src={p.thumbUrl} alt="" loading="lazy" className="w-full rounded-lg" />
            </li>
          ))}
        </ul>
      )}
      <CTAPill />
    </section>
  );
}
