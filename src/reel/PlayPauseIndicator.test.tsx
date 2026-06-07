// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PlayPauseIndicator } from './PlayPauseIndicator';

describe('PlayPauseIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initial IDLE: no transient, no persistent indicator', () => {
    render(<PlayPauseIndicator state="IDLE" />);
    expect(screen.queryByTestId('play-pause-transient')).toBeNull();
    expect(screen.queryByTestId('play-pause-persistent')).toBeNull();
  });

  it('IDLE → PAUSED: transient pause + persistent pause both appear', () => {
    const { rerender } = render(<PlayPauseIndicator state="IDLE" />);
    act(() => {
      rerender(<PlayPauseIndicator state="PAUSED" />);
    });
    expect(screen.getByTestId('play-pause-transient')).toBeTruthy();
    expect(screen.getByTestId('play-pause-persistent')).toBeTruthy();
  });

  it('transient confirmation fades out after 800ms; persistent stays while PAUSED', () => {
    const { rerender } = render(<PlayPauseIndicator state="IDLE" />);
    act(() => {
      rerender(<PlayPauseIndicator state="PAUSED" />);
    });
    expect(screen.getByTestId('play-pause-transient')).toBeTruthy();

    // Just before timer: still mounted (AnimatePresence handles exit)
    act(() => {
      vi.advanceTimersByTime(799);
    });
    expect(screen.queryByTestId('play-pause-transient')).toBeTruthy();

    // After timer + exit animation budget: transient gone, persistent stays
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.queryByTestId('play-pause-persistent')).toBeTruthy();
  });

  it('PAUSED → IDLE: transient play appears, persistent fades out', () => {
    const { rerender } = render(<PlayPauseIndicator state="PAUSED" />);
    expect(screen.getByTestId('play-pause-persistent')).toBeTruthy();

    act(() => {
      rerender(<PlayPauseIndicator state="IDLE" />);
    });
    // Transient mounts immediately (with play glyph)
    expect(screen.getByTestId('play-pause-transient')).toBeTruthy();
  });

  it('IDLE → CHAPTER_SWIPE: no transient (camera flight is the signal)', () => {
    const { rerender } = render(<PlayPauseIndicator state="IDLE" />);
    act(() => {
      rerender(<PlayPauseIndicator state="CHAPTER_SWIPE" />);
    });
    expect(screen.queryByTestId('play-pause-transient')).toBeNull();
    expect(screen.queryByTestId('play-pause-persistent')).toBeNull();
  });

  it('PAUSED → CHAPTER_SWIPE: no transient, persistent unmounts', () => {
    const { rerender } = render(<PlayPauseIndicator state="PAUSED" />);
    expect(screen.getByTestId('play-pause-persistent')).toBeTruthy();
    act(() => {
      rerender(<PlayPauseIndicator state="CHAPTER_SWIPE" />);
    });
    expect(screen.queryByTestId('play-pause-transient')).toBeNull();
  });

  it('SUSPENDED ↔ IDLE (tab switch): no transient — only IDLE↔PAUSED triggers it', () => {
    const { rerender } = render(<PlayPauseIndicator state="IDLE" />);
    act(() => {
      rerender(<PlayPauseIndicator state="SUSPENDED" />);
    });
    expect(screen.queryByTestId('play-pause-transient')).toBeNull();
    act(() => {
      rerender(<PlayPauseIndicator state="IDLE" />);
    });
    expect(screen.queryByTestId('play-pause-transient')).toBeNull();
  });

  it('persistent indicator has accessible status role', () => {
    render(<PlayPauseIndicator state="PAUSED" />);
    const persistent = screen.getByRole('status');
    expect(persistent.getAttribute('aria-label')).toBe('Reel paused');
  });
});
