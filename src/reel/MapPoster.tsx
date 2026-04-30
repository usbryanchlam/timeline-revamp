/**
 * Static fallback that fills the same surface MapCanvas occupies. Rendered
 * on first paint while the lazy-loaded MapCanvas chunk (and MapLibre) hydrate
 * in the background, and used as the Suspense fallback during chapter
 * transitions.
 *
 * Content-agnostic by design: a faint radial gradient over the bg-map token,
 * no place-specific imagery. This scales to per-user reels (Phase 9) where
 * the first city varies. Decorative (`aria-hidden="true"`); the chapter
 * overlay carries location semantics.
 */
export function MapPoster() {
  return (
    <div
      className="absolute inset-0 bg-bg-map"
      aria-hidden="true"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at center, #0b1020 0%, #060a16 100%)',
      }}
    />
  );
}

export default MapPoster;
