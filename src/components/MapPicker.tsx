// MapPicker — flat pan/zoom map for the Trips view's pin-drop interaction.
//
// Intentionally a SEPARATE MapLibre instance from src/reel/MapCanvas.tsx.
// They share zero state, refs, or lifecycle. MapCanvas owns the cinematic
// flyTo show on the public reel; MapPicker is a utility surface for
// authoring trips — no pitch, no bearing, no easing. Keep them apart so
// changes to one don't perturb the other.
//
// maplibre-gl is dynamically imported inside useEffect so vite's
// manualChunks split (vite.config.ts) keeps it in a separate cacheable
// bundle. The CSS is imported once at app entry (src/main.tsx).

import { useEffect, useRef, useState } from 'react';
import type { CityDTO } from '@/types/city';

// Minimal local types for the dynamically imported maplibre-gl module — we
// only touch a small surface, so we keep them inline rather than depending on
// `import type` (which would force a static graph dep and defeat the chunk
// split).
interface MapInstance {
  readonly remove: () => void;
  readonly resize: () => void;
  readonly on: (evt: string, cb: (e: { lngLat: { lat: number; lng: number } }) => void) => void;
  readonly once: (evt: string, cb: () => void) => void;
  readonly fitBounds: (
    bounds: [[number, number], [number, number]],
    opts?: { padding?: number; animate?: boolean },
  ) => void;
}
interface MarkerInstance {
  readonly setLngLat: (lngLat: [number, number]) => MarkerInstance;
  readonly addTo: (map: MapInstance) => MarkerInstance;
  readonly remove: () => void;
}
interface MarkerCtor {
  new (opts: { element: HTMLElement }): MarkerInstance;
}
interface MaplibreModule {
  readonly Map: new (opts: {
    container: HTMLElement;
    style: string;
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
    attributionControl: { compact: boolean };
    pitchWithRotate: boolean;
  }) => MapInstance;
  readonly Marker: MarkerCtor;
}

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
const STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`
  : 'https://demotiles.maplibre.org/style.json';

const AMBER_500 = '#FFD470'; // DESIGN.md accent — must match tailwind amber.500

interface MapPickerProps {
  readonly cities: readonly CityDTO[];
  readonly draftPin: { readonly lat: number; readonly lng: number } | null;
  readonly onPick: (lat: number, lng: number) => void;
  readonly onCityClick?: (id: string) => void;
}

export function MapPicker({ cities, draftPin, onPick, onCityClick }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Keep the map handle in a ref so subsequent effects can update markers
  // without re-initializing.
  const mapRef = useRef<MapInstance | null>(null);
  // Cache the dynamically imported maplibre module so the marker-sync effect
  // can construct new Markers without re-importing on every cities change.
  const maplibreGlRef = useRef<MaplibreModule | null>(null);
  const draftMarkerRef = useRef<MarkerInstance | null>(null);
  const cityMarkersRef = useRef<MarkerInstance[]>([]);
  const onPickRef = useRef(onPick);
  const onCityClickRef = useRef(onCityClick);

  // Tick state to nudge the cities-sync effect to re-run once the async init
  // resolves (since the effect can't otherwise observe `mapRef.current`
  // becoming non-null). Declared up here so the init effect's setter call is
  // resolved before that effect runs.
  const [mapReadyTick, setMapReadyTick] = useState(0);

  // Keep latest callbacks in refs so the init effect (run-once) reads the
  // current handler without needing to re-create the map on every render.
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);
  useEffect(() => {
    onCityClickRef.current = onCityClick;
  }, [onCityClick]);

  // --- Init map once -------------------------------------------------------
  //
  // Note: city marker rendering lives in the cities-sync effect below, not
  // here. This keeps marker code in ONE place and trivially reactive. The
  // initial-fit-bounds still uses the cities snapshot at mount time — it
  // doesn't need to re-fit on every reorder.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let mapInstance: MapInstance | null = null;

    void (async () => {
      const maplibregl = (await import('maplibre-gl')).default as unknown as MaplibreModule;
      if (cancelled || !containerRef.current) return;

      maplibreGlRef.current = maplibregl;

      const initialView =
        cities.length === 0
          ? { center: [0, 20] as [number, number], zoom: 1.5 }
          : computeFitView(cities);

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: initialView.center,
        zoom: initialView.zoom,
        pitch: 0,
        bearing: 0,
        attributionControl: { compact: true },
        pitchWithRotate: false,
      });

      mapRef.current = map;
      mapInstance = map;

      // If we computed a fit-view from existing cities, also fitBounds with
      // padding once the style loads, so the first paint shows everything.
      if (cities.length > 0) {
        const bounds = computeBounds(cities);
        map.once('load', () => {
          if (cancelled) return;
          map.fitBounds(bounds, {
            padding: 60,
            animate: false,
          });
        });
      }

      map.on('click', (e: { lngLat: { lat: number; lng: number } }) => {
        onPickRef.current(e.lngLat.lat, e.lngLat.lng);
      });

      // Force the cities-sync effect to (re-)run now that the map is ready.
      // Since the effect's deps are [cities] only, this is what triggers
      // initial marker rendering after the async map init resolves.
      setMapReadyTick((t) => t + 1);
    })();

    return () => {
      cancelled = true;
      // Dispose markers BEFORE the map container goes away. Custom event
      // listeners on marker DOM elements (see cities-sync effect) hold
      // closures over city ids/callbacks — explicit .remove() lets the
      // library clear those before the map tears down.
      for (const m of cityMarkersRef.current) m.remove();
      cityMarkersRef.current = [];
      if (draftMarkerRef.current) {
        draftMarkerRef.current.remove();
        draftMarkerRef.current = null;
      }
      if (mapInstance) mapInstance.remove();
      mapRef.current = null;
      maplibreGlRef.current = null;
    };
    // Single-shot init: cities are intentionally NOT in deps. The cities-sync
    // effect below owns marker rendering and reacts to prop changes there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Sync city markers when cities prop changes --------------------------
  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreGlRef.current;
    if (!map || !maplibregl) return;

    // Tear down existing city markers (not the draft pin — separate ref).
    for (const m of cityMarkersRef.current) m.remove();
    cityMarkersRef.current = [];

    // Re-render from current props.cities. Pin click handlers close over the
    // current city id; the latest onCityClick is read from the ref so we
    // don't need to re-bind on every render.
    for (const city of cities) {
      const el = document.createElement('div');
      el.style.cssText =
        'width:10px;height:10px;border-radius:9999px;background:#A8B0C2;border:2px solid #0A0E1A;cursor:pointer;';
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([city.lng, city.lat])
        .addTo(map);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onCityClickRef.current?.(city.id);
      });
      cityMarkersRef.current.push(marker);
    }
  }, [cities, mapReadyTick]);

  // --- Sync draft pin marker -----------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreGlRef.current;
    if (!map || !maplibregl) return;

    // Tear down previous draft marker
    if (draftMarkerRef.current) draftMarkerRef.current.remove();
    draftMarkerRef.current = null;

    if (!draftPin) return;

    const el = document.createElement('div');
    el.style.cssText = `width:18px;height:18px;border-radius:9999px;background:${AMBER_500};border:3px solid #0A0E1A;box-shadow:0 0 0 2px ${AMBER_500}55;`;
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([draftPin.lng, draftPin.lat])
      .addTo(map);
    draftMarkerRef.current = marker;
  }, [draftPin, mapReadyTick]);

  // --- Resize on viewport changes ------------------------------------------
  useEffect(() => {
    const onResize = () => {
      mapRef.current?.resize();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 bg-bg-map" />;
}

function computeBounds(
  cities: readonly CityDTO[],
): [[number, number], [number, number]] {
  let minLng = cities[0]!.lng;
  let maxLng = cities[0]!.lng;
  let minLat = cities[0]!.lat;
  let maxLat = cities[0]!.lat;
  for (const c of cities) {
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function computeFitView(
  cities: readonly CityDTO[],
): { center: [number, number]; zoom: number } {
  // Center is the midpoint of the bounds; zoom kept conservative because the
  // load-time fitBounds with padding will tighten it correctly.
  const bounds = computeBounds(cities);
  const center: [number, number] = [
    (bounds[0][0] + bounds[1][0]) / 2,
    (bounds[0][1] + bounds[1][1]) / 2,
  ];
  return { center, zoom: 2 };
}
