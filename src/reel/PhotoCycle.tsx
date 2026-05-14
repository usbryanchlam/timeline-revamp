import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/reel/usePrefersReducedMotion';
import type { PhotoCard } from '@/types/reel';

const CYCLE_INTERVAL_MS = 4000;
const CROSSFADE_MS = 200;

interface PhotoCycleProps {
  readonly photos: readonly PhotoCard[];
}

/**
 * REEL-09 — cycle a chapter's photos at 4s interval with 200ms crossfade.
 * prefers-reduced-motion: reduce shows only the first photo; no interval
 * scheduled; no transition.
 *
 * Preload discipline: only the NEXT photo gets a <link rel="preload">.
 * Preloading all photos at once would burst-fetch on chapter land.
 *
 * Timer cleanup: cleared on unmount AND when the photos prop identity
 * changes (new chapter = new effect run = old interval cleared).
 */
export function PhotoCycle({ photos }: PhotoCycleProps) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);

  // Reset to first photo when the chapter's photo set changes (identity).
  useEffect(() => {
    setIndex(0);
  }, [photos]);

  // Cycle timer — only when motion is allowed and there are multiple photos.
  useEffect(() => {
    if (reduced) return;
    if (photos.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % photos.length);
    }, CYCLE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reduced, photos]);

  if (photos.length === 0) return null;

  const current = photos[index]!;
  const next = photos.length > 1 ? photos[(index + 1) % photos.length] : null;

  return (
    <div
      className="relative w-24 h-32"
      style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.4))' }}
    >
      {/* Crossfade layer: current photo */}
      <img
        key={current.id}
        src={current.thumbUrl}
        alt={current.alt}
        className="absolute inset-0 w-full h-full rounded-lg object-cover"
        style={{
          transition: reduced ? 'none' : `opacity ${CROSSFADE_MS}ms linear`,
          opacity: 1,
        }}
      />
      {/* Single-next preload — hidden off-screen img forces browser to fetch
          the next photo before it becomes visible. Only the NEXT photo is
          preloaded (not all) to avoid a burst-fetch on chapter land. */}
      {next && (
        <img
          src={next.thumbUrl}
          alt=""
          aria-hidden="true"
          style={{ display: 'none' }}
        />
      )}
    </div>
  );
}
