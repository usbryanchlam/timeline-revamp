import { Reel } from '@/reel/Reel';
import { ReducedMotionReel } from '@/reel/ReducedMotionReel';
import { usePrefersReducedMotion } from '@/reel/usePrefersReducedMotion';

// Phase 3 stub: renders the same seeded reel as the public tree.
// Phase 9 will swap this for the logged-in user's own data.
//
// `.app-reel-host` is the marker class read by index.css to lift the
// ChapterRail above the BottomNav (h-16 = 64px) on `/app/`. The public reel
// at `/` does not get this class, so its rail anchors to the default
// `max(env(safe-area-inset-bottom), 32px)`.
export function AppReelRoute() {
  const reduced = usePrefersReducedMotion();
  return (
    <div className="app-reel-host">
      {reduced ? <ReducedMotionReel /> : <Reel />}
    </div>
  );
}
