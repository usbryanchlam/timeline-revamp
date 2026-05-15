import { useEffect, type RefObject } from 'react';
import type maplibregl from 'maplibre-gl';

/**
 * useBearingOrbit — drive map.setBearing() once per animation frame.
 *
 * Shared primitive: OrbitReel uses 45°/s (D-12, REEL-08 1-city orbit) and
 * GlobeReel uses 10°/s (D-16, slow rotating globe for 0-city empty state).
 *
 * setBearing is preferred over easeTo({ duration: Infinity }) / rotateTo:
 *   - synchronous; no moveend storms that interfere with the gesture machine
 *   - frame-precise; we own the rate
 *
 * Pause-on-hidden + lastT=null on visibility resume prevents the time-warp
 * footgun (RESEARCH §Pitfall 2). StrictMode-safe: cleanup cancels RAF +
 * removes the listener; second mount re-arms from scratch. No mountedRef.
 */
export function useBearingOrbit(
  mapRef: RefObject<maplibregl.Map | null>,
  degreesPerSecond: number,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const map = mapRef.current;
    if (!map) return;

    let rafId: number | null = null;
    let lastT: number | null = null;
    let bearing = map.getBearing();
    let paused = document.hidden;

    const step = (t: number): void => {
      if (!paused) {
        if (lastT !== null) {
          const dt = t - lastT;
          bearing = (bearing + (degreesPerSecond * dt) / 1000) % 360;
          map.setBearing(bearing);
        }
        lastT = t;
      } else {
        lastT = null;
      }
      rafId = requestAnimationFrame(step);
    };

    const onVis = (): void => {
      paused = document.hidden;
      if (paused) lastT = null;
    };

    rafId = requestAnimationFrame(step);
    document.addEventListener('visibilitychange', onVis);

    return (): void => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [mapRef, degreesPerSecond, enabled]);
}
