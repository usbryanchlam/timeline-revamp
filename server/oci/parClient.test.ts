import { describe, it, expect } from 'vitest';
import { sniffImageMime } from './parClient.js';

describe('sniffImageMime', () => {
  it('returns image/jpeg for JPEG magic bytes', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(sniffImageMime(buf)).toBe('image/jpeg');
  });

  it('returns image/png for PNG magic bytes', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffImageMime(buf)).toBe('image/png');
  });

  it('returns null for non-image bytes', () => {
    const buf = Buffer.from('hello world');
    expect(sniffImageMime(buf)).toBeNull();
  });

  it('returns null when buffer is too short (< 8 bytes)', () => {
    const buf = Buffer.from([0xff, 0xd8]); // Only 2 bytes — too short
    expect(sniffImageMime(buf)).toBeNull();
  });

  it('returns null for a 7-byte buffer that starts with PNG-like bytes (< 8 bytes guard)', () => {
    // 7 bytes = under the 8-byte minimum; should return null even if bytes look PNG-ish
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a]);
    expect(sniffImageMime(buf)).toBeNull();
  });
});
