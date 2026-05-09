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

import { useEffect, useRef } from 'react';
import type { CityDTO } from '@/types/city';

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
  // without re-initializing. Typed as `unknown` because maplibre-gl is loaded
  // dynamically; we cast at point of use.
  const mapRef = useRef<unknown>(null);
  const draftMarkerRef = useRef<unknown>(null);
  const cityMarkersRef = useRef<unknown[]>([]);
  const onPickRef = useRef(onPick);
  const onCityClickRef = useRef(onCityClick);

  // Keep latest callbacks in refs so the init effect (run-once) reads the
  // current handler without needing to re-create the map on every render.
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);
  useEffect(() => {
    onCityClickRef.current = onCityClick;
  }, [onCityClick]);

  // --- Init map once -------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let mapInstance: { remove: () => void } | null = null;

    void (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current) return;

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
          map.fitBounds(bounds as [[number, number], [number, number]], {
            padding: 60,
            animate: false,
          });
        });
      }

      map.on('click', (e: { lngLat: { lat: number; lng: number } }) => {
        onPickRef.current(e.lngLat.lat, e.lngLat.lng);
      });

      // Render existing city markers (neutral)
      for (const city of cities) {
        const el = document.createElement('div');
        el.style.cssText =
          'width:10px;height:10px;border-radius:9999px;background:#A8B0C2;border:2px solid #0A0E1A;cursor:pointer;';
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([city.lng, city.lat])
          .addTo(map);
        if (onCityClickRef.current) {
          el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            onCityClickRef.current?.(city.id);
          });
        }
        cityMarkersRef.current.push(marker);
      }
    })();

    return () => {
      cancelled = true;
      if (mapInstance) mapInstance.remove();
      mapRef.current = null;
      draftMarkerRef.current = null;
      cityMarkersRef.current = [];
    };
    // Initial cities snapshot is captured at mount; subsequent updates to
    // cities are not re-rendered into markers in this minimal Task 3 scope —
    // 05-02 will introduce live marker sync alongside the create/update form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Sync draft pin marker -----------------------------------------------
  useEffect(() => {
    const map = mapRef.current as
      | { getCenter: () => unknown }
      | null;
    if (!map) return;

    let cancelled = false;
    void (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !mapRef.current) return;

      // Tear down previous draft marker
      const prev = draftMarkerRef.current as { remove: () => void } | null;
      if (prev) prev.remove();
      draftMarkerRef.current = null;

      if (!draftPin) return;

      const el = document.createElement('div');
      el.style.cssText = `width:18px;height:18px;border-radius:9999px;background:${AMBER_500};border:3px solid #0A0E1A;box-shadow:0 0 0 2px ${AMBER_500}55;`;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([draftPin.lng, draftPin.lat])
        .addTo(mapRef.current as Parameters<typeof marker.addTo>[0]);
      draftMarkerRef.current = marker;
    })();

    return () => {
      cancelled = true;
    };
  }, [draftPin]);

  // --- Resize on viewport changes ------------------------------------------
  useEffect(() => {
    const onResize = () => {
      const map = mapRef.current as { resize: () => void } | null;
      map?.resize();
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
