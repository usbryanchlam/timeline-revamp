// useFrameRate — DEV-only rAF FPS sampler. Returns null in production builds
// because Vite replaces `import.meta.env.DEV` with the boolean literal `false`
// at build time, and Rollup's minifier dead-codes the body of any `if (false)`
// branch. Combined with the conditional render
// `{import.meta.env.DEV && <FpsBadge />}` in OrbitReel, the hook and its
// caller never reach the production bundle — verified by the build-time
// `bun run verify:tree-shake` script.
//
// The hook is gated on THREE conditions:
//   1. opts.enabled !== false (caller can force-disable for tests / on-screen)
//   2. import.meta.env.DEV (build-time DEV gate)
//   3. URL has ?fps query param (runtime opt-in — precedent: Phase 8's
//      ?signup=1 for the handle picker test page)
//
// All three must be true for the rAF sampler to start. Returns a Sample with
// median (sorted[Math.floor(n/2)]) and p95-low (sorted[Math.floor(n*0.05)])
// over the latest window. The "p95-low" naming matches RESEARCH.md Pattern 3
// and ENG_REVIEW expectations — it's the 5th-percentile-low value, i.e. the
// floor that 95% of frames exceeded, which surfaces sustained worst-case
// rendering load (not transient spikes).

import { useEffect, useState } from 'react';

export interface FrameRateSample {
  readonly fps: number;
  readonly median: number;
  readonly p95: number;
  readonly sampleCount: number;
}

interface UseFrameRateOptions {
  /** Window over which median + p95 are computed. Default 8s — matches the
   *  OrbitReel orbit duration. */
  readonly windowMs?: number;
  /** Override for tests and runtime caller-side disable. Default true.
   *  The DEV + ?fps=1 gates apply regardless. */
  readonly enabled?: boolean;
}

export function useFrameRate(
  opts?: UseFrameRateOptions,
): FrameRateSample | null {
  const [sample, setSample] = useState<FrameRateSample | null>(null);

  // Compute the gate inside the effect so the hook still mounts under
  // identical conditions across renders (state-driven re-evaluation would
  // create a hook-rule violation on the enabled flip).
  useEffect(() => {
    const callerEnabled = opts?.enabled ?? true;
    if (!callerEnabled) return;
    if (!import.meta.env.DEV) return;
    if (typeof location === 'undefined') return;
    // Inline ?fps query gate — runtime opt-in (precedent: Phase 8's ?signup=1).
    if (!new URLSearchParams(location.search).has('fps')) return;

    const windowMs = opts?.windowMs ?? 8000;
    // Track frame-deltas. fpsSamples is the array of instantaneous fps values
    // (1000 / delta). We commit a Sample when the elapsed window crosses
    // windowMs.
    let lastT: number | null = null;
    let fpsSamples: number[] = [];
    let windowStart: number | null = null;
    let rafId: number | null = null;

    const tick = (t: number): void => {
      if (lastT !== null) {
        const dt = t - lastT;
        if (dt > 0) {
          const fps = 1000 / dt;
          fpsSamples.push(fps);
        }
      }
      lastT = t;
      if (windowStart === null) windowStart = t;

      if (t - windowStart >= windowMs && fpsSamples.length > 0) {
        const sorted = [...fpsSamples].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)]!;
        const p95 = sorted[Math.floor(sorted.length * 0.05)]!;
        const lastFps = fpsSamples[fpsSamples.length - 1]!;
        setSample({
          fps: Math.round(lastFps),
          median: Math.round(median),
          p95: Math.round(p95),
          sampleCount: fpsSamples.length,
        });
        // Reset for the next window — rolling 8s view.
        fpsSamples = [];
        windowStart = t;
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    };
  }, [opts?.windowMs, opts?.enabled]);

  return sample;
}
