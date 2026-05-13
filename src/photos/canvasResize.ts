/**
 * Canvas-based image resize + EXIF strip.
 *
 * canvas.toBlob() produces JPEG with no EXIF by browser-spec default —
 * this is how EXIF strip is achieved. No metadata library needed.
 *
 * iOS 17+ Safari and Chrome 109+ apply EXIF orientation automatically via
 * CSS image-orientation: from-image before drawImage. If portrait photos
 * appear rotated on real-device QA, add `exifr` and explicit rotation.
 */

export const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.88;

/**
 * Returns scaled { w, h } that fit within maxEdge on the longest side.
 * If both dimensions are already ≤ maxEdge, returns them unchanged (no upscale).
 * Rounds to nearest integer.
 */
function scaledDimensions(
  w: number,
  h: number,
  maxEdge: number,
): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) {
    return { w, h };
  }
  const scale = maxEdge / longest;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/**
 * Wraps new Image() in a Promise, resolving on load and rejecting on error.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Resizes a Blob image so its longest edge is ≤ MAX_EDGE (2048px),
 * then re-encodes as JPEG — stripping all EXIF metadata in the process.
 *
 * Immutability: returns a new Blob; the input blob is never modified.
 */
export async function resizeAndStrip(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const { w, h } = scaledDimensions(img.naturalWidth, img.naturalHeight, MAX_EDGE);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');

    ctx.drawImage(img, 0, 0, w, h);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))),
        'image/jpeg',
        JPEG_QUALITY,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
