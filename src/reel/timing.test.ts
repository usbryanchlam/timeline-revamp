import { describe, expect, it } from 'vitest';
import {
  AUTOPLAY_DWELL_MS,
  MIN_CYCLE_INTERVAL_MS,
  cycleIntervalForPhotoCount,
} from './timing';

describe('cycleIntervalForPhotoCount', () => {
  it('returns 0 for 0 photos', () => {
    expect(cycleIntervalForPhotoCount(0)).toBe(0);
  });

  it('returns 0 for 1 photo (no cycling needed)', () => {
    expect(cycleIntervalForPhotoCount(1)).toBe(0);
  });

  it('divides dwell evenly when above floor', () => {
    // 4500 / 2 = 2250 (above 800 floor)
    expect(cycleIntervalForPhotoCount(2)).toBe(2250);
    // 4500 / 3 = 1500
    expect(cycleIntervalForPhotoCount(3)).toBe(1500);
    // 4500 / 4 = 1125
    expect(cycleIntervalForPhotoCount(4)).toBe(1125);
    // 4500 / 5 = 900
    expect(cycleIntervalForPhotoCount(5)).toBe(900);
  });

  it('clamps to floor when ideal interval would be below MIN_CYCLE_INTERVAL_MS', () => {
    // 4500 / 6 = 750 → clamped to 800
    expect(cycleIntervalForPhotoCount(6)).toBe(MIN_CYCLE_INTERVAL_MS);
    // 4500 / 10 = 450 → clamped to 800
    expect(cycleIntervalForPhotoCount(10)).toBe(MIN_CYCLE_INTERVAL_MS);
  });

  it('respects dwellMs override', () => {
    // 3000 / 3 = 1000
    expect(cycleIntervalForPhotoCount(3, 3000)).toBe(1000);
    // 6000 / 2 = 3000
    expect(cycleIntervalForPhotoCount(2, 6000)).toBe(3000);
  });

  it('uses AUTOPLAY_DWELL_MS as the default dwell', () => {
    expect(cycleIntervalForPhotoCount(3)).toBe(
      cycleIntervalForPhotoCount(3, AUTOPLAY_DWELL_MS),
    );
  });
});
