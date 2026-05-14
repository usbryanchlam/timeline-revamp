import { motion } from 'framer-motion';
import {
  cityNameAndCaption,
  photoStackContainer,
  photoStackItem,
} from '@/motion/variants';
import { isPhotoCard } from '@/types/reel';
import { PhotoCycle } from '@/reel/PhotoCycle';
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
 * each chapter change — that re-mount restarts the Framer variants from
 * "hidden" → "visible", which is the trigger for the staggered arrival.
 *
 * Phase 6 / REEL-09: branches on ReelPhoto type —
 * - PhotoCard[] from /app/ reel: rendered via PhotoCycle (crossfade cycling)
 * - PhotoSeed[] from public seeded reel: rendered as gradient stack (existing behavior)
 * - 0 photos: entire photo stack div is omitted (no broken img tags)
 */
export function ChapterOverlay({ chapter, chapterNumber, totalChapters }: Props) {
  const formatted = formatArrivedAt(chapter.arrivedAt);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
      {/* Bottom padding clears the chapter rail (which sits at safe-area + 32px,
          2px tall) plus ~32px of breathing room. Top padding gives the scrim
          a long fade-up so type stays legible against bright photos. */}
      <div
        className="scrim-bottom px-5 pt-32"
        style={{
          paddingBottom: 'calc(max(env(safe-area-inset-bottom), 32px) + 48px)',
        }}
      >
        {/* Photo stack — Framer drives the staggered arrival via the parent
            container variant. PhotoCycle handles within-chapter crossfade. */}
        {chapter.photos.length > 0 && (() => {
          const first = chapter.photos[0]!;
          if (isPhotoCard(first)) {
            // /app/ reel: real PhotoCard array — cycle through them.
            return (
              <motion.div
                className="relative h-32 mb-5 ml-1"
                variants={photoStackContainer}
                initial="hidden"
                animate="visible"
              >
                <PhotoCycle photos={chapter.photos.filter(isPhotoCard)} />
              </motion.div>
            );
          }
          // Fallback to gradient seed render (existing behavior for public reel).
          return (
            <motion.div
              className="relative h-32 mb-5 ml-1"
              variants={photoStackContainer}
              initial="hidden"
              animate="visible"
            >
              {chapter.photos.slice(0, 2).map((photo, i) => {
                if (isPhotoCard(photo)) return null; // narrow for TS
                return (
                  <motion.div
                    key={photo.id}
                    className="absolute top-0 left-0 w-24 h-32 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
                    variants={photoStackItem}
                    style={{
                      background: `linear-gradient(135deg, ${photo.gradient[0]} 0%, ${photo.gradient[1]} 100%)`,
                      transform: `translateX(${i * 22}px) rotate(${i === 0 ? -4 : 6}deg)`,
                    }}
                    role="img"
                    aria-label={photo.alt}
                  />
                );
              })}
            </motion.div>
          );
        })()}

        {/* Chapter counter + date */}
        <div className="text-caps text-[10px] text-amber-400 mb-2">
          Chapter {String(chapterNumber).padStart(2, '0')} / {String(totalChapters).padStart(2, '0')}
          <span className="text-ink-mute ml-3">{formatted}</span>
        </div>

        {/* City name — the brand element */}
        <motion.h1
          className="text-display text-[clamp(40px,11vw,72px)] text-ink"
          variants={cityNameAndCaption}
          initial="hidden"
          animate="visible"
        >
          {chapter.name}
          <span className="text-ink-dim ml-2 text-[0.4em] align-middle font-medium tracking-normal">
            {chapter.country}
          </span>
        </motion.h1>

        {/* Caption */}
        <motion.p
          className="mt-3 max-w-[28ch] text-[15px] leading-snug text-ink-dim"
          variants={cityNameAndCaption}
          initial="hidden"
          animate="visible"
        >
          {chapter.caption}
        </motion.p>
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
