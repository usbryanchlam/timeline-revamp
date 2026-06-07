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
    // Use a dwell well above the floor * photoCount so we can verify the
    // even-division behavior without depending on the AUTOPLAY_DWELL_MS
    // value (which is in active UAT tuning).
    expect(cycleIntervalForPhotoCount(2, 6000)).toBe(3000);
    expect(cycleIntervalForPhotoCount(3, 6000)).toBe(2000);
    expect(cycleIntervalForPhotoCount(4, 6000)).toBe(1500);
    expect(cycleIntervalForPhotoCount(5, 6000)).toBe(1200);
  });

  it('clamps to floor when ideal interval would be below MIN_CYCLE_INTERVAL_MS', () => {
    // dwell / photoCount < MIN_CYCLE_INTERVAL_MS → clamp.
    // 3000 / 6 = 500 → clamped to MIN_CYCLE_INTERVAL_MS.
    expect(cycleIntervalForPhotoCount(6, 3000)).toBe(MIN_CYCLE_INTERVAL_MS);
    // 3000 / 10 = 300 → clamped.
    expect(cycleIntervalForPhotoCount(10, 3000)).toBe(MIN_CYCLE_INTERVAL_MS);
  });

  it('respects dwellMs override', () => {
    expect(cycleIntervalForPhotoCount(3, 3000)).toBe(1000);
    expect(cycleIntervalForPhotoCount(2, 6000)).toBe(3000);
  });

  it('uses AUTOPLAY_DWELL_MS as the default dwell', () => {
    expect(cycleIntervalForPhotoCount(3)).toBe(
      cycleIntervalForPhotoCount(3, AUTOPLAY_DWELL_MS),
    );
  });
});
