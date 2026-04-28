import type { CityChapter } from '@/types/reel';

interface Props {
  readonly chapter: CityChapter;
  readonly chapterNumber: number;
  readonly totalChapters: number;
}

/**
 * Bottom-anchored overlay: photo stack, city name (display 44px Inter Tight 800),
 * caption, date. Sits over a vertical scrim so type stays legible against
 * any map background.
 *
 * The overlay is keyed on `chapter.id` upstream so React replaces the DOM on
 * each chapter change — that lets the arrival-pulse animation re-fire without
 * orchestration glue here.
 */
export function ChapterOverlay({ chapter, chapterNumber, totalChapters }: Props) {
  const formatted = formatArrivedAt(chapter.arrivedAt);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
      <div className="scrim-bottom px-5 pb-8 pt-32">
        {/* Photo stack — two cards rotated for editorial polaroid feel */}
        <div className="relative h-32 mb-5 ml-1">
          {chapter.photos.slice(0, 2).map((photo, i) => (
            <div
              key={photo.id}
              className="absolute top-0 left-0 w-24 h-32 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.45)] animate-arrival"
              style={{
                background: `linear-gradient(135deg, ${photo.gradient[0]} 0%, ${photo.gradient[1]} 100%)`,
                transform: `translateX(${i * 22}px) rotate(${i === 0 ? -4 : 6}deg)`,
                animationDelay: `${i * 80}ms`,
              }}
              role="img"
              aria-label={photo.alt}
            />
          ))}
        </div>

        {/* Chapter counter + date */}
        <div className="text-caps text-[10px] text-amber-400 mb-2">
          Chapter {String(chapterNumber).padStart(2, '0')} / {String(totalChapters).padStart(2, '0')}
          <span className="text-ink-mute ml-3">{formatted}</span>
        </div>

        {/* City name — the brand element */}
        <h1 className="text-display text-[clamp(40px,11vw,72px)] text-ink animate-arrival">
          {chapter.name}
          <span className="text-ink-dim ml-2 text-[0.4em] align-middle font-medium tracking-normal">
            {chapter.country}
          </span>
        </h1>

        {/* Caption */}
        <p className="mt-3 max-w-[28ch] text-[15px] leading-snug text-ink-dim">
          {chapter.caption}
        </p>
      </div>
    </div>
  );
}

function formatArrivedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}
