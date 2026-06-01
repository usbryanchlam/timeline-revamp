/**
 * OSM raster style for ERR-03 MapTiler 429 fallback.
 *
 * Activated by MapCanvas.tsx when a MapTiler tile request returns 429 (rate
 * limited). The map keeps rendering — at lower fidelity — instead of going
 * blank or jamming with retried 429s.
 *
 * Source policy: tile.openstreetmap.org is acceptable for portfolio-scale
 * trickle traffic (RESEARCH Pattern 6 + Pitfalls). Attribution is mandatory
 * per OSM policy; ship it as the layer's attribution string. If traffic
 * ever scales, switch to a self-hosted tileserver-gl (v2 backlog).
 *
 * Why `as const`: narrows the literal types so MapLibre's setStyle accepts
 * the object without type widening, matching the project's mapStyle.ts
 * STYLE_URL: string convention (single export, literal type).
 */
export const OSM_RASTER_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'osm', type: 'raster', source: 'osm' },
  ],
} as const;
