// Shared reel timing constants. Single source of truth so PhotoCycle and
// useGestureMachine cannot drift apart silently — they coordinate by reading
// the same number.

/** ms a chapter dwells in IDLE auto-play before the camera flies away. */
export const AUTOPLAY_DWELL_MS = 4500 as const;

/** Photo crossfade duration inside a chapter. */
export const CROSSFADE_MS = 200 as const;

/** Floor on per-photo display time. Below this, the crossfade dominates and
 *  the photo barely registers visually. With 6+ photos in a chapter at the
 *  current 4500ms dwell, the dynamic divide hits the floor — later photos
 *  wait for the user's next visit to that chapter. */
export const MIN_CYCLE_INTERVAL_MS = 800 as const;

/**
 * Per-photo cycle interval given N photos in a chapter and a dwell budget.
 * Each photo gets an equal slice of the dwell, clamped at MIN_CYCLE_INTERVAL_MS
 * so a 10-photo chapter doesn't flash photos faster than the crossfade.
 *
 * Returns 0 for N <= 1 (caller should skip scheduling the interval).
 */
export function cycleIntervalForPhotoCount(
  photoCount: number,
  dwellMs: number = AUTOPLAY_DWELL_MS,
): number {
  if (photoCount <= 1) return 0;
  const ideal = Math.floor(dwellMs / photoCount);
  return Math.max(MIN_CYCLE_INTERVAL_MS, ideal);
}
