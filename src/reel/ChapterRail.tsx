interface Props {
  readonly total: number;
  readonly currentIndex: number;
  readonly scrubT: number | null;
}

/**
 * Bottom horizontal chapter rail. One flex segment per chapter, 2px tall,
 * 4px gap between. Past chapters filled amber, future chapters dimmed,
 * current segment fully amber when IDLE/PAUSED or showing a partial
 * gradient fill while SCRUBBING (so the user sees how far through the
 * chapter the scrub cursor sits).
 *
 * Spec source: accent-board mockup CSS — `.rail { left:24px; right:24px;
 * bottom:32px; display:flex; gap:4px }`.
 */
export function ChapterRail({ total, currentIndex, scrubT }: Props) {
  // Map scrubT (0..1 across the whole reel) to a per-segment partial fill
  // for the segment the cursor currently sits in.
  let cursorSegment: number | null = null;
  let cursorWithin = 0; // 0..1 inside that segment
  if (scrubT !== null && total > 0) {
    const exact = scrubT * total;
    cursorSegment = Math.min(total - 1, Math.floor(exact));
    cursorWithin = exact - cursorSegment;
  }

  return (
    <div
      className="pointer-events-none absolute z-20 flex gap-1"
      style={{
        left: '24px',
        right: '24px',
        bottom: 'max(env(safe-area-inset-bottom), 32px)',
      }}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={currentIndex + 1}
      aria-label={`Chapter ${currentIndex + 1} of ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => {
        const isPast = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isCursorSeg = cursorSegment === i;

        const baseClass = 'flex-1 h-[2px] rounded-full transition-colors';

        if (isCursorSeg) {
          return (
            <span
              key={i}
              className={baseClass}
              style={{
                background: `linear-gradient(90deg, #FFD470 ${
                  cursorWithin * 100
                }%, rgba(255,255,255,0.14) ${cursorWithin * 100}%)`,
              }}
            />
          );
        }

        if (isPast || isCurrent) {
          return <span key={i} className={`${baseClass} bg-amber-400`} />;
        }
        return <span key={i} className={`${baseClass} bg-white/[0.14]`} />;
      })}
    </div>
  );
}
