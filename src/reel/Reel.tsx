import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { SEEDED_CITIES } from '@/data/seeded-cities';
import { useGestureMachine } from '@/gestures/useGestureMachine';
import type { CityChapter } from '@/types/reel';
import { MapPoster } from './MapPoster';
import { ChapterOverlay } from './ChapterOverlay';
import { ChapterRail } from './ChapterRail';
import { CTAPill } from './CTAPill';
import { PlayPauseIndicator } from './PlayPauseIndicator';
import { StateBadge } from './StateBadge';

// Defer MapLibre + MapCanvas to a separate chunk so the LCP poster paints first.
// The Suspense fallback renders <MapPoster />, which has identical positioning
// to MapCanvas — when the chunk arrives and the canvas mounts, the swap is
// visually seamless (no layout shift, same bg-bg-map background).
const MapCanvas = lazy(() =>
  import('./MapCanvas').then((m) => ({ default: m.MapCanvas })),
);

/**
 * Full-bleed cinematic reel. Single route, no router yet. Owns:
 *   - the gesture state machine (single source of truth for chapter index)
 *   - the MapLibre canvas (driven by chapterIndex / stateName)
 *   - the overlay stack (chapter content, rail, CTA, state badge)
 *
 * The aria-live region announces chapter changes for AT users; the visual
 * surface is `role="region"` (NOT application — see DESIGN doc rationale).
 */
interface ReelProps {
  readonly chapters?: readonly CityChapter[];
}

export function Reel({ chapters = SEEDED_CITIES }: ReelProps = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // A11Y-08: Enter opens the photo detail surface. On the public reel the
  // detail surface is the ChapterOverlay's lightbox-style photo expansion
  // (PhotoDetailSheet requires a CityDTO and is reserved for authenticated
  // /app/trips — out of scope here). We expose a detailOpen flag that the
  // ChapterOverlay can opt into; today it flips a CSS marker so screen-reader
  // users can hear the chapter caption + first photo's alt text in full.
  const [detailOpen, setDetailOpen] = useState(false);
  const openDetail = useCallback(() => setDetailOpen(true), []);

  const { state, bind } = useGestureMachine({
    totalChapters: chapters.length,
    onOpenDetail: openDetail,
  });

  // Bind the container ref for both PointerEvents and the parent ref.
  const setContainer = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el;
      bind(el);
    },
    [bind],
  );

  // When MapLibre detects a user-initiated drag (via the map.on('dragstart')
  // forward), promote to MAP_INTERACT. In W1, we only fire this when the map
  // is already interactive (state == MAP_INTERACT), so this is more of a
  // "stay alive in MAP_INTERACT" nudge than a state transition. Reserved.
  const onUserMapInteract = useCallback(() => {
    // No-op for W1. The state machine already promotes to MAP_INTERACT on
    // two-finger pointerdown; user single-finger map drags are blocked at the
    // map (interactive: false). We'll wire camera-ownership signals in W2.
  }, []);

  // Aria-live announcement on arrival-pulse beat. A11Y-04: only fire when
  // the camera has landed (state.name === 'IDLE' or 'PAUSED'), never
  // mid-flight (CHAPTER_SWIPE / SCRUBBING / MAP_INTERACT). Screen readers
  // get the announcement once the city is on-screen and the user can
  // actually act on it.
  const liveRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (state.name !== 'IDLE' && state.name !== 'PAUSED') return;
    const c = chapters[state.chapterIndex];
    if (c && liveRef.current) {
      liveRef.current.textContent = `${c.name}, ${formatMonthYear(c.arrivedAt)}`;
    }
  }, [state.name, state.chapterIndex, chapters]);

  const chapter = chapters[state.chapterIndex];
  if (!chapter) return null;

  return (
    <main
      ref={setContainer}
      className="reel-root relative bg-bg"
      role="region"
      aria-label="Travel reel"
      data-detail-open={detailOpen ? 'true' : 'false'}
      onKeyDown={(e) => {
        // Esc closes the detail. The state-machine doesn't own this flag, so
        // we handle Esc inline here. Other keys are routed by the gesture
        // hook's window-level keydown listener.
        if (e.key === 'Escape' && detailOpen) setDetailOpen(false);
      }}
    >
      <Suspense fallback={<MapPoster />}>
        <MapCanvas
          chapters={chapters}
          chapterIndex={state.chapterIndex}
          stateName={state.name}
          onUserMapInteract={onUserMapInteract}
        />
      </Suspense>

      {/* Top scrim for legibility of CTA + state badge */}
      <div className="scrim-top pointer-events-none absolute inset-x-0 top-0 h-40 z-[5]" />

      <ChapterOverlay
        key={chapter.id}
        chapter={chapter}
        chapterNumber={state.chapterIndex + 1}
        totalChapters={chapters.length}
      />
      <ChapterRail
        total={chapters.length}
        currentIndex={state.chapterIndex}
        scrubT={state.scrubT}
      />
      <CTAPill />
      <PlayPauseIndicator state={state.name} />
      <StateBadge state={state.name} />

      {/* Screen-reader announcement on chapter change */}
      <div
        ref={liveRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      />
    </main>
  );
}

function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
