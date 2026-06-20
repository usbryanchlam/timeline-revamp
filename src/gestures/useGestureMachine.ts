import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  FLICK_THRESHOLD_PX,
  FLY_DURATION_MS,
  initialState,
  LONG_PRESS_MS,
  MAP_INTERACT_IDLE_MS,
  ORIENTATION_SETTLE_MS,
  TAP_MAX_DURATION_MS,
  TAP_MAX_TRAVEL_PX,
  transition,
  type ReelEvent,
  type ReelState,
} from './stateMachine';
import { AUTOPLAY_DWELL_MS } from '@/reel/timing';

interface PointerSample {
  readonly id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startT: number;
  lastX: number;
  lastY: number;
  lastT: number;
}

interface Options {
  readonly totalChapters: number;
  /** ms a chapter dwells in IDLE auto-play before advancing. */
  readonly autoPlayDwellMs?: number;
  /**
   * A11Y-08: Enter key opens the photo detail sheet. The state machine does
   * not own detail-sheet state — this callback is invoked by the keyboard
   * handler so the Reel component can open the sheet via its own state. The
   * matching no-op OPEN_DETAIL event is still dispatched into the state
   * machine for event-union completeness (downstream consumers may observe
   * the dispatch via a custom middleware).
   */
  readonly onOpenDetail?: () => void;
}

interface Result {
  readonly state: ReelState;
  readonly dispatch: (event: ReelEvent) => void;
  readonly bind: (el: HTMLElement | null) => void;
}

/**
 * useGestureMachine — wires PointerEvents + page lifecycle to the pure state machine.
 *
 * Returns a `bind` ref-callback to attach to the reel container, the current
 * `state`, and a `dispatch` for programmatic events (keyboard, MapLibre's own
 * `moveend` on user-initiated pan, etc.).
 *
 * Side effects this hook owns:
 *   - long-press timer (200 ms)
 *   - chapter-fly-done timer (1800 ms after a CHAPTER_SWIPE)
 *   - map-interact-idle timer (3000 ms after MAP_INTERACT pointerup)
 *   - orientation-settle timer (300 ms)
 *   - auto-play tick in IDLE
 *   - visibilitychange / orientationchange listeners
 */
export function useGestureMachine({
  totalChapters,
  autoPlayDwellMs = AUTOPLAY_DWELL_MS,
  onOpenDetail,
}: Options): Result {
  const [state, baseDispatch] = useReducer(
    (s: ReelState, e: ReelEvent) => transition(s, e, totalChapters),
    totalChapters,
    initialState,
  );

  // Mutable refs for transient gesture data the state machine doesn't carry.
  const pointersRef = useRef<Map<number, PointerSample>>(new Map());
  const longPressTimerRef = useRef<number | null>(null);
  const flyDoneTimerRef = useRef<number | null>(null);
  const mapIdleTimerRef = useRef<number | null>(null);
  const orientationTimerRef = useRef<number | null>(null);
  const autoPlayTimerRef = useRef<number | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  // Latest state for use inside imperative event handlers without re-binding.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Latest onOpenDetail callback. Held in a ref so the keydown listener does
  // not need to re-register every time the consumer passes a new function
  // identity (typical when the consumer is a function component without
  // useCallback). The Reel component owns the photo detail sheet's open
  // state; this ref lets the listener invoke the consumer's latest handler.
  const onOpenDetailRef = useRef(onOpenDetail);
  onOpenDetailRef.current = onOpenDetail;

  const clear = (ref: React.MutableRefObject<number | null>) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const dispatch = useCallback((event: ReelEvent) => {
    baseDispatch(event);
  }, []);

  // --- Long-press timer ----------------------------------------------------
  const armLongPress = useCallback(() => {
    clear(longPressTimerRef);
    longPressTimerRef.current = window.setTimeout(() => {
      // Only fire if a single finger is still down AND the user hasn't already
      // moved enough to count as a flick.
      const samples = pointersRef.current;
      if (samples.size !== 1) return;
      const [sample] = samples.values();
      if (!sample) return;
      const dy = Math.abs(sample.lastY - sample.startY);
      if (dy >= FLICK_THRESHOLD_PX) return;
      dispatch({ type: 'LONG_PRESS_FIRED' });
    }, LONG_PRESS_MS);
  }, [dispatch]);

  // --- Pointer event handlers ----------------------------------------------
  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      // Only count primary pointer types we care about. (mouse/touch/pen.)
      // Ignore pointers that originated outside our element — pointerdown is
      // attached to the element, so we can trust them.
      // Yield to OS for 3+ fingers (accessibility gestures). Do not preventDefault.
      const wouldBeCount = pointersRef.current.size + 1;
      if (wouldBeCount >= 3) {
        pointersRef.current.clear();
        clear(longPressTimerRef);
        return;
      }

      pointersRef.current.set(e.pointerId, {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        startT: e.timeStamp,
        lastX: e.clientX,
        lastY: e.clientY,
        lastT: e.timeStamp,
      });

      const count = pointersRef.current.size;
      dispatch({ type: 'POINTER_DOWN', pointers: count, t: e.timeStamp });

      if (count === 1) {
        armLongPress();
      } else {
        clear(longPressTimerRef);
      }
    },
    [armLongPress, dispatch],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      // Window-level listener — only react to pointers we already started
      // tracking via pointerdown on the reel element.
      const sample = pointersRef.current.get(e.pointerId);
      if (!sample) return;
      const dx = e.clientX - sample.lastX;
      const dy = e.clientY - sample.lastY;
      sample.lastX = e.clientX;
      sample.lastY = e.clientY;
      sample.lastT = e.timeStamp;
      sample.x = e.clientX;
      sample.y = e.clientY;

      const count = pointersRef.current.size;
      const viewportW = elRef.current?.clientWidth ?? window.innerWidth;
      // For SCRUBBING the state machine treats dx as fraction-of-viewport.
      const normalizedDx = count === 1 ? dx / Math.max(1, viewportW) : dx;
      dispatch({
        type: 'POINTER_MOVE',
        pointers: count,
        dx: normalizedDx,
        dy,
        t: e.timeStamp,
      });

      // Cancel long-press if user has moved more than the flick threshold vertically.
      if (count === 1 && Math.abs(sample.lastY - sample.startY) >= FLICK_THRESHOLD_PX) {
        clear(longPressTimerRef);
      }
    },
    [dispatch],
  );

  const onPointerUpOrCancel = useCallback(
    (e: PointerEvent) => {
      const sample = pointersRef.current.get(e.pointerId);
      // Pointer not tracked by us — likely started outside the reel. Ignore.
      if (!sample) return;
      pointersRef.current.delete(e.pointerId);
      const remaining = pointersRef.current.size;

      // Detect a clean tap before we dispatch — if it was, we'll route to
      // TAP_BACKGROUND instead of just POINTER_UP. A clean tap is:
      // single-finger gesture, short duration, no real movement.
      const duration = e.timeStamp - sample.startT;
      const travel = Math.hypot(
        sample.lastX - sample.startX,
        sample.lastY - sample.startY,
      );
      const isCleanTap =
        remaining === 0 &&
        duration < TAP_MAX_DURATION_MS &&
        travel < TAP_MAX_TRAVEL_PX &&
        // Only trip the tap if we never promoted to SCRUBBING / MAP_INTERACT.
        (stateRef.current.name === 'IDLE' ||
          stateRef.current.name === 'PAUSED');

      dispatch({
        type: 'POINTER_UP',
        pointers: remaining + 1, // pointers count BEFORE this lift
        t: e.timeStamp,
      });

      if (isCleanTap) {
        dispatch({ type: 'TAP_BACKGROUND' });
      }

      if (remaining === 0) {
        clear(longPressTimerRef);
      }
    },
    [dispatch],
  );

  // --- Bind to element -----------------------------------------------------
  // pointerdown lives on the element so we only start tracking gestures that
  // begin INSIDE the reel surface. pointermove/up/cancel live on the window
  // with capture: true so MapLibre's internal setPointerCapture can't swallow
  // them while in MAP_INTERACT — otherwise pointerCount would never decrement
  // and we'd be stuck in MAP_INTERACT forever.
  const bind = useCallback(
    (el: HTMLElement | null) => {
      const prev = elRef.current;
      if (prev) prev.removeEventListener('pointerdown', onPointerDown);
      elRef.current = el;
      if (el) el.addEventListener('pointerdown', onPointerDown, { passive: true });
    },
    [onPointerDown],
  );

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
    window.addEventListener('pointerup', onPointerUpOrCancel, { capture: true, passive: true });
    window.addEventListener('pointercancel', onPointerUpOrCancel, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove, { capture: true } as EventListenerOptions);
      window.removeEventListener('pointerup', onPointerUpOrCancel, { capture: true } as EventListenerOptions);
      window.removeEventListener('pointercancel', onPointerUpOrCancel, { capture: true } as EventListenerOptions);
    };
  }, [onPointerMove, onPointerUpOrCancel]);

  // --- Page lifecycle listeners (mounted once) -----------------------------
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        dispatch({ type: 'VIS_HIDDEN' });
      } else {
        dispatch({ type: 'VIS_VISIBLE' });
      }
    };
    const onOrientation = () => {
      dispatch({ type: 'ORIENTATION_CHANGE' });
      clear(orientationTimerRef);
      orientationTimerRef.current = window.setTimeout(() => {
        dispatch({ type: 'ORIENTATION_SETTLE' });
      }, ORIENTATION_SETTLE_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_PAUSED' });
      } else if (e.key === 'ArrowRight') {
        dispatch({ type: 'JUMP_CHAPTER', delta: 1 });
      } else if (e.key === 'ArrowLeft') {
        dispatch({ type: 'JUMP_CHAPTER', delta: -1 });
      } else if (e.key === 'ArrowUp') {
        dispatch({ type: 'JUMP_CHAPTER', delta: -1 });
      } else if (e.key === 'ArrowDown') {
        dispatch({ type: 'JUMP_CHAPTER', delta: 1 });
      } else if (e.key === 'Enter') {
        // A11Y-08: Enter opens the photo detail sheet. We dispatch the no-op
        // OPEN_DETAIL event for event-union completeness AND invoke the
        // consumer's onOpenDetail callback (the Reel component owns the
        // sheet's open state). If no callback was provided, the dispatch is
        // a silent no-op — keyboard users hit Enter, nothing breaks.
        dispatch({ type: 'OPEN_DETAIL' });
        onOpenDetailRef.current?.();
      }
    };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('orientationchange', onOrientation);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('orientationchange', onOrientation);
      window.removeEventListener('keydown', onKey);
      clear(orientationTimerRef);
    };
  }, [dispatch]);

  // --- State-driven side-effect timers -------------------------------------
  // CHAPTER_SWIPE: fire CHAPTER_FLY_DONE after the camera animation duration.
  // Deps intentionally exclude pointerCount — a finger touching the screen
  // mid-flight must NOT restart the timer, else the flight feels "hung"
  // when the user impatiently swipes again before landing. chapterIndex
  // IS a dep so back-to-back JUMP_CHAPTER events (already in CHAPTER_SWIPE,
  // retargeting) restart the fly-done countdown for the new destination.
  useEffect(() => {
    if (state.name === 'CHAPTER_SWIPE') {
      clear(flyDoneTimerRef);
      flyDoneTimerRef.current = window.setTimeout(() => {
        dispatch({ type: 'CHAPTER_FLY_DONE' });
      }, FLY_DURATION_MS);
    } else {
      clear(flyDoneTimerRef);
    }
  }, [state.name, state.chapterIndex, dispatch]);

  // MAP_INTERACT with all fingers up: 3s idle to return to IDLE. This one
  // DOES depend on pointerCount — the transition from "still touching" to
  // "all fingers up" is what starts the idle countdown.
  useEffect(() => {
    if (state.name === 'MAP_INTERACT' && state.pointerCount === 0) {
      clear(mapIdleTimerRef);
      mapIdleTimerRef.current = window.setTimeout(() => {
        dispatch({ type: 'MAP_INTERACT_IDLE' });
      }, MAP_INTERACT_IDLE_MS);
    } else {
      clear(mapIdleTimerRef);
    }
  }, [state.name, state.pointerCount, dispatch]);

  // --- Auto-play tick (only in IDLE) ---------------------------------------
  useEffect(() => {
    if (state.name !== 'IDLE') {
      clear(autoPlayTimerRef);
      return;
    }
    clear(autoPlayTimerRef);
    autoPlayTimerRef.current = window.setTimeout(() => {
      // Wrap to the start when reaching the end so the loop demos forever.
      const next = state.chapterIndex + 1 >= totalChapters ? 0 : state.chapterIndex + 1;
      dispatch({
        type: 'JUMP_CHAPTER',
        delta: next - state.chapterIndex,
      });
    }, autoPlayDwellMs);
    return () => clear(autoPlayTimerRef);
  }, [state.name, state.chapterIndex, totalChapters, autoPlayDwellMs, dispatch]);

  // --- Cleanup all timers on unmount ---------------------------------------
  useEffect(() => {
    return () => {
      clear(longPressTimerRef);
      clear(flyDoneTimerRef);
      clear(mapIdleTimerRef);
      clear(orientationTimerRef);
      clear(autoPlayTimerRef);
    };
  }, []);

  return { state, dispatch, bind };
}
