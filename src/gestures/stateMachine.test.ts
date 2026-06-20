import {
  initialState,
  transition,
  clampChapter,
  type ReelState,
} from '@/gestures/stateMachine';

const TOTAL = 10;

function withState(overrides: Partial<ReelState>): ReelState {
  return { ...initialState(TOTAL), ...overrides };
}

describe('initialState', () => {
  it('returns IDLE with chapterIndex=0', () => {
    const s = initialState(TOTAL);
    expect(s.name).toBe('IDLE');
    expect(s.chapterIndex).toBe(0);
    expect(s.scrubT).toBeNull();
    expect(s.pointerCount).toBe(0);
    expect(s.gestureStartedAt).toBeNull();
    expect(s.gestureDx).toBe(0);
    expect(s.gestureDy).toBe(0);
  });

  it('handles chapterCount=0 without throwing', () => {
    const s = initialState(0);
    expect(s.name).toBe('IDLE');
  });
});

describe('clampChapter', () => {
  it('clamps below 0 to 0', () => {
    expect(clampChapter(-3, 10)).toBe(0);
  });

  it('clamps above total-1 to total-1', () => {
    expect(clampChapter(20, 10)).toBe(9);
  });

  it('passes through valid index', () => {
    expect(clampChapter(5, 10)).toBe(5);
  });

  it('returns 0 when total <= 0', () => {
    expect(clampChapter(5, 0)).toBe(0);
    expect(clampChapter(5, -1)).toBe(0);
  });
});

describe('VIS_HIDDEN', () => {
  it('IDLE → SUSPENDED', () => {
    const s = withState({ name: 'IDLE' });
    const next = transition(s, { type: 'VIS_HIDDEN' }, TOTAL);
    expect(next.name).toBe('SUSPENDED');
    expect(next.scrubT).toBeNull();
  });

  it('SCRUBBING → SUSPENDED, clears scrubT', () => {
    const s = withState({ name: 'SCRUBBING', scrubT: 0.5 });
    const next = transition(s, { type: 'VIS_HIDDEN' }, TOTAL);
    expect(next.name).toBe('SUSPENDED');
    expect(next.scrubT).toBeNull();
  });

  it('MAP_INTERACT → SUSPENDED', () => {
    const s = withState({ name: 'MAP_INTERACT', pointerCount: 2 });
    const next = transition(s, { type: 'VIS_HIDDEN' }, TOTAL);
    expect(next.name).toBe('SUSPENDED');
  });

  it('PAUSED → SUSPENDED', () => {
    const s = withState({ name: 'PAUSED' });
    const next = transition(s, { type: 'VIS_HIDDEN' }, TOTAL);
    expect(next.name).toBe('SUSPENDED');
  });

  it('SUSPENDED → SUSPENDED (no-op identity)', () => {
    const s = withState({ name: 'SUSPENDED' });
    const next = transition(s, { type: 'VIS_HIDDEN' }, TOTAL);
    expect(next).toBe(s);
  });
});

describe('VIS_VISIBLE', () => {
  it('SUSPENDED → IDLE', () => {
    const s = withState({ name: 'SUSPENDED' });
    const next = transition(s, { type: 'VIS_VISIBLE' }, TOTAL);
    expect(next.name).toBe('IDLE');
  });

  it('IDLE is no-op (returns same state ref)', () => {
    const s = withState({ name: 'IDLE' });
    const next = transition(s, { type: 'VIS_VISIBLE' }, TOTAL);
    expect(next).toBe(s);
  });

  it('SCRUBBING is no-op', () => {
    const s = withState({ name: 'SCRUBBING' });
    const next = transition(s, { type: 'VIS_VISIBLE' }, TOTAL);
    expect(next).toBe(s);
  });
});

describe('ORIENTATION_CHANGE', () => {
  it('IDLE → SUSPENDED, scrubT cleared', () => {
    const s = withState({ name: 'IDLE', scrubT: 0.4 });
    const next = transition(s, { type: 'ORIENTATION_CHANGE' }, TOTAL);
    expect(next.name).toBe('SUSPENDED');
    expect(next.scrubT).toBeNull();
  });

  it('SCRUBBING → SUSPENDED, scrubT cleared', () => {
    const s = withState({ name: 'SCRUBBING', scrubT: 0.7 });
    const next = transition(s, { type: 'ORIENTATION_CHANGE' }, TOTAL);
    expect(next.name).toBe('SUSPENDED');
    expect(next.scrubT).toBeNull();
  });

  it('MAP_INTERACT → SUSPENDED', () => {
    const s = withState({ name: 'MAP_INTERACT' });
    const next = transition(s, { type: 'ORIENTATION_CHANGE' }, TOTAL);
    expect(next.name).toBe('SUSPENDED');
  });
});

describe('ORIENTATION_SETTLE', () => {
  it('SUSPENDED → IDLE', () => {
    const s = withState({ name: 'SUSPENDED' });
    const next = transition(s, { type: 'ORIENTATION_SETTLE' }, TOTAL);
    expect(next.name).toBe('IDLE');
  });

  it('IDLE is no-op', () => {
    const s = withState({ name: 'IDLE' });
    const next = transition(s, { type: 'ORIENTATION_SETTLE' }, TOTAL);
    expect(next).toBe(s);
  });

  it('SCRUBBING is no-op', () => {
    const s = withState({ name: 'SCRUBBING' });
    const next = transition(s, { type: 'ORIENTATION_SETTLE' }, TOTAL);
    expect(next).toBe(s);
  });
});

describe('SUSPENDED swallows other events', () => {
  it('POINTER_DOWN ignored while SUSPENDED', () => {
    const s = withState({ name: 'SUSPENDED' });
    const next = transition(
      s,
      { type: 'POINTER_DOWN', pointers: 1, t: 100 },
      TOTAL,
    );
    expect(next).toBe(s);
  });

  it('JUMP_CHAPTER ignored while SUSPENDED', () => {
    const s = withState({ name: 'SUSPENDED', chapterIndex: 3 });
    const next = transition(s, { type: 'JUMP_CHAPTER', delta: 1 }, TOTAL);
    expect(next).toBe(s);
  });
});

describe('POINTER_DOWN', () => {
  it('1-finger from IDLE: stays IDLE name, sets pointerCount=1, gestureStartedAt set', () => {
    const s = withState({ name: 'IDLE' });
    const next = transition(
      s,
      { type: 'POINTER_DOWN', pointers: 1, t: 1000 },
      TOTAL,
    );
    expect(next.name).toBe('IDLE');
    expect(next.pointerCount).toBe(1);
    expect(next.gestureStartedAt).toBe(1000);
    expect(next.gestureDx).toBe(0);
    expect(next.gestureDy).toBe(0);
  });

  it('2-finger from IDLE → MAP_INTERACT, pointerCount=2', () => {
    const s = withState({ name: 'IDLE' });
    const next = transition(
      s,
      { type: 'POINTER_DOWN', pointers: 2, t: 1000 },
      TOTAL,
    );
    expect(next.name).toBe('MAP_INTERACT');
    expect(next.pointerCount).toBe(2);
    expect(next.gestureStartedAt).toBe(1000);
  });

  it('2-finger from SCRUBBING → MAP_INTERACT, scrubT cleared', () => {
    const s = withState({ name: 'SCRUBBING', scrubT: 0.5, pointerCount: 1 });
    const next = transition(
      s,
      { type: 'POINTER_DOWN', pointers: 2, t: 2000 },
      TOTAL,
    );
    expect(next.name).toBe('MAP_INTERACT');
    expect(next.scrubT).toBeNull();
    expect(next.pointerCount).toBe(2);
  });

  it('2-finger from PAUSED → MAP_INTERACT', () => {
    const s = withState({ name: 'PAUSED' });
    const next = transition(
      s,
      { type: 'POINTER_DOWN', pointers: 2, t: 1500 },
      TOTAL,
    );
    expect(next.name).toBe('MAP_INTERACT');
    expect(next.pointerCount).toBe(2);
  });
});

describe('LONG_PRESS_FIRED', () => {
  it('1-finger held in IDLE → SCRUBBING with scrubT initialized to chapterIndex/(total-1)', () => {
    const s = withState({ name: 'IDLE', pointerCount: 1, chapterIndex: 3 });
    const next = transition(s, { type: 'LONG_PRESS_FIRED' }, TOTAL);
    expect(next.name).toBe('SCRUBBING');
    expect(next.scrubT).toBeCloseTo(3 / 9);
  });

  it('1-finger held in PAUSED → SCRUBBING', () => {
    const s = withState({ name: 'PAUSED', pointerCount: 1, chapterIndex: 0 });
    const next = transition(s, { type: 'LONG_PRESS_FIRED' }, TOTAL);
    expect(next.name).toBe('SCRUBBING');
    expect(next.scrubT).toBe(0);
  });

  it('From CHAPTER_SWIPE: no-op', () => {
    const s = withState({ name: 'CHAPTER_SWIPE', pointerCount: 1 });
    const next = transition(s, { type: 'LONG_PRESS_FIRED' }, TOTAL);
    expect(next).toBe(s);
  });

  it('From MAP_INTERACT: no-op', () => {
    const s = withState({ name: 'MAP_INTERACT', pointerCount: 1 });
    const next = transition(s, { type: 'LONG_PRESS_FIRED' }, TOTAL);
    expect(next).toBe(s);
  });

  it('With pointerCount !== 1: no-op (0 fingers)', () => {
    const s = withState({ name: 'IDLE', pointerCount: 0 });
    const next = transition(s, { type: 'LONG_PRESS_FIRED' }, TOTAL);
    expect(next).toBe(s);
  });

  it('With pointerCount !== 1: no-op (2 fingers)', () => {
    const s = withState({ name: 'IDLE', pointerCount: 2 });
    const next = transition(s, { type: 'LONG_PRESS_FIRED' }, TOTAL);
    expect(next).toBe(s);
  });

  it('totalChapters=1 guards against division-by-zero (uses Math.max(1, total-1))', () => {
    const s = withState({ name: 'IDLE', pointerCount: 1, chapterIndex: 0 });
    const next = transition(s, { type: 'LONG_PRESS_FIRED' }, 1);
    expect(next.name).toBe('SCRUBBING');
    expect(next.scrubT).toBe(0);
  });
});

describe('POINTER_MOVE', () => {
  it('In SCRUBBING with single finger: scrubT updates from event.dx, clamped to 0..1 (lower)', () => {
    const s = withState({ name: 'SCRUBBING', scrubT: 0.5, pointerCount: 1 });
    const next = transition(
      s,
      { type: 'POINTER_MOVE', pointers: 1, dx: -0.8, dy: 0, t: 100 },
      TOTAL,
    );
    expect(next.name).toBe('SCRUBBING');
    expect(next.scrubT).toBe(0);
  });

  it('In SCRUBBING: scrubT clamped to 1 (upper)', () => {
    const s = withState({ name: 'SCRUBBING', scrubT: 0.9, pointerCount: 1 });
    const next = transition(
      s,
      { type: 'POINTER_MOVE', pointers: 1, dx: 0.5, dy: 0, t: 100 },
      TOTAL,
    );
    expect(next.scrubT).toBe(1);
  });

  it('In SCRUBBING: scrubT updated within range', () => {
    const s = withState({ name: 'SCRUBBING', scrubT: 0.3, pointerCount: 1 });
    const next = transition(
      s,
      { type: 'POINTER_MOVE', pointers: 1, dx: 0.2, dy: 0, t: 100 },
      TOTAL,
    );
    expect(next.scrubT).toBeCloseTo(0.5);
  });

  it('In SCRUBBING with null scrubT: defaults to 0 then adds dx', () => {
    const s = withState({ name: 'SCRUBBING', scrubT: null, pointerCount: 1 });
    const next = transition(
      s,
      { type: 'POINTER_MOVE', pointers: 1, dx: 0.4, dy: 0, t: 100 },
      TOTAL,
    );
    expect(next.scrubT).toBeCloseTo(0.4);
  });

  it('In MAP_INTERACT with 2 fingers: stays MAP_INTERACT, accumulates dx/dy', () => {
    const s = withState({
      name: 'MAP_INTERACT',
      pointerCount: 2,
      gestureDx: 5,
      gestureDy: 10,
    });
    const next = transition(
      s,
      { type: 'POINTER_MOVE', pointers: 2, dx: 3, dy: 4, t: 100 },
      TOTAL,
    );
    expect(next.name).toBe('MAP_INTERACT');
    expect(next.gestureDx).toBe(8);
    expect(next.gestureDy).toBe(14);
    expect(next.pointerCount).toBe(2);
  });

  it('In IDLE with 1 finger: accumulates dx/dy, doesn\'t change state', () => {
    const s = withState({ name: 'IDLE', pointerCount: 1, gestureDy: -5 });
    const next = transition(
      s,
      { type: 'POINTER_MOVE', pointers: 1, dx: 2, dy: -10, t: 100 },
      TOTAL,
    );
    expect(next.name).toBe('IDLE');
    expect(next.gestureDx).toBe(2);
    expect(next.gestureDy).toBe(-15);
  });

  it('Promotes to MAP_INTERACT if a 2-finger move arrives mid-IDLE', () => {
    const s = withState({ name: 'IDLE', pointerCount: 1 });
    const next = transition(
      s,
      { type: 'POINTER_MOVE', pointers: 2, dx: 1, dy: 1, t: 100 },
      TOTAL,
    );
    expect(next.name).toBe('MAP_INTERACT');
    expect(next.pointerCount).toBe(2);
  });
});

describe('POINTER_UP — flick path', () => {
  it('IDLE upward flick (gestureDy < -30, duration < 300ms) → CHAPTER_SWIPE chapterIndex+1', () => {
    const s = withState({
      name: 'IDLE',
      pointerCount: 1,
      chapterIndex: 2,
      gestureDy: -50,
      gestureStartedAt: 1000,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 1100 },
      TOTAL,
    );
    expect(next.name).toBe('CHAPTER_SWIPE');
    expect(next.chapterIndex).toBe(3);
    expect(next.pointerCount).toBe(0);
  });

  it('IDLE downward flick (gestureDy > 30, duration < 300ms) → CHAPTER_SWIPE chapterIndex-1', () => {
    const s = withState({
      name: 'IDLE',
      pointerCount: 1,
      chapterIndex: 5,
      gestureDy: 40,
      gestureStartedAt: 1000,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 1100 },
      TOTAL,
    );
    expect(next.name).toBe('CHAPTER_SWIPE');
    expect(next.chapterIndex).toBe(4);
  });

  it('Upward flick at last chapter: clamps at total-1', () => {
    const s = withState({
      name: 'IDLE',
      pointerCount: 1,
      chapterIndex: 9,
      gestureDy: -100,
      gestureStartedAt: 1000,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 1100 },
      TOTAL,
    );
    expect(next.name).toBe('CHAPTER_SWIPE');
    expect(next.chapterIndex).toBe(9);
  });

  it('Downward flick at chapter 0: clamps at 0', () => {
    const s = withState({
      name: 'IDLE',
      pointerCount: 1,
      chapterIndex: 0,
      gestureDy: 100,
      gestureStartedAt: 1000,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 1100 },
      TOTAL,
    );
    expect(next.name).toBe('CHAPTER_SWIPE');
    expect(next.chapterIndex).toBe(0);
  });

  it('Slow drag (gestureDy >= 30 BUT duration >= 300ms): NOT a flick, stays IDLE', () => {
    const s = withState({
      name: 'IDLE',
      pointerCount: 1,
      chapterIndex: 2,
      gestureDy: 50,
      gestureStartedAt: 1000,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 1500 },
      TOTAL,
    );
    expect(next.name).toBe('IDLE');
    expect(next.chapterIndex).toBe(2);
  });

  it('Small motion (|gestureDy| < 30): NOT a flick', () => {
    const s = withState({
      name: 'IDLE',
      pointerCount: 1,
      gestureDy: 10,
      gestureStartedAt: 1000,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 1100 },
      TOTAL,
    );
    expect(next.name).toBe('IDLE');
  });

  it('PAUSED upward flick → CHAPTER_SWIPE', () => {
    const s = withState({
      name: 'PAUSED',
      pointerCount: 1,
      chapterIndex: 1,
      gestureDy: -40,
      gestureStartedAt: 1000,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 1100 },
      TOTAL,
    );
    expect(next.name).toBe('CHAPTER_SWIPE');
    expect(next.chapterIndex).toBe(2);
  });

  it('CHAPTER_SWIPE mid-flight up-flick: retargets to chapterIndex+1', () => {
    const s = withState({
      name: 'CHAPTER_SWIPE',
      pointerCount: 1,
      chapterIndex: 3,
      gestureDy: -50,
      gestureStartedAt: 1000,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 1100 },
      TOTAL,
    );
    expect(next.name).toBe('CHAPTER_SWIPE');
    expect(next.chapterIndex).toBe(4);
    // gesture deltas reset so the next flick measurement starts clean
    expect(next.gestureDy).toBe(0);
    expect(next.gestureStartedAt).toBeNull();
  });

  it('CHAPTER_SWIPE mid-flight down-flick: retargets to chapterIndex-1 (cancels back)', () => {
    const s = withState({
      name: 'CHAPTER_SWIPE',
      pointerCount: 1,
      chapterIndex: 3,
      gestureDy: 50,
      gestureStartedAt: 1000,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 1100 },
      TOTAL,
    );
    expect(next.name).toBe('CHAPTER_SWIPE');
    expect(next.chapterIndex).toBe(2);
  });

  it('CHAPTER_SWIPE up-flick at last chapter: clamps, chapterIndex unchanged', () => {
    const s = withState({
      name: 'CHAPTER_SWIPE',
      pointerCount: 1,
      chapterIndex: TOTAL - 1,
      gestureDy: -50,
      gestureStartedAt: 1000,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 1100 },
      TOTAL,
    );
    // Stays CHAPTER_SWIPE but chapterIndex doesn't advance — useEffect
    // watching chapterIndex won't restart the fly-done timer.
    expect(next.name).toBe('CHAPTER_SWIPE');
    expect(next.chapterIndex).toBe(TOTAL - 1);
  });

  it('MAP_INTERACT 1→0 fingers with flick deltas: stays MAP_INTERACT (not eligible for flick)', () => {
    const s = withState({
      name: 'MAP_INTERACT',
      pointerCount: 1,
      chapterIndex: 3,
      gestureDy: -50,
      gestureStartedAt: 1000,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 1100 },
      TOTAL,
    );
    expect(next.name).toBe('MAP_INTERACT');
  });

  it('Flick with no gestureStartedAt: duration is Infinity → not a flick', () => {
    const s = withState({
      name: 'IDLE',
      pointerCount: 1,
      gestureDy: -50,
      gestureStartedAt: null,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 1100 },
      TOTAL,
    );
    expect(next.name).toBe('IDLE');
  });
});

describe('POINTER_UP — scrub commit path', () => {
  it('SCRUBBING with remaining=0 → IDLE with chapterIndex = round(scrubT * (total-1))', () => {
    const s = withState({ name: 'SCRUBBING', scrubT: 0.5, pointerCount: 1 });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 100 },
      TOTAL,
    );
    expect(next.name).toBe('IDLE');
    // round(0.5 * 9) = round(4.5) = 5 (banker's? JS Math.round rounds half away from zero for positives → 5)
    expect(next.chapterIndex).toBe(5);
    expect(next.scrubT).toBeNull();
    expect(next.pointerCount).toBe(0);
  });

  it('Edge: scrubT=0 → chapterIndex=0', () => {
    const s = withState({ name: 'SCRUBBING', scrubT: 0, pointerCount: 1 });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 100 },
      TOTAL,
    );
    expect(next.name).toBe('IDLE');
    expect(next.chapterIndex).toBe(0);
  });

  it('Edge: scrubT=1 → chapterIndex=total-1', () => {
    const s = withState({ name: 'SCRUBBING', scrubT: 1, pointerCount: 1 });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 100 },
      TOTAL,
    );
    expect(next.name).toBe('IDLE');
    expect(next.chapterIndex).toBe(9);
  });

  it('SCRUBBING release with null scrubT defaults to 0 → chapterIndex=0', () => {
    const s = withState({ name: 'SCRUBBING', scrubT: null, pointerCount: 1 });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 100 },
      TOTAL,
    );
    expect(next.name).toBe('IDLE');
    expect(next.chapterIndex).toBe(0);
  });

  it('SCRUBBING with extra fingers still down (remaining > 0): does NOT commit', () => {
    const s = withState({ name: 'SCRUBBING', scrubT: 0.5, pointerCount: 2 });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 2, t: 100 },
      TOTAL,
    );
    expect(next.name).toBe('SCRUBBING');
  });
});

describe('POINTER_UP — MAP_INTERACT recovery', () => {
  it('MAP_INTERACT with remaining > 0: stays MAP_INTERACT, pointerCount decrements', () => {
    const s = withState({ name: 'MAP_INTERACT', pointerCount: 2 });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 2, t: 100 },
      TOTAL,
    );
    expect(next.name).toBe('MAP_INTERACT');
    expect(next.pointerCount).toBe(1);
  });

  it('MAP_INTERACT with remaining=0: stays MAP_INTERACT, pointerCount=0', () => {
    const s = withState({ name: 'MAP_INTERACT', pointerCount: 1 });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 100 },
      TOTAL,
    );
    expect(next.name).toBe('MAP_INTERACT');
    expect(next.pointerCount).toBe(0);
    expect(next.gestureStartedAt).toBeNull();
    expect(next.gestureDx).toBe(0);
    expect(next.gestureDy).toBe(0);
  });
});

describe('POINTER_UP — default branch', () => {
  it('IDLE with no flick: clears gesture, resets timing when remaining=0', () => {
    const s = withState({
      name: 'IDLE',
      pointerCount: 1,
      gestureDx: 5,
      gestureDy: 5,
      gestureStartedAt: 1000,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 1100 },
      TOTAL,
    );
    expect(next.name).toBe('IDLE');
    expect(next.pointerCount).toBe(0);
    expect(next.gestureStartedAt).toBeNull();
    expect(next.gestureDx).toBe(0);
    expect(next.gestureDy).toBe(0);
  });

  it('IDLE with remaining > 0: preserves gestureStartedAt and deltas', () => {
    const s = withState({
      name: 'IDLE',
      pointerCount: 2,
      gestureDx: 5,
      gestureDy: 5,
      gestureStartedAt: 1000,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 2, t: 1100 },
      TOTAL,
    );
    expect(next.pointerCount).toBe(1);
    expect(next.gestureStartedAt).toBe(1000);
    expect(next.gestureDx).toBe(5);
    expect(next.gestureDy).toBe(5);
  });

  it('CHAPTER_SWIPE non-flick POINTER_UP: hits default branch, stays CHAPTER_SWIPE', () => {
    const s = withState({
      name: 'CHAPTER_SWIPE',
      pointerCount: 1,
      gestureStartedAt: 1000,
    });
    const next = transition(
      s,
      { type: 'POINTER_UP', pointers: 1, t: 1100 },
      TOTAL,
    );
    expect(next.name).toBe('CHAPTER_SWIPE');
    expect(next.pointerCount).toBe(0);
  });
});

describe('CHAPTER_FLY_DONE', () => {
  it('In CHAPTER_SWIPE → IDLE', () => {
    const s = withState({ name: 'CHAPTER_SWIPE', chapterIndex: 4 });
    const next = transition(s, { type: 'CHAPTER_FLY_DONE' }, TOTAL);
    expect(next.name).toBe('IDLE');
    expect(next.chapterIndex).toBe(4);
  });

  it('In IDLE: no-op', () => {
    const s = withState({ name: 'IDLE' });
    const next = transition(s, { type: 'CHAPTER_FLY_DONE' }, TOTAL);
    expect(next).toBe(s);
  });

  it('In MAP_INTERACT: no-op', () => {
    const s = withState({ name: 'MAP_INTERACT' });
    const next = transition(s, { type: 'CHAPTER_FLY_DONE' }, TOTAL);
    expect(next).toBe(s);
  });
});

describe('MAP_INTERACT_IDLE', () => {
  it('In MAP_INTERACT with pointerCount=0 → IDLE', () => {
    const s = withState({ name: 'MAP_INTERACT', pointerCount: 0 });
    const next = transition(s, { type: 'MAP_INTERACT_IDLE' }, TOTAL);
    expect(next.name).toBe('IDLE');
  });

  it('In MAP_INTERACT with pointerCount > 0: no-op (still touching)', () => {
    const s = withState({ name: 'MAP_INTERACT', pointerCount: 1 });
    const next = transition(s, { type: 'MAP_INTERACT_IDLE' }, TOTAL);
    expect(next).toBe(s);
  });

  it('From IDLE: no-op', () => {
    const s = withState({ name: 'IDLE' });
    const next = transition(s, { type: 'MAP_INTERACT_IDLE' }, TOTAL);
    expect(next).toBe(s);
  });

  it('From PAUSED: no-op', () => {
    const s = withState({ name: 'PAUSED' });
    const next = transition(s, { type: 'MAP_INTERACT_IDLE' }, TOTAL);
    expect(next).toBe(s);
  });
});

describe('TAP_BACKGROUND', () => {
  it('IDLE → PAUSED', () => {
    const s = withState({ name: 'IDLE' });
    const next = transition(s, { type: 'TAP_BACKGROUND' }, TOTAL);
    expect(next.name).toBe('PAUSED');
  });

  it('PAUSED → IDLE', () => {
    const s = withState({ name: 'PAUSED' });
    const next = transition(s, { type: 'TAP_BACKGROUND' }, TOTAL);
    expect(next.name).toBe('IDLE');
  });

  it('SCRUBBING: no-op', () => {
    const s = withState({ name: 'SCRUBBING' });
    const next = transition(s, { type: 'TAP_BACKGROUND' }, TOTAL);
    expect(next).toBe(s);
  });

  it('CHAPTER_SWIPE: no-op', () => {
    const s = withState({ name: 'CHAPTER_SWIPE' });
    const next = transition(s, { type: 'TAP_BACKGROUND' }, TOTAL);
    expect(next).toBe(s);
  });

  it('MAP_INTERACT: no-op', () => {
    const s = withState({ name: 'MAP_INTERACT' });
    const next = transition(s, { type: 'TAP_BACKGROUND' }, TOTAL);
    expect(next).toBe(s);
  });
});

describe('JUMP_CHAPTER', () => {
  it('From IDLE with delta=+1 → CHAPTER_SWIPE chapterIndex+1', () => {
    const s = withState({ name: 'IDLE', chapterIndex: 3 });
    const next = transition(s, { type: 'JUMP_CHAPTER', delta: 1 }, TOTAL);
    expect(next.name).toBe('CHAPTER_SWIPE');
    expect(next.chapterIndex).toBe(4);
  });

  it('From IDLE with delta=-1 → CHAPTER_SWIPE chapterIndex-1', () => {
    const s = withState({ name: 'IDLE', chapterIndex: 3 });
    const next = transition(s, { type: 'JUMP_CHAPTER', delta: -1 }, TOTAL);
    expect(next.name).toBe('CHAPTER_SWIPE');
    expect(next.chapterIndex).toBe(2);
  });

  it('At chapterIndex=total-1 with delta=+1: clamps, returns same state (no-op)', () => {
    const s = withState({ name: 'IDLE', chapterIndex: 9 });
    const next = transition(s, { type: 'JUMP_CHAPTER', delta: 1 }, TOTAL);
    expect(next).toBe(s);
  });

  it('At chapterIndex=0 with delta=-1: clamps, returns same state (no-op)', () => {
    const s = withState({ name: 'IDLE', chapterIndex: 0 });
    const next = transition(s, { type: 'JUMP_CHAPTER', delta: -1 }, TOTAL);
    expect(next).toBe(s);
  });

  it('From PAUSED with delta=+2: → CHAPTER_SWIPE', () => {
    const s = withState({ name: 'PAUSED', chapterIndex: 0 });
    const next = transition(s, { type: 'JUMP_CHAPTER', delta: 2 }, TOTAL);
    expect(next.name).toBe('CHAPTER_SWIPE');
    expect(next.chapterIndex).toBe(2);
  });

  it('clears scrubT when jumping', () => {
    const s = withState({ name: 'PAUSED', chapterIndex: 1, scrubT: 0.4 });
    const next = transition(s, { type: 'JUMP_CHAPTER', delta: 1 }, TOTAL);
    expect(next.scrubT).toBeNull();
  });
});

describe('TOGGLE_PAUSED', () => {
  it('IDLE → PAUSED', () => {
    const s = withState({ name: 'IDLE' });
    const next = transition(s, { type: 'TOGGLE_PAUSED' }, TOTAL);
    expect(next.name).toBe('PAUSED');
  });

  it('PAUSED → IDLE', () => {
    const s = withState({ name: 'PAUSED' });
    const next = transition(s, { type: 'TOGGLE_PAUSED' }, TOTAL);
    expect(next.name).toBe('IDLE');
  });

  it('SCRUBBING: no-op', () => {
    const s = withState({ name: 'SCRUBBING' });
    const next = transition(s, { type: 'TOGGLE_PAUSED' }, TOTAL);
    expect(next).toBe(s);
  });

  it('CHAPTER_SWIPE: no-op', () => {
    const s = withState({ name: 'CHAPTER_SWIPE' });
    const next = transition(s, { type: 'TOGGLE_PAUSED' }, TOTAL);
    expect(next).toBe(s);
  });

  it('MAP_INTERACT: no-op', () => {
    const s = withState({ name: 'MAP_INTERACT' });
    const next = transition(s, { type: 'TOGGLE_PAUSED' }, TOTAL);
    expect(next).toBe(s);
  });
});

describe('OPEN_DETAIL', () => {
  // OPEN_DETAIL is dispatched by the keyboard handler on Enter (A11Y-08).
  // The state machine treats it as a side-channel signal: it does NOT change
  // any reel state. The Reel component (via the useGestureMachine onOpenDetail
  // callback) is responsible for opening the photo detail sheet. This test
  // asserts the event type is part of the discriminated union AND that it
  // produces a no-op in all states (no accidental state corruption).
  it('IDLE → IDLE (no-op identity)', () => {
    const s = withState({ name: 'IDLE', chapterIndex: 3 });
    const next = transition(s, { type: 'OPEN_DETAIL' }, TOTAL);
    expect(next).toBe(s);
  });

  it('PAUSED → PAUSED (no-op identity)', () => {
    const s = withState({ name: 'PAUSED', chapterIndex: 2 });
    const next = transition(s, { type: 'OPEN_DETAIL' }, TOTAL);
    expect(next).toBe(s);
  });

  it('CHAPTER_SWIPE → CHAPTER_SWIPE (no-op)', () => {
    const s = withState({ name: 'CHAPTER_SWIPE', chapterIndex: 1 });
    const next = transition(s, { type: 'OPEN_DETAIL' }, TOTAL);
    expect(next).toBe(s);
  });

  it('SCRUBBING → SCRUBBING (no-op)', () => {
    const s = withState({ name: 'SCRUBBING' });
    const next = transition(s, { type: 'OPEN_DETAIL' }, TOTAL);
    expect(next).toBe(s);
  });

  it('SUSPENDED → SUSPENDED (no-op, even though SUSPENDED ignores other events)', () => {
    const s = withState({ name: 'SUSPENDED' });
    const next = transition(s, { type: 'OPEN_DETAIL' }, TOTAL);
    expect(next).toBe(s);
  });
});

describe('immutability', () => {
  it('transition does not mutate input state', () => {
    const s = withState({ name: 'IDLE', chapterIndex: 2 });
    const snapshot = { ...s };
    transition(s, { type: 'JUMP_CHAPTER', delta: 1 }, TOTAL);
    expect(s).toEqual(snapshot);
  });

  it('returned state is a new object reference when changing name', () => {
    const s = withState({ name: 'IDLE' });
    const next = transition(s, { type: 'TAP_BACKGROUND' }, TOTAL);
    expect(next).not.toBe(s);
  });
});
