/**
 * Static LCP poster that fills the same surface MapCanvas occupies. Rendered
 * on first paint while the lazy-loaded MapCanvas chunk (and MapLibre) hydrate
 * in the background. The `<img>` is the LCP element — keep it cheap, decoded
 * async, fetched at high priority, and matching the canvas frame so the swap
 * is invisible (no layout shift, same bg-bg-map fallback color).
 *
 * Decorative role (`alt=""`) since the map view conveys location semantically
 * via the chapter overlay, not the poster.
 */
export function MapPoster() {
  return (
    <div className="absolute inset-0 bg-bg-map" aria-hidden="true">
      <img
        src="/poster-tokyo.jpg"
        alt=""
        width={1280}
        height={720}
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full"
        style={{ objectFit: 'cover' }}
      />
    </div>
  );
}
