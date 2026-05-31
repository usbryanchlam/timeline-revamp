import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import type { CityChapter, ReelStateName } from '@/types/reel';
import { STYLE_URL } from '@/reel/mapStyle';
import { FLY_DURATION_MS, FLY_CURVE, easeCamera } from '@/reel/motion';

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
      curve: FLY_CURVE,
      easing: easeCamera,
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
