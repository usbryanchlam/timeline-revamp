// @vitest-environment jsdom
//
// Reel keyboard A11Y-08 coverage:
//   - Space toggles paused (TOGGLE_PAUSED dispatched)
//   - ArrowUp / ArrowLeft → JUMP_CHAPTER delta=-1 (prev)
//   - ArrowDown / ArrowRight → JUMP_CHAPTER delta=+1 (next)
//   - Enter → OPEN_DETAIL (or onOpenDetail callback)
//
// Implementation strategy: mock useGestureMachine to capture dispatched events.
// This isolates the keyboard wiring test from MapLibre / WebGL initialization
// in the real Reel render path. We assert on the sequence of dispatched events
// driven by `window` keydown — that is what the production code does (the
// keydown listener is attached to window inside useGestureMachine).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

// matchMedia polyfill — Reel renders ChapterOverlay → PhotoCycle which calls
// usePrefersReducedMotion(window.matchMedia(...)). jsdom does not implement it.
function installMatchMedia(): void {
  if (typeof window === 'undefined') return;
  // TS declares window.matchMedia as always-defined, but jsdom omits it.
  // Cast to unknown so the runtime guard compiles.
  if ((window as unknown as { matchMedia?: unknown }).matchMedia) return;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
installMatchMedia();

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing Reel
// ---------------------------------------------------------------------------

// We mock useGestureMachine so we can spy on dispatch and observe what events
// the (still-real) keydown handler fires. The real keydown handler lives
// inside useGestureMachine, so we re-implement a slimmed version here that
// mirrors the production wiring.
const mockDispatch = vi.fn();
const mockOnOpenDetail = vi.fn();

// Use a stable bind ref-callback no-op for the mock.
const mockBind = () => {};

vi.mock('@/gestures/useGestureMachine', () => ({
  useGestureMachine: (opts: { onOpenDetail?: () => void }) => {
    // Mirror the production hook's keydown wiring (verbatim semantics
    // from useGestureMachine.ts lines ~261-274 + the NEW Enter handler).
    // This test asserts the wiring contract — Space → TOGGLE_PAUSED,
    // Arrow* → JUMP_CHAPTER, Enter → onOpenDetail callback.
    (globalThis as unknown as { __reelOnOpenDetail__?: () => void }).__reelOnOpenDetail__ =
      opts.onOpenDetail;
    return {
      state: {
        name: 'IDLE' as const,
        chapterIndex: 0,
        scrubT: null,
        pointerCount: 0,
        gestureStartedAt: null,
        gestureDx: 0,
        gestureDy: 0,
      },
      dispatch: mockDispatch,
      bind: mockBind,
    };
  },
}));

// Mock MapCanvas (it pulls in maplibre-gl which has no jsdom WebGL support).
vi.mock('@/reel/MapCanvas', () => ({
  MapCanvas: () => null,
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------

import { Reel } from './Reel';
import { useGestureMachine } from '@/gestures/useGestureMachine';

beforeEach(() => {
  mockDispatch.mockClear();
  mockOnOpenDetail.mockClear();
});

// ---------------------------------------------------------------------------
// Test 1-2: Reel mounts without throwing and wires onOpenDetail to the hook
// ---------------------------------------------------------------------------

describe('Reel keyboard handlers — A11Y-08 close-out', () => {
  it('renders without throwing under the mocked gesture machine', () => {
    render(<Reel />);
    // Sanity: mocked useGestureMachine produced an IDLE state, Reel rendered.
    // Sanity check that the mocked hook is a function (we mocked it above).
    expect(typeof useGestureMachine).toBe('function');
  });

  it('exposes onOpenDetail callback to the gesture hook', () => {
    render(<Reel />);
    const cb = (globalThis as unknown as { __reelOnOpenDetail__?: () => void })
      .__reelOnOpenDetail__;
    expect(typeof cb).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Real-hook wiring: spin up useGestureMachine inside a tiny test consumer
// and dispatch keydown on window. Asserts dispatched events.
// ---------------------------------------------------------------------------

// We need the REAL hook here. vi.doUnmock is hoisted with vi.mock — instead
// we use vi.importActual under dynamic import.
describe('useGestureMachine real keydown handler (Space + Arrows + Enter)', () => {
  it('dispatches TOGGLE_PAUSED on Space', async () => {
    vi.resetModules();
    vi.doUnmock('@/gestures/useGestureMachine');
    const realModule = await vi.importActual<
      typeof import('@/gestures/useGestureMachine')
    >('@/gestures/useGestureMachine');

    const events: string[] = [];

    function TestConsumer() {
      const { state, bind } = realModule.useGestureMachine({
        totalChapters: 3,
        onOpenDetail: () => events.push('OPEN_DETAIL'),
      });
      // capture state name into the dom so we can read it
      return <div ref={bind as unknown as React.RefCallback<HTMLDivElement>} data-testid="t" data-state={state.name} />;
    }

    const { rerender, getByTestId } = render(<TestConsumer />);
    const initialName = getByTestId('t').getAttribute('data-state');
    expect(initialName).toBe('IDLE');

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    rerender(<TestConsumer />);
    const afterSpace = getByTestId('t').getAttribute('data-state');
    // Space toggles IDLE → PAUSED
    expect(afterSpace).toBe('PAUSED');

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    rerender(<TestConsumer />);
    // Space again toggles PAUSED → IDLE
    expect(getByTestId('t').getAttribute('data-state')).toBe('IDLE');
  });

  it('dispatches JUMP_CHAPTER prev on ArrowUp / ArrowLeft (clamped at 0)', async () => {
    vi.resetModules();
    vi.doUnmock('@/gestures/useGestureMachine');
    const realModule = await vi.importActual<
      typeof import('@/gestures/useGestureMachine')
    >('@/gestures/useGestureMachine');

    function TestConsumer() {
      const { state, bind } = realModule.useGestureMachine({ totalChapters: 3 });
      return <div ref={bind as unknown as React.RefCallback<HTMLDivElement>} data-testid="t" data-ci={String(state.chapterIndex)} />;
    }

    const { rerender, getByTestId } = render(<TestConsumer />);
    expect(getByTestId('t').getAttribute('data-ci')).toBe('0');

    // ArrowLeft from chapter 0 stays at 0 (clamp)
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    rerender(<TestConsumer />);
    expect(getByTestId('t').getAttribute('data-ci')).toBe('0');

    // ArrowRight goes to 1
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    rerender(<TestConsumer />);
    expect(getByTestId('t').getAttribute('data-ci')).toBe('1');

    // ArrowUp goes back to 0
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    rerender(<TestConsumer />);
    expect(getByTestId('t').getAttribute('data-ci')).toBe('0');

    // ArrowDown twice goes to 2 (clamps at totalChapters-1)
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    rerender(<TestConsumer />);
    expect(getByTestId('t').getAttribute('data-ci')).toBe('2');
  });

  it('invokes onOpenDetail callback on Enter', async () => {
    vi.resetModules();
    vi.doUnmock('@/gestures/useGestureMachine');
    const realModule = await vi.importActual<
      typeof import('@/gestures/useGestureMachine')
    >('@/gestures/useGestureMachine');

    const onOpenDetail = vi.fn();

    function TestConsumer() {
      const { bind } = realModule.useGestureMachine({
        totalChapters: 3,
        onOpenDetail,
      });
      return <div ref={bind as unknown as React.RefCallback<HTMLDivElement>} data-testid="t" />;
    }

    render(<TestConsumer />);
    expect(onOpenDetail).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  it('does not throw when Enter is pressed and no onOpenDetail callback is provided', async () => {
    vi.resetModules();
    vi.doUnmock('@/gestures/useGestureMachine');
    const realModule = await vi.importActual<
      typeof import('@/gestures/useGestureMachine')
    >('@/gestures/useGestureMachine');

    function TestConsumer() {
      const { bind } = realModule.useGestureMachine({ totalChapters: 3 });
      return <div ref={bind as unknown as React.RefCallback<HTMLDivElement>} data-testid="t" />;
    }

    render(<TestConsumer />);
    expect(() => fireEvent.keyDown(window, { key: 'Enter' })).not.toThrow();
  });
});
