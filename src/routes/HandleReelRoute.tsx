import { useEffect } from 'react';
import { useParams } from 'react-router';
import { Reel } from '@/reel/Reel';
import { ReducedMotionReel } from '@/reel/ReducedMotionReel';
import { usePrefersReducedMotion } from '@/reel/usePrefersReducedMotion';

// Phase 3 stub: same seeded reel for any handle. Phase 9 wires user lookup.
export function HandleReelRoute() {
  const { handle = '' } = useParams<{ handle: string }>();
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const previous = document.title;
    document.title = `@${handle} — Timeline`;
    return () => {
      document.title = previous;
    };
  }, [handle]);

  return reduced ? <ReducedMotionReel /> : <Reel />;
}
