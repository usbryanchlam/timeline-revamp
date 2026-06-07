// Shared MapLibre style URL — sourced by MapCanvas, OrbitReel, and GlobeReel
// from this single module so the literal never duplicates.
//
// Tile source: prefer MapTiler vector tiles (cinematic city-block detail) when
// VITE_MAPTILER_KEY is set, fall back to MapLibre's public demotiles so dev
// renders without an account. Sign up at https://www.maptiler.com/ (free
// 100k requests/mo) and paste the key into .env.local.
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;

export const STYLE_URL: string = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`
  : 'https://demotiles.maplibre.org/style.json';

if (!MAPTILER_KEY && typeof window !== 'undefined') {
  // Single warning at module load; never inside a render path.
  // eslint-disable-next-line no-console
  console.warn(
    '[mapStyle] VITE_MAPTILER_KEY not set — falling back to demotiles. ' +
      'See .env.example for setup.',
  );
}
