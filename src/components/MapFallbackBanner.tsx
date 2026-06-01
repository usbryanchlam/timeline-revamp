/**
 * ERR-03 top-of-map dismissible banner shown after a MapTiler 429 falls back
 * to OSM raster tiles. Copy is CONTEXT-locked.
 *
 * Single-amber-accent rule (DESIGN.md L72/L85-87 LOCKED): amber appears ONLY
 * on the border. Body text uses the standard ink token. Dismiss × is muted.
 *
 * Tap-target: 44×44 minimum on the dismiss × (project a11y convention).
 *
 * sessionStorage behavior: the parent Reel component sets/reads
 * 'map-fallback-active'. This banner only owns its own local visibility
 * (useState). Dismissing the banner does NOT clear the sessionStorage flag —
 * the OSM tiles continue rendering until the next session.
 */
import { useState } from 'react';

interface Props {
  readonly onDismiss?: () => void;
}

export function MapFallbackBanner({ onDismiss }: Props) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-x-0 top-4 mx-auto w-max max-w-[90%] z-20 bg-bg-elev border border-amber-500/40 rounded-lg px-4 py-2 text-ink text-sm flex items-center gap-3 shadow-lg"
    >
      <span>Map service limited; some detail reduced.</span>
      <button
        type="button"
        onClick={() => {
          setVisible(false);
          onDismiss?.();
        }}
        aria-label="Dismiss map fallback notice"
        className="text-ink-mute hover:text-ink min-w-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        ×
      </button>
    </div>
  );
}
