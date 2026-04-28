interface Props {
  readonly total: number;
  readonly currentIndex: number;
  readonly scrubT: number | null;
}

/**
 * Vertical amber chapter rail along the right edge. Each chapter is a 4x12 px
 * pill; the active one is amber-400, the others are amber-600 at 35% opacity.
 * While SCRUBBING (scrubT != null) we render a brighter floating cursor at the
 * scrub fraction.
 */
export function ChapterRail({ total, currentIndex, scrubT }: Props) {
  return (
    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-20">
      {Array.from({ length: total }).map((_, i) => {
        const active = i === currentIndex;
        return (
          <span
            key={i}
            className={[
              'block w-1 rounded-full transition-all duration-200 ease-ui',
              active ? 'h-4 bg-amber-400' : 'h-2 bg-amber-600/40',
            ].join(' ')}
          />
        );
      })}
      {scrubT !== null ? (
        <span
          className="absolute -right-1 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(255,212,112,0.7)]"
          style={{ top: `calc(${scrubT * 100}% - 4px)` }}
        />
      ) : null}
    </div>
  );
}
