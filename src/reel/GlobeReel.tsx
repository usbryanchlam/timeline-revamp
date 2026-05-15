import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useBearingOrbit } from '@/reel/useBearingOrbit';
import { CTAPill } from '@/reel/CTAPill';
import { STYLE_URL } from '@/reel/mapStyle';

// D-16: 0-city empty state — slow rotating globe centered Pacific, no
// illustration (DESIGN.md locked risk #3). 10°/s = ~36s/revolution.
const DEGREES_PER_SECOND = 10;

export function GlobeReel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [0, 20],
      zoom: 1,
      pitch: 0,
      bearing: 0,
      interactive: false,
    });
    mapRef.current = map;

    // CRITICAL (RESEARCH §Pitfall 3): setProjection MUST be called inside the
    // style.load handler. Calling synchronously after the constructor leaves
    // the projection unset because style.load has not fired yet.
    map.on('style.load', () => {
      map.setProjection({ type: 'globe' });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useBearingOrbit(mapRef, DEGREES_PER_SECOND, true);

  return (
    <div className="reel-root relative h-[100dvh] bg-bg-map">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-5 pb-24 pt-32 scrim-bottom">
        <p className="text-ink-mute text-center text-base">
          No trips yet. Check back soon.
        </p>
      </div>
      <CTAPill />
    </div>
  );
}
