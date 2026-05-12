import { SEEDED_CITIES } from '@/data/seeded-cities';
import type { CityChapter } from '@/types/reel';

interface ReducedMotionReelProps {
  readonly chapters?: readonly CityChapter[];
}

/**
 * Static fallback for `prefers-reduced-motion: reduce`. No map, no animation,
 * native scroll. Same data, Lighthouse-clean. This is a launch-gate path
 * (a11y audit verifies it works keyboard-only and reads cleanly in VoiceOver).
 */
export function ReducedMotionReel({
  chapters = SEEDED_CITIES,
}: ReducedMotionReelProps = {}) {
  return (
    <main className="reel-static-root bg-bg text-ink">
      <header className="px-5 pt-12 pb-6 max-w-screen-sm mx-auto">
        <p className="text-caps text-[10px] text-amber-400 mb-2">Timeline</p>
        <h1 className="text-display text-[clamp(36px,9vw,56px)]">Travels, in chapters.</h1>
        <p className="mt-3 text-ink-dim text-[15px] leading-snug max-w-[36ch]">
          Reduced-motion view. Same trips, no camera flight.
        </p>
      </header>

      <ol className="px-5 pb-16 space-y-8 max-w-screen-sm mx-auto">
        {chapters.map((c, i) => (
          <li
            key={c.id}
            className="border-t border-line pt-6 first:border-t-0 first:pt-0"
          >
            <div className="text-caps text-[10px] text-amber-400 mb-2">
              Chapter {String(i + 1).padStart(2, '0')}
              <span className="text-ink-mute ml-3">
                {new Date(c.arrivedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
            <h2 className="text-display text-3xl">
              {c.name}
              <span className="text-ink-dim ml-2 text-base align-middle font-medium tracking-normal">
                {c.country}
              </span>
            </h2>
            <p className="mt-2 text-ink-dim text-[15px] leading-snug">{c.caption}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {c.photos.map((p) => (
                <div
                  key={p.id}
                  className="aspect-[4/5] rounded-lg"
                  style={{
                    background: `linear-gradient(135deg, ${p.gradient[0]} 0%, ${p.gradient[1]} 100%)`,
                  }}
                  role="img"
                  aria-label={p.alt}
                />
              ))}
            </div>
          </li>
        ))}
      </ol>

      <footer className="px-5 pb-16 max-w-screen-sm mx-auto">
        <a
          href="/signup"
          className="block w-full rounded-full bg-amber-400 text-bg font-semibold text-center py-3 text-base"
        >
          Make your own →
        </a>
      </footer>
    </main>
  );
}
