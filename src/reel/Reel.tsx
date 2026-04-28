import { useCallback, useEffect, useRef } from 'react';
import { SEEDED_CITIES } from '@/data/seeded-cities';
import { useGestureMachine } from '@/gestures/useGestureMachine';
import { MapCanvas } from './MapCanvas';
import { ChapterOverlay } from './ChapterOverlay';
import { ChapterRail } from './ChapterRail';
import { CTAPill } from './CTAPill';
import { StateBadge } from './StateBadge';

/**
 * Full-bleed cinematic reel. Single route, no router yet. Owns:
 *   - the gesture state machine (single source of truth for chapter index)
 *   - the MapLibre canvas (driven by chapterIndex / stateName)
 *   - the overlay stack (chapter content, rail, CTA, state badge)
 *
 * The aria-live region announces chapter changes for AT users; the visual
 * surface is `role="region"` (NOT application — see DESIGN doc rationale).
 */
export function Reel() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { state, bind } = useGestureMachine({
    totalChapters: SEEDED_CITIES.length,
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

  // Aria-live announcement on chapter change.
  const liveRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const c = SEEDED_CITIES[state.chapterIndex];
    if (c && liveRef.current) {
      liveRef.current.textContent = `${c.name}, ${formatMonthYear(c.arrivedAt)}`;
    }
  }, [state.chapterIndex]);

  const chapter = SEEDED_CITIES[state.chapterIndex];
  if (!chapter) return null;

  return (
    <main
      ref={setContainer}
      className="reel-root relative bg-bg"
      role="region"
      aria-label="Travel reel"
    >
      <MapCanvas
        chapters={SEEDED_CITIES}
        chapterIndex={state.chapterIndex}
        stateName={state.name}
        onUserMapInteract={onUserMapInteract}
      />

      {/* Top scrim for legibility of CTA + state badge */}
      <div className="scrim-top pointer-events-none absolute inset-x-0 top-0 h-40 z-[5]" />

      <ChapterOverlay
        key={chapter.id}
        chapter={chapter}
        chapterNumber={state.chapterIndex + 1}
        totalChapters={SEEDED_CITIES.length}
      />
      <ChapterRail
        total={SEEDED_CITIES.length}
        currentIndex={state.chapterIndex}
        scrubT={state.scrubT}
      />
      <CTAPill />
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
