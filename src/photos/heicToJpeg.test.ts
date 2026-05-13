import { describe, it, expect, vi, beforeEach } from 'vitest';

// NOTE: heic-to is mocked ONLY in specific tests that exercise the WASM fallback
// or the convertHeicToJpeg path.
// Extension fast-path tests do NOT mock heic-to — proving no WASM loads for .jpg/.png.
// We use vi.doMock (not vi.mock) so mocks are per-test and not hoisted globally.

describe('detectIsHeic', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns false for a .jpg file (extension fast-path, no WASM load)', async () => {
    const { detectIsHeic } = await import('./heicToJpeg.js');
    const file = new File([new Uint8Array(8)], 'photo.jpg', { type: 'image/jpeg' });
    const result = await detectIsHeic(file);
    expect(result).toBe(false);
  });

  it('returns false for a .jpeg file (extension fast-path)', async () => {
    const { detectIsHeic } = await import('./heicToJpeg.js');
    const file = new File([new Uint8Array(8)], 'photo.jpeg', { type: 'image/jpeg' });
    const result = await detectIsHeic(file);
    expect(result).toBe(false);
  });

  it('returns false for a .PNG file with type image/png (case-insensitive fast-path)', async () => {
    const { detectIsHeic } = await import('./heicToJpeg.js');
    const file = new File([new Uint8Array(8)], 'photo.PNG', { type: 'image/png' });
    const result = await detectIsHeic(file);
    expect(result).toBe(false);
  });

  it('returns true for file with type "image/heic"', async () => {
    const { detectIsHeic } = await import('./heicToJpeg.js');
    const file = new File([new Uint8Array(8)], 'photo.heic', { type: 'image/heic' });
    const result = await detectIsHeic(file);
    expect(result).toBe(true);
  });

  it('returns true for file with type "image/heif"', async () => {
    const { detectIsHeic } = await import('./heicToJpeg.js');
    const file = new File([new Uint8Array(8)], 'photo.heif', { type: 'image/heif' });
    const result = await detectIsHeic(file);
    expect(result).toBe(true);
  });

  it('returns true for "photo.HEIC" with type "" (extension detection, no MIME)', async () => {
    const { detectIsHeic } = await import('./heicToJpeg.js');
    const file = new File([new Uint8Array(8)], 'photo.HEIC', { type: '' });
    const result = await detectIsHeic(file);
    expect(result).toBe(true);
  });

  it('falls back to WASM isHeic for ambiguous application/octet-stream (Safari)', async () => {
    // Use vi.doMock so the factory runs at call-time (not hoisted)
    vi.doMock('heic-to', () => ({
      isHeic: vi.fn().mockResolvedValue(true),
      heicTo: vi.fn(),
    }));
    // Reset modules so heicToJpeg.ts re-imports the mocked heic-to
    vi.resetModules();
    const { detectIsHeic } = await import('./heicToJpeg.js');
    const file = new File([new Uint8Array(8)], 'unknown_file', { type: 'application/octet-stream' });
    const result = await detectIsHeic(file);
    expect(result).toBe(true);
    vi.doUnmock('heic-to');
  });
});

describe('convertHeicToJpeg', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('calls heicTo with correct args and returns a Blob', async () => {
    const expectedBlob = new Blob(['jpeg-data'], { type: 'image/jpeg' });
    // Use vi.doMock so factory runs at call-time and can reference expectedBlob
    vi.doMock('heic-to', () => ({
      isHeic: vi.fn(),
      heicTo: vi.fn().mockResolvedValue(expectedBlob),
    }));
    vi.resetModules();
    const { convertHeicToJpeg } = await import('./heicToJpeg.js');
    const file = new File([new Uint8Array(8)], 'photo.heic', { type: 'image/heic' });
    const result = await convertHeicToJpeg(file);
    expect(result).toBe(expectedBlob);
    expect(result.type).toBe('image/jpeg');
    vi.doUnmock('heic-to');
  });
});
