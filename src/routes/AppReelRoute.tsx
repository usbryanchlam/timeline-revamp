import { Reel } from '@/reel/Reel';
import { ReducedMotionReel } from '@/reel/ReducedMotionReel';
import { usePrefersReducedMotion } from '@/reel/usePrefersReducedMotion';

// Phase 3 stub: renders the same seeded reel as the public tree.
// Phase 9 will swap this for the logged-in user's own data.
export function AppReelRoute() {
  const reduced = usePrefersReducedMotion();
  return reduced ? <ReducedMotionReel /> : <Reel />;
}
