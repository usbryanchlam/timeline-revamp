import { useEffect, useState } from 'react';

/**
 * Live-tracking matchMedia hook. Updates if the user toggles reduce-motion
 * mid-session (rare, but free). Default to `true` on the server / before
 * mount so reduced-motion users never see a frame of motion before the
 * fallback paints.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setPrefersReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return prefersReduced;
}
