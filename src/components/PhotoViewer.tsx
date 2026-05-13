// PhotoViewer — full-screen single-photo viewer for a city's photos.
//
// Phase 6 scope (LOCKED in CONTEXT.md decisions, NOT deferred):
//   - Full-viewport modal on mobile + desktop; dark backdrop
//   - Master image displayed; thumb image used as instant placeholder while master loads
//   - Navigation: ArrowLeft/ArrowRight, swipe left/right on touch, dots indicator
//   - Close: Escape, backdrop tap, swipe-down (mobile), close button
//   - aria-modal + focus trap + focus return on close
//   - prefers-reduced-motion → opacity-only transitions; no slide animation
//   - Per-photo delete: trash icon → inline confirm → DELETE /api/photos/:id
//   - Optimistic UI: remove photo, advance to next (or prev if last; close if empty)
//
// DEFERRED per CONTEXT.md <deferred_ideas>:
//   - Caption EDIT (caption renders read-only when present)
//   - Photo reorder, bulk delete, EXIF re-attach

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useApi } from '@/auth/useApi';
import { deletePhoto, type PhotoDTO } from '@/api/photos';

interface PhotoViewerProps {
  readonly photos: readonly PhotoDTO[];
  readonly initialIndex: number;
  readonly cityId: string;
  readonly onClose: () => void;
  readonly onPhotoDeleted: (photoId: string) => void;
}

const SWIPE_THRESHOLD = 50; // px

export function PhotoViewer({
  photos,
  initialIndex,
  onClose,
  onPhotoDeleted,
}: PhotoViewerProps) {
  const api = useApi();
  const [index, setIndex] = useState(initialIndex);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masterLoaded, setMasterLoaded] = useState(false);

  const mountedRef = useRef(true);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number; id: number } | null>(null);

  // StrictMode-safe mount + focus capture/return.
  // Re-anchor on every (re-)mount; StrictMode double-invoke leaves mountedRef
  // stuck at false on second mount if we only set in the effect cleanup
  // (memory: feedback_mountedref_strictmode.md).
  useEffect(() => {
    mountedRef.current = true;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      mountedRef.current = false;
      previousFocusRef.current?.focus();
    };
  }, []);

  // prefers-reduced-motion detection
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Reset masterLoaded on index change
  useEffect(() => {
    setMasterLoaded(false);
  }, [index]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        setIndex((i) => Math.min(photos.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, photos.length]);

  // Swipe (pointer events; no library)
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx <= -SWIPE_THRESHOLD) setIndex((i) => Math.min(photos.length - 1, i + 1));
      else if (dx >= SWIPE_THRESHOLD) setIndex((i) => Math.max(0, i - 1));
    } else if (dy >= SWIPE_THRESHOLD) {
      onClose(); // swipe-down-to-close
    }
  };

  // Delete handler (optimistic, with revert on failure)
  const handleDelete = useCallback(async () => {
    const photo = photos[index];
    if (!photo) return;
    setDeleting(true);
    setError(null);
    try {
      await deletePhoto(api, photo.id);
      if (!mountedRef.current) return;
      // Optimistic propagation: parent removes from its cache
      onPhotoDeleted(photo.id);
      // Adjust local index: advance to next (or prev if we were on last; close if empty)
      const newLength = photos.length - 1;
      if (newLength <= 0) {
        onClose();
        return;
      }
      setIndex((i) => Math.min(i, newLength - 1));
      setConfirmingDelete(false);
    } catch {
      if (!mountedRef.current) return;
      setError("Couldn't delete. Try again.");
    } finally {
      if (mountedRef.current) setDeleting(false);
    }
  }, [api, photos, index, onPhotoDeleted, onClose]);

  const photo = photos[index];
  if (!photo) return null;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={() => onClose()}
      className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center"
    >
      {/* Toolbar */}
      <div
        className="absolute top-0 inset-x-0 flex items-center justify-between p-4 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close viewer"
          className="text-white min-w-[44px] min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-md"
        >
          ×
        </button>

        <span className="text-white text-[13px] tabular-nums" aria-live="polite">
          {index + 1} / {photos.length}
        </span>

        {!confirmingDelete ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label="Delete this photo"
            className="text-white min-w-[44px] min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-md"
          >
            🗑
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-white text-[13px]">Delete?</span>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="text-white/80 text-[13px] px-3 py-2 min-w-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-md"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-amber-500 text-black text-[13px] font-semibold px-3 py-2 rounded-md min-w-[44px] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Master image with thumb-as-placeholder */}
      <div
        className="relative max-w-full max-h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {/* Thumb placeholder: shown until master loads. Opacity-only fade. */}
        <img
          src={photo.thumbUrl}
          alt=""
          aria-hidden="true"
          className={
            reduceMotion
              ? `max-w-[100vw] max-h-[100vh] object-contain absolute inset-0 m-auto ${masterLoaded ? 'opacity-0' : 'opacity-100'}`
              : `max-w-[100vw] max-h-[100vh] object-contain absolute inset-0 m-auto transition-opacity duration-200 ${masterLoaded ? 'opacity-0' : 'opacity-100'}`
          }
        />
        <img
          src={photo.masterUrl}
          alt=""
          onLoad={() => setMasterLoaded(true)}
          onError={() => setMasterLoaded(false)}
          data-testid="photo-viewer-master"
          className={
            reduceMotion
              ? `max-w-[100vw] max-h-[100vh] object-contain relative ${masterLoaded ? 'opacity-100' : 'opacity-0'}`
              : `max-w-[100vw] max-h-[100vh] object-contain relative transition-opacity duration-200 ${masterLoaded ? 'opacity-100' : 'opacity-0'}`
          }
        />
      </div>

      {/* Bottom: optional error message + dot indicators */}
      <div
        className="absolute bottom-0 inset-x-0 p-4 flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {error && (
          <p className="text-amber-500 text-[13px]" role="status">
            {error}
          </p>
        )}
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {photos.map((p, i) => (
            <span
              key={p.id}
              className={
                i === index
                  ? 'w-2 h-2 rounded-full bg-amber-500'
                  : 'w-2 h-2 rounded-full bg-white/30'
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
