// PhotoDetailSheet — bottom sheet (mobile) / centered modal (md+) for a
// city's photos. Mirrors CityForm.tsx's responsive layout pattern.
//
// Phase 11 / A11Y-06: Converted from a div role="dialog" wrapper to a native
// <dialog> opened via showModal(). The browser provides the focus trap +
// backdrop natively. Esc dismissal uses the close-watcher anti-modal-trap
// pattern (see ~/.claude/projects/.../memory/feedback_dialog_double_esc.md
// and src/auth/HandlePickerModal.tsx as the reference implementation):
//   1. cancel event preventDefault'd → blocks browser's first close request
//   2. document-level keydown in CAPTURE phase → wins the race against
//      Chromium's close-watcher logic and routes Esc to our onClose handler

import { useEffect, useRef, useState } from 'react';
import type { CityDTO } from '@/types/city';
import { PhotoGrid } from './PhotoGrid';
import { PhotoUploader } from './PhotoUploader';
import { PhotoViewer } from './PhotoViewer';
import { usePhotosQuery } from '@/hooks/usePhotosQuery';
import type { PhotoDTO } from '@/api/photos';

interface PhotoDetailSheetProps {
  readonly city: CityDTO;
  readonly onClose: () => void;
}

export function PhotoDetailSheet({ city, onClose }: PhotoDetailSheetProps) {
  const mountedRef = useRef(true);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    // Capture pre-open focus + move focus into the sheet.
    // Re-anchor on every (re-)mount: StrictMode double-invoke leaves mountedRef
    // stuck at false on second mount if we only set in the effect cleanup
    // (memory: feedback_mountedref_strictmode.md).
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      mountedRef.current = false;
      // Restore focus to whoever opened us (focus return — NOT a no-op).
      previousFocusRef.current?.focus();
    };
  }, []);

  // Native <dialog> open + close-watcher anti-modal-trap (memory:
  // feedback_dialog_double_esc.md). Mirrors HandlePickerModal exactly.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && d.open) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    d.addEventListener('cancel', onCancel);
    document.addEventListener('keydown', onKeyDown, /* capture */ true);
    return () => {
      d.removeEventListener('cancel', onCancel);
      document.removeEventListener('keydown', onKeyDown, true);
      if (d.open) d.close();
    };
  }, [onClose]);

  const { data, error, refetch } = usePhotosQuery(city.id);
  const [localPhotos, setLocalPhotos] = useState<readonly PhotoDTO[] | undefined>(undefined);
  useEffect(() => {
    setLocalPhotos(data);
  }, [data]);

  const [viewer, setViewer] = useState<{ open: boolean; initialIndex: number }>({
    open: false,
    initialIndex: 0,
  });

  const photos = localPhotos ?? [];

  const handlePhotoDeleted = (photoId: string) => {
    setLocalPhotos((prev) => prev?.filter((p) => p.id !== photoId));
  };

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-label={`Photos for ${city.name}`}
      // Click on the backdrop region closes; the inner content stops
      // propagation so taps on the sheet body do not dismiss.
      onClick={(e) => {
        // The native dialog backdrop is exposed as the dialog element itself
        // for click events (target === currentTarget when the user clicks the
        // backdrop area). Inner content uses stopPropagation below.
        if (e.target === e.currentTarget) onClose();
      }}
      className="
        fixed inset-0 z-50 m-0 p-0 max-w-none max-h-none w-screen h-screen
        bg-transparent
        backdrop:bg-black/40
      "
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="
          fixed inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto
          rounded-t-3xl bg-bg-elev border border-line p-6 space-y-4
          md:inset-0 md:max-w-md md:mx-auto md:my-auto md:rounded-3xl md:max-h-[80vh]
          shadow-[0_30px_80px_-30px_rgba(0,0,0,0.4)]
        "
      >
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-display text-h1 text-ink">{city.name}</h2>
            {city.caption && (
              <p className="text-ink-mute text-[15px] leading-snug mt-1">
                {city.caption}
              </p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="text-ink-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-md p-1 min-w-[44px]"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {error && (
          <p className="text-amber-500 text-[13px]">Couldn't load photos.</p>
        )}

        <PhotoGrid
          photos={photos}
          onPhotoClick={(_p, idx) => setViewer({ open: true, initialIndex: idx })}
        />

        <PhotoUploader
          cityId={city.id}
          remainingCap={Math.max(0, 10 - photos.length)}
          onUploaded={() => {
            void refetch();
          }}
        />
      </div>

      {viewer.open && photos.length > 0 && (
        <PhotoViewer
          photos={photos}
          initialIndex={viewer.initialIndex}
          cityId={city.id}
          onClose={() => setViewer({ open: false, initialIndex: 0 })}
          onPhotoDeleted={handlePhotoDeleted}
        />
      )}
    </dialog>
  );
}
