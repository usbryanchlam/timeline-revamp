import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CityChapter, ReelStateName } from '@/types/reel';

// Tile source: prefer MapTiler vector tiles (cinematic city-block detail) when
// VITE_MAPTILER_KEY is set, fall back to MapLibre's public demotiles otherwise
// so dev still renders without an account. Sign up at https://www.maptiler.com/
// (free 100k requests/mo) and paste the key into .env.local.
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
const STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`
  : 'https://demotiles.maplibre.org/style.json';

if (!MAPTILER_KEY && typeof window !== 'undefined') {
  // Single warning at module load; never inside the render path.
  console.warn(
    '[MapCanvas] VITE_MAPTILER_KEY not set — falling back to demotiles. ' +
      'See .env.example for setup.',
  );
}

// Apple-Maps-Flyover-ish curve for camera flights. MapLibre's flyTo accepts a
// numeric `curve` (zoom-out arc) and a custom `easing` function.
const ARRIVAL_CURVE = 1.6;
const FLY_DURATION_MS = 1800;

// Mirrors --color-bg-map in src/index.css. Kept as a constant here so the
// MapLibre sky tint stays in lockstep with the app background token.
const BG_MAP_HEX = '#0b1020';

// cubic-bezier(0.16, 1, 0.3, 1) approximation for MapLibre's easing(t) -> t.
// MapLibre passes a 0..1 parameter and expects a 0..1 output.
function easeArrival(t: number): number {
  // Inlined cubic-bezier(0.16, 1, 0.3, 1) — Penner-style "expo-out with overshoot".
  return 1 - Math.pow(1 - t, 3.2);
}

interface Props {
  readonly chapters: readonly CityChapter[];
  readonly chapterIndex: number;
  readonly stateName: ReelStateName;
  readonly onUserMapInteract?: () => void;
}

export function MapCanvas({ chapters, chapterIndex, stateName, onUserMapInteract }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const lastChapterRef = useRef<number>(-1);

  // --- Init map once -------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const first = chapters[0];
    if (!first) return;

    const map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: first.center as [number, number],
      zoom: 1.4, // start zoomed out — first arrival is part of the show
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
      // We own all touch/pan input via the gesture machine. Re-enable
      // surgically when state == MAP_INTERACT.
      interactive: false,
      pitchWithRotate: false,
      cooperativeGestures: false,
    });

    mapRef.current = map;

    // Forward user-initiated drag/zoom (when interactive is briefly enabled)
    // up to the gesture machine via the parent callback.
    map.on('dragstart', () => onUserMapInteract?.());
    map.on('zoomstart', () => onUserMapInteract?.());

    // Tint sky to bg-map so high-pitch frames blend with app chrome.
    map.on('load', () => {
      map.setSky({
        'sky-color': BG_MAP_HEX,
        'horizon-color': BG_MAP_HEX,
        'fog-color': BG_MAP_HEX,
        'sky-horizon-blend': 0.5,
        'horizon-fog-blend': 0.6,
        'fog-ground-blend': 0.5,
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      lastChapterRef.current = -1;
    };
    // chapters/onUserMapInteract intentionally not deps — the map is initialized
    // exactly once and chapter changes drive flyTo via the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- React to chapter changes -> flyTo -----------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = chapters[chapterIndex];
    if (!target) return;
    if (lastChapterRef.current === chapterIndex) return;
    lastChapterRef.current = chapterIndex;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      map.jumpTo({
        center: target.center as [number, number],
        zoom: target.zoom,
        pitch: target.pitch,
        bearing: target.bearing,
      });
      return;
    }

    map.flyTo({
      center: target.center as [number, number],
      zoom: target.zoom,
      pitch: target.pitch,
      bearing: target.bearing,
      duration: FLY_DURATION_MS,
      curve: ARRIVAL_CURVE,
      easing: easeArrival,
      essential: true,
    });
  }, [chapterIndex, chapters]);

  // --- Toggle interactivity based on gesture state -------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const interactive = stateName === 'MAP_INTERACT';
    if (interactive) {
      map.dragPan.enable();
      map.touchZoomRotate.enable();
      map.scrollZoom.enable();
      map.doubleClickZoom.enable();
    } else {
      map.dragPan.disable();
      map.touchZoomRotate.disable();
      map.scrollZoom.disable();
      map.doubleClickZoom.disable();
    }
  }, [stateName]);

  // --- Resize on orientationchange / dvh changes ---------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 bg-bg-map"
      aria-hidden="true"
    />
  );
}
