import { useEffect, useMemo, useState } from 'react';
import { usePrefersReducedMotion } from '@/reel/usePrefersReducedMotion';
import { CROSSFADE_MS, cycleIntervalForPhotoCount } from '@/reel/timing';
import type { PhotoCard } from '@/types/reel';

interface PhotoCycleProps {
  readonly photos: readonly PhotoCard[];
  /** Override dwell budget (ms). Defaults to AUTOPLAY_DWELL_MS. Public reel
   *  routes with different timing can pass their own value. */
  readonly dwellMs?: number;
}

/**
 * REEL-09 — cycle a chapter's photos within the chapter's dwell window.
 *
 * Each photo gets an equal slice of the dwell time (with a floor so the
 * crossfade never dominates). With dwell=4500ms:
 *   2 photos → 2250ms each
 *   3 photos → 1500ms each
 *   4 photos → 1125ms each
 *   5 photos →  900ms each
 *   6+ photos → 800ms each (floor; last photos wait for next visit)
 *
 * prefers-reduced-motion: reduce shows only the first photo; no interval
 * scheduled; no transition.
 *
 * Preload discipline: only the NEXT photo is preloaded (hidden <img>) — not
 * the entire set — to avoid a burst-fetch on chapter land.
 *
 * Timer cleanup: cleared on unmount AND when the photos prop identity
 * changes (new chapter = new effect run = old interval cleared).
 */
export function PhotoCycle({ photos, dwellMs }: PhotoCycleProps) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);

  const cycleMs = useMemo(
    () => cycleIntervalForPhotoCount(photos.length, dwellMs),
    [photos.length, dwellMs],
  );

  // Reset to first photo when the chapter's photo set changes (identity).
  useEffect(() => {
    setIndex(0);
  }, [photos]);

  // Cycle timer — only when motion is allowed and there are multiple photos.
  useEffect(() => {
    if (reduced) return;
    if (cycleMs === 0) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % photos.length);
    }, cycleMs);
    return () => window.clearInterval(timer);
  }, [reduced, photos, cycleMs]);

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
