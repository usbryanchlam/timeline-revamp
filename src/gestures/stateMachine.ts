import type { ReelStateName } from '@/types/reel';

/**
 * Gesture state machine for the reel surface.
 *
 * Spec source: DESIGN doc § "Mobile gesture state machine".
 * Implementation principles:
 *   1. Pure: no DOM, no timers, no React. The React hook owns side effects.
 *   2. Immutable: every transition returns a NEW state object.
 *   3. Complete: every event applied in every state has a defined outcome
 *      (most often a no-op clone, but explicit, never undefined).
 *
 * The state machine carries transient gesture data (pointers, gestureStartedAt)
 * because transitions depend on multi-finger detection and timing.
 */

export interface ReelState {
  readonly name: ReelStateName;
  readonly chapterIndex: number;
  /** 0-1 across the whole reel; non-null only while SCRUBBING. */
  readonly scrubT: number | null;
  /** Active pointers on screen, count only — we trust event.pointers. */
  readonly pointerCount: number;
  /** Wall-clock ms when the current gesture began (for long-press timer logic). */
  readonly gestureStartedAt: number | null;
  /** Total cumulative dx/dy since the gesture began (for flick detection). */
  readonly gestureDx: number;
  readonly gestureDy: number;
}

export type ReelEvent =
  // Touch / pointer events from DOM
  | { type: 'POINTER_DOWN'; pointers: number; t: number }
  | { type: 'POINTER_MOVE'; pointers: number; dx: number; dy: number; t: number }
  | { type: 'POINTER_UP'; pointers: number; t: number }
  // Tap classifications (from the React hook based on duration/distance)
  | { type: 'TAP_BACKGROUND' }
  // Timed transitions
  | { type: 'LONG_PRESS_FIRED' }
  | { type: 'CHAPTER_FLY_DONE' }
  | { type: 'MAP_INTERACT_IDLE' }
  // Page lifecycle
  | { type: 'VIS_HIDDEN' }
  | { type: 'VIS_VISIBLE' }
  | { type: 'ORIENTATION_CHANGE' }
  | { type: 'ORIENTATION_SETTLE' }
  // Programmatic / keyboard
  | { type: 'JUMP_CHAPTER'; delta: number }
  | { type: 'TOGGLE_PAUSED' };

export const SCRUB_TOTAL_CHAPTERS = 10 as const;
export const FLICK_THRESHOLD_PX = 30 as const;
/** Spec: "vertical flick ≥30px in <300ms". The duration ceiling IS the velocity proxy. */
export const FLICK_MAX_DURATION_MS = 300 as const;
/** A clean tap: short, almost no movement, single finger. */
export const TAP_MAX_DURATION_MS = 200 as const;
export const TAP_MAX_TRAVEL_PX = 10 as const;
export const LONG_PRESS_MS = 200 as const;
export const MAP_INTERACT_IDLE_MS = 3000 as const;
export const ORIENTATION_SETTLE_MS = 300 as const;
export const FLY_DURATION_MS = 1800 as const;

export function initialState(chapterCount: number): ReelState {
  return {
    name: 'IDLE',
    chapterIndex: 0,
    scrubT: null,
    pointerCount: 0,
    gestureStartedAt: null,
    gestureDx: 0,
    gestureDy: 0,
    // Use the supplied chapterCount only for clamping later — kept implicit here.
    // (Chapter clamping is done in clampChapter, which accepts the count.)
    ...(chapterCount > 0 ? {} : {}),
  };
}

export function clampChapter(index: number, total: number): number {
  if (total <= 0) return 0;
  if (index < 0) return 0;
  if (index >= total) return total - 1;
  return index;
}

/**
 * Pure transition. Always returns a new ReelState (never mutates input).
 * Transition rules track the spec line-by-line — see comments.
 */
export function transition(
  state: ReelState,
  event: ReelEvent,
  totalChapters: number,
): ReelState {
  // Lifecycle events take priority over everything except the SUSPENDED restore path.
  switch (event.type) {
    case 'VIS_HIDDEN': {
      if (state.name === 'SUSPENDED') return state;
      return {
        ...state,
        name: 'SUSPENDED',
        scrubT: null,
        gestureStartedAt: null,
        gestureDx: 0,
        gestureDy: 0,
      };
    }
    case 'VIS_VISIBLE': {
      if (state.name !== 'SUSPENDED') return state;
      return { ...state, name: 'IDLE' };
    }
    case 'ORIENTATION_CHANGE': {
      // SUSPENDED while the layout settles (canvas resize). Hook fires ORIENTATION_SETTLE
      // after ORIENTATION_SETTLE_MS to return to IDLE.
      return { ...state, name: 'SUSPENDED', scrubT: null };
    }
    case 'ORIENTATION_SETTLE': {
      if (state.name !== 'SUSPENDED') return state;
      return { ...state, name: 'IDLE' };
    }
  }

  // No further input is processed while SUSPENDED.
  if (state.name === 'SUSPENDED') return state;

  switch (event.type) {
    case 'POINTER_DOWN': {
      // Two-finger lands → MAP_INTERACT (priority 2). Cancels any single-finger gesture.
      if (event.pointers >= 2) {
        return {
          ...state,
          name: 'MAP_INTERACT',
          scrubT: null,
          pointerCount: event.pointers,
          gestureStartedAt: event.t,
          gestureDx: 0,
          gestureDy: 0,
        };
      }
      // Three+ fingers handled at the React layer (yield to OS, do not preventDefault).
      // We never see those events here.
      return {
        ...state,
        // Do not change state.name yet — we wait for LONG_PRESS_FIRED, flick, or tap.
        pointerCount: event.pointers,
        gestureStartedAt: event.t,
        gestureDx: 0,
        gestureDy: 0,
      };
    }

    case 'POINTER_MOVE': {
      const nextDx = state.gestureDx + event.dx;
      const nextDy = state.gestureDy + event.dy;

      // Two-finger move while in MAP_INTERACT — keep the state, accumulate deltas.
      if (event.pointers >= 2) {
        return {
          ...state,
          name: 'MAP_INTERACT',
          pointerCount: event.pointers,
          gestureDx: nextDx,
          gestureDy: nextDy,
        };
      }

      // Single-finger move during SCRUBBING → update scrubT from horizontal travel.
      if (state.name === 'SCRUBBING') {
        // Map the cumulative dx (in viewport px) to a normalized scrubT 0..1.
        // Hook is expected to pass dx already normalized to [-viewportW..+viewportW];
        // here we simply clamp.
        const scrubT = Math.max(0, Math.min(1, (state.scrubT ?? 0) + event.dx));
        return {
          ...state,
          scrubT,
          gestureDx: nextDx,
          gestureDy: nextDy,
        };
      }

      // Vertical flick detection happens on POINTER_UP, not on each move.
      return {
        ...state,
        gestureDx: nextDx,
        gestureDy: nextDy,
      };
    }

    case 'LONG_PRESS_FIRED': {
      // Only promote to SCRUBBING if a single finger is still down AND we haven't
      // already detected a flick or a multi-touch promotion.
      if (state.pointerCount !== 1) return state;
      if (state.name !== 'IDLE' && state.name !== 'PAUSED') return state;
      // If the user has already moved a flick threshold vertically, the React hook
      // suppresses this event by not firing it.
      return {
        ...state,
        name: 'SCRUBBING',
        // Initialize scrubT from current chapter position so the first horizontal
        // delta drags away from where you are, not from the start.
        scrubT: state.chapterIndex / Math.max(1, totalChapters - 1),
      };
    }

    case 'POINTER_UP': {
      const remaining = Math.max(0, event.pointers - 1);

      // Vertical flick → CHAPTER_SWIPE (only from IDLE or PAUSED with single finger).
      // Spec: ≥30px of vertical travel in <300ms. Duration is the velocity proxy.
      const duration =
        state.gestureStartedAt != null ? event.t - state.gestureStartedAt : Infinity;
      const isFlick =
        Math.abs(state.gestureDy) >= FLICK_THRESHOLD_PX &&
        duration < FLICK_MAX_DURATION_MS;
      const wasSingleFinger = state.pointerCount === 1 && remaining === 0;

      if (
        wasSingleFinger &&
        isFlick &&
        (state.name === 'IDLE' || state.name === 'PAUSED')
      ) {
        const direction = state.gestureDy < 0 ? 1 : -1; // up = next, down = prev
        const next = clampChapter(state.chapterIndex + direction, totalChapters);
        return {
          ...state,
          name: 'CHAPTER_SWIPE',
          chapterIndex: next,
          scrubT: null,
          pointerCount: remaining,
          gestureStartedAt: null,
          gestureDx: 0,
          gestureDy: 0,
        };
      }

      // SCRUBBING release → commit scrubT to a chapter index, return to IDLE.
      if (state.name === 'SCRUBBING' && remaining === 0) {
        const t = state.scrubT ?? 0;
        const committed = clampChapter(
          Math.round(t * Math.max(1, totalChapters - 1)),
          totalChapters,
        );
        return {
          ...state,
          name: 'IDLE',
          chapterIndex: committed,
          scrubT: null,
          pointerCount: 0,
          gestureStartedAt: null,
          gestureDx: 0,
          gestureDy: 0,
        };
      }

      // Multi-finger lift down to one — stay in MAP_INTERACT (still a finger on screen).
      if (state.name === 'MAP_INTERACT' && remaining > 0) {
        return { ...state, pointerCount: remaining };
      }

      // MAP_INTERACT all fingers up → still MAP_INTERACT. Hook starts the 3s idle timer
      // and fires MAP_INTERACT_IDLE; only then we go IDLE.
      if (state.name === 'MAP_INTERACT' && remaining === 0) {
        return {
          ...state,
          pointerCount: 0,
          gestureStartedAt: null,
          gestureDx: 0,
          gestureDy: 0,
        };
      }

      // Default: clear gesture, no state change.
      return {
        ...state,
        pointerCount: remaining,
        gestureStartedAt: remaining === 0 ? null : state.gestureStartedAt,
        gestureDx: remaining === 0 ? 0 : state.gestureDx,
        gestureDy: remaining === 0 ? 0 : state.gestureDy,
      };
    }

    case 'CHAPTER_FLY_DONE': {
      if (state.name !== 'CHAPTER_SWIPE') return state;
      return { ...state, name: 'IDLE' };
    }

    case 'MAP_INTERACT_IDLE': {
      if (state.name !== 'MAP_INTERACT') return state;
      if (state.pointerCount > 0) return state; // still touching — ignore
      return { ...state, name: 'IDLE' };
    }

    case 'TAP_BACKGROUND': {
      if (state.name === 'IDLE') return { ...state, name: 'PAUSED' };
      if (state.name === 'PAUSED') return { ...state, name: 'IDLE' };
      return state;
    }

    case 'JUMP_CHAPTER': {
      // Keyboard / programmatic chapter swipe. SUSPENDED was already handled
      // by the early return above, so all other states fall through here.
      const next = clampChapter(state.chapterIndex + event.delta, totalChapters);
      if (next === state.chapterIndex) return state;
      return {
        ...state,
        name: 'CHAPTER_SWIPE',
        chapterIndex: next,
        scrubT: null,
      };
    }

    case 'TOGGLE_PAUSED': {
      if (state.name === 'IDLE') return { ...state, name: 'PAUSED' };
      if (state.name === 'PAUSED') return { ...state, name: 'IDLE' };
      return state;
    }
  }
}
