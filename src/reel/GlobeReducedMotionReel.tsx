import { CTAPill } from '@/reel/CTAPill';

// D-17: prefers-reduced-motion fallback for the 0-city globe. No map,
// no motion — just the caption. Acceptance criterion forbids any reference
// to the map library here so the no-WebGL contract is grep-locked.

export function GlobeReducedMotionReel() {
  return (
    <section
      className="reel-static-root bg-bg text-ink min-h-dvh flex items-center justify-center p-6"
      role="region"
      aria-label="World map travel reel (reduced motion)"
    >
      <p className="text-ink-mute text-center">No trips yet. Check back soon.</p>
      <CTAPill />
    </section>
  );
}
