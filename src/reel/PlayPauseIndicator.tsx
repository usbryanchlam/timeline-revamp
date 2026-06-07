import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ReelStateName } from '@/types/reel';

interface Props {
  readonly state: ReelStateName;
}

type TransientGlyph = 'play' | 'pause';

/** How long the transient center icon stays visible before fading out. */
const TRANSIENT_DURATION_MS = 800;

/**
 * Visual feedback for the IDLE ↔ PAUSED toggle. Two layers:
 *
 *   1. Transient center confirmation — when the visitor taps to pause or
 *      resume, the corresponding outline icon fades in at center-screen,
 *      holds briefly, then fades out. Confirms the tap landed without
 *      requiring the visitor to wait for the next auto-advance.
 *
 *   2. Persistent PAUSED hint — a small outline pause glyph in the bottom-
 *      left while the reel is paused. Without it, someone who taps and walks
 *      away comes back to a frozen reel with no signal as to why.
 *
 *   IDLE is the default ambient state and gets no persistent marker. The
 *   CHAPTER_SWIPE flight motion is itself sufficient signal of "playing";
 *   no icon shown there.
 *
 *   Color is neutral white (text-ink) — the amber accent is reserved for
 *   the brand pin / rail (DESIGN.md "single amber accent" rule).
 */
export function PlayPauseIndicator({ state }: Props) {
  const prevStateRef = useRef<ReelStateName>(state);
  const [transient, setTransient] = useState<TransientGlyph | null>(null);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;

    // Only the IDLE ↔ PAUSED toggle triggers a transient confirmation.
    // Other transitions (CHAPTER_SWIPE, SUSPENDED, etc.) have their own
    // visual signals (camera flight, page lifecycle) and need no extra UI.
    let glyph: TransientGlyph | null = null;
    if (prev === 'IDLE' && state === 'PAUSED') glyph = 'pause';
    else if (prev === 'PAUSED' && state === 'IDLE') glyph = 'play';

    if (glyph === null) return;
    setTransient(glyph);
    const timer = window.setTimeout(
      () => setTransient(null),
      TRANSIENT_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <>
      {/* Layer 1: transient center confirmation on tap. */}
      <AnimatePresence>
        {transient !== null && (
          <motion.div
            key={transient}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-ink"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.08 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            aria-hidden="true"
            data-testid="play-pause-transient"
          >
            {transient === 'play' ? <PlayGlyph size={64} /> : <PauseGlyph size={64} />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Layer 2: persistent PAUSED hint, bottom-left. */}
      <AnimatePresence>
        {state === 'PAUSED' && (
          <motion.div
            className="pointer-events-none absolute z-20 left-4 text-ink-dim"
            style={{
              bottom: 'calc(max(env(safe-area-inset-bottom), 32px) + 16px)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            role="status"
            aria-label="Reel paused"
            data-testid="play-pause-persistent"
          >
            <PauseGlyph size={18} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

interface GlyphProps {
  readonly size: number;
}

function PlayGlyph({ size }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M8 5 L20 12 L8 19 Z" />
    </svg>
  );
}

function PauseGlyph({ size }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}
