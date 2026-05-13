import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock DOM APIs that are unavailable in the node test environment.
// canvasResize.ts uses: URL.createObjectURL, URL.revokeObjectURL,
// new Image(), document.createElement('canvas'), canvas.getContext,
// canvas.toBlob.

let capturedCanvasWidth = 0;
let capturedCanvasHeight = 0;
let toBloBMock: ReturnType<typeof vi.fn>;

function setupDomMocks(imgWidth: number, imgHeight: number) {
  // Stub URL object-URL helpers
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
    revokeObjectURL: vi.fn(),
  });

  toBloBMock = vi.fn().mockImplementation(function (
    this: HTMLCanvasElement,
    cb: (b: Blob | null) => void,
    _type: string,
    _quality: number,
  ) {
    capturedCanvasWidth = this.width;
    capturedCanvasHeight = this.height;
    cb(new Blob(['x'], { type: 'image/jpeg' }));
  });

  // Stub document.createElement to return a minimal canvas object
  vi.stubGlobal('document', {
    createElement: vi.fn().mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const canvas = {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue({
            drawImage: vi.fn(),
          }),
          toBlob: toBloBMock,
        };
        return canvas;
      }
      throw new Error(`createElement('${tag}') not mocked`);
    }),
  });

  // Stub the Image constructor
  const MockImage = vi.fn().mockImplementation(() => {
    const img: Record<string, unknown> = {};
    // When src is set, trigger onload asynchronously
    let _src = '';
    Object.defineProperty(img, 'src', {
      set(_val: string) {
        _src = _val;
        // Use setTimeout to simulate async image load
        setTimeout(() => {
          if (typeof (img as { onload?: () => void }).onload === 'function') {
            (img as { onload: () => void }).onload();
          }
        }, 0);
      },
      get() { return _src; },
    });
    Object.defineProperty(img, 'naturalWidth', { value: imgWidth, writable: false });
    Object.defineProperty(img, 'naturalHeight', { value: imgHeight, writable: false });
    return img;
  });
  vi.stubGlobal('Image', MockImage);
}

describe('resizeAndStrip', () => {
  beforeEach(() => {
    capturedCanvasWidth = 0;
    capturedCanvasHeight = 0;
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('scales a 3000×2000 image down so the longest edge is ≤ 2048', async () => {
    setupDomMocks(3000, 2000);
    const { resizeAndStrip } = await import('./canvasResize.js');
    const blob = new Blob(['data'], { type: 'image/jpeg' });
    await resizeAndStrip(blob);
    expect(capturedCanvasWidth).toBeLessThanOrEqual(2048);
    expect(capturedCanvasHeight).toBeLessThanOrEqual(2048);
    // Longest edge must equal exactly 2048
    expect(Math.max(capturedCanvasWidth, capturedCanvasHeight)).toBe(2048);
  });

  it('does not scale a 1600×1200 image (both edges already ≤ 2048)', async () => {
    setupDomMocks(1600, 1200);
    const { resizeAndStrip } = await import('./canvasResize.js');
    const blob = new Blob(['data'], { type: 'image/jpeg' });
    await resizeAndStrip(blob);
    expect(capturedCanvasWidth).toBe(1600);
    expect(capturedCanvasHeight).toBe(1200);
  });

  it('preserves aspect ratio on 3000×2000 input (within ±1px)', async () => {
    setupDomMocks(3000, 2000);
    const { resizeAndStrip } = await import('./canvasResize.js');
    const blob = new Blob(['data'], { type: 'image/jpeg' });
    await resizeAndStrip(blob);
    const originalRatio = 3000 / 2000;
    const scaledRatio = capturedCanvasWidth / capturedCanvasHeight;
    expect(Math.abs(scaledRatio - originalRatio)).toBeLessThanOrEqual(0.01);
  });

  it('returns a Blob with type "image/jpeg"', async () => {
    setupDomMocks(1600, 1200);
    const { resizeAndStrip } = await import('./canvasResize.js');
    const blob = new Blob(['data'], { type: 'image/jpeg' });
    const result = await resizeAndStrip(blob);
    expect(result.type).toBe('image/jpeg');
  });

  it('revokes the object URL after processing (cleanup discipline)', async () => {
    setupDomMocks(800, 600);
    const { resizeAndStrip } = await import('./canvasResize.js');
    const blob = new Blob(['data'], { type: 'image/jpeg' });
    await resizeAndStrip(blob);
    expect((URL as unknown as { revokeObjectURL: ReturnType<typeof vi.fn> }).revokeObjectURL)
      .toHaveBeenCalledWith('blob:mock-url');
  });
});
