/**
 * HEIC detection + conversion to JPEG via the `heic-to` library (WASM-backed).
 *
 * WASM bundle (~600KB) is dynamic-imported on first call; non-HEIC files never
 * trigger the import (see detectIsHeic extension fast-path).
 *
 * Module-level cache ensures the WASM bundle loads exactly once per session,
 * analogous to the maplibre-gl lazy import in src/components/MapPicker.tsx.
 */

// Module-level cache — WASM loads once, reused for subsequent conversions.
let heicToModule: typeof import('heic-to') | null = null;

async function loadHeicTo(): Promise<typeof import('heic-to')> {
  if (!heicToModule) {
    heicToModule = await import('heic-to');
  }
  return heicToModule;
}

/**
 * Detects whether a File is a HEIC/HEIF image.
 *
 * Detection order (fastest to most expensive):
 * 1. Extension fast-path: .jpg/.jpeg/.png → false immediately, no WASM load.
 * 2. Explicit MIME type: image/heic or image/heif → true, no WASM load.
 * 3. Extension check: .heic/.heif → true, no WASM load.
 * 4. WASM fallback: heic-to's isHeic() for Safari's application/octet-stream.
 */
export async function detectIsHeic(file: File): Promise<boolean> {
  const ext = file.name.toLowerCase();

  // Fast-path: common non-HEIC extensions → return false without loading WASM
  if (ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png')) {
    return false;
  }

  // MIME type check (most browsers set this for HEIC)
  if (file.type === 'image/heic' || file.type === 'image/heif') {
    return true;
  }

  // Extension check (Safari sometimes sets type="" on HEIC files)
  if (ext.endsWith('.heic') || ext.endsWith('.heif')) {
    return true;
  }

  // WASM fallback for ambiguous cases (e.g., Safari sending application/octet-stream)
  const { isHeic } = await loadHeicTo();
  return isHeic(file);
}

/**
 * Converts a HEIC/HEIF file to a JPEG Blob using the heic-to WASM library.
 * The WASM module is lazy-loaded and cached on first invocation.
 */
export async function convertHeicToJpeg(file: File | Blob): Promise<Blob> {
  const { heicTo } = await loadHeicTo();
  return heicTo({ blob: file, type: 'image/jpeg', quality: 0.88 });
}
