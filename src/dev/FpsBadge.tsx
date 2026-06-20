// FpsBadge — DEV-only amber readout of useFrameRate. Tree-shaken from the
// production bundle via Vite's `import.meta.env.DEV` literal replacement +
// Rollup minification. The conditional render at the call site
// (`{import.meta.env.DEV && <FpsBadge />}`) ensures the import itself is
// dead-coded in prod.
//
// DESIGN.md invariant: single amber accent. The badge uses amber-400 text
// (matches the existing `text-amber-500` accent palette range) on a smoked
// bg-bg-elev/80 backdrop so it stays legible over both bright photos and the
// dark reel UI. NO other colors.
//
// Format: "60 fps · med 60 · p95-low 58 · n=480" — readable at a glance on
// an iPhone in landscape, low enough information density that it doesn't
// occlude the orbit camera.

import { useFrameRate } from './useFrameRate';

export function FpsBadge() {
  // Defense-in-depth: even though the parent gates this with
  // `import.meta.env.DEV`, repeat the check here so a direct (mis-)mount
  // from a non-orbit surface still no-ops in prod.
  if (!import.meta.env.DEV) return null;
  const sample = useFrameRate({ windowMs: 8000 });
  if (!sample) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="fps-badge"
      className="fixed top-2 left-2 z-[100] rounded-md bg-bg-elev/80 px-2 py-1 text-[10px] text-amber-400 tabular-nums backdrop-blur"
    >
      {sample.fps} fps · med {sample.median} · p95-low {sample.p95} · n=
      {sample.sampleCount}
    </div>
  );
}
