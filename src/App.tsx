import { Reel } from '@/reel/Reel';
import { ReducedMotionReel } from '@/reel/ReducedMotionReel';
import { usePrefersReducedMotion } from '@/reel/usePrefersReducedMotion';

export function App() {
  const reduced = usePrefersReducedMotion();
  return reduced ? <ReducedMotionReel /> : <Reel />;
}
