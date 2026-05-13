import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock DOM APIs that are unavailable in the node test environment.
// canvasResize.ts uses: URL.createObjectURL, URL.revokeObjectURL,
// new Image(), document.createElement('canvas'), canvas.getContext,
// canvas.toBlob.

let capturedCanvasWidth = 0;
let capturedCanvasHeight = 0;
let revokeObjectUrlMock: ReturnType<typeof vi.fn>;

function setupDomMocks(imgWidth: number, imgHeight: number) {
  capturedCanvasWidth = 0;
  capturedCanvasHeight = 0;

  // Stub URL static methods — preserve URL class itself (Node has a real URL)
  revokeObjectUrlMock = vi.fn();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectUrlMock);

  // Stub document.createElement to return a minimal canvas stub
  vi.stubGlobal('document', {
    createElement: vi.fn().mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const canvas = {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue({
            drawImage: vi.fn(),
          }),
          toBlob: vi.fn().mockImplementation(function (
            this: { width: number; height: number },
            cb: (b: Blob | null) => void,
            _type: string,
            _quality: number,
          ) {
            capturedCanvasWidth = this.width;
            capturedCanvasHeight = this.height;
            cb(new Blob(['x'], { type: 'image/jpeg' }));
          }),
        };
        return canvas;
      }
      throw new Error(`createElement('${tag}') not mocked`);
    }),
  });

  // Stub the Image global with a proper constructor function (not arrow fn)
  // so that `new Image()` works. naturalWidth/naturalHeight are read-only
  // on real HTMLImageElement but here we use a plain object.
  function MockImageConstructor(this: {
    onload: (() => void) | null;
    onerror: (() => void) | null;
    naturalWidth: number;
    naturalHeight: number;
    src: string;
  }) {
    this.onload = null;
    this.onerror = null;
    this.naturalWidth = imgWidth;
    this.naturalHeight = imgHeight;
    this.src = '';
  }

  // Override the src setter to trigger onload asynchronously
  Object.defineProperty(MockImageConstructor.prototype, 'src', {
    set(this: { onload: (() => void) | null; _src: string }, _val: string) {
      this._src = _val;
      setTimeout(() => {
        if (typeof this.onload === 'function') this.onload();
      }, 0);
    },
    get(this: { _src: string }) {
      return this._src ?? '';
    },
    configurable: true,
  });

  vi.stubGlobal('Image', MockImageConstructor);
}

describe('resizeAndStrip', () => {
  beforeEach(() => {
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
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:mock-url');
  });
});
