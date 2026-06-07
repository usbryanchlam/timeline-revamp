/**
 * Top-right glass-blur pill. Tagline above ("Timeline — your travels, as a movie.")
 * + "Make your own →" CTA. Lives above the scrim, ignores pointer events on the
 * map but accepts them on the pill itself.
 */
export function CTAPill() {
  return (
    <div className="absolute right-4 top-[max(env(safe-area-inset-top),16px)] z-30 flex flex-col items-end gap-2 pointer-events-none">
      <p className="text-caps text-[10px] text-ink-dim">
        Timeline — your travels, as a movie.
      </p>
      <a
        href="/app?signup=1"
        className="glass-pill pointer-events-auto rounded-full px-4 py-2 text-sm font-semibold text-ink hover:bg-bg-elev/90 transition-colors duration-200"
      >
        Make your own
        <span className="ml-1 text-amber-400">→</span>
      </a>
    </div>
  );
}
