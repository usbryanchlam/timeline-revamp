// PhotoDetailSheet — bottom sheet (mobile) / centered modal (md+) for a
// city's photos. Mirrors CityForm.tsx's responsive layout pattern.
//
// Phase 6 scope:
//   - Read-only display of caption (caption EDIT deferred per CONTEXT.md)
//   - Grid of thumbnails (PhotoGrid)
//   - PhotoUploader for adding new photos
//   - Tap a thumbnail → open PhotoViewer at that index
//   - Per-photo delete lives INSIDE PhotoViewer (this plan, task 4)

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

  // Escape-to-close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
    <div
      className="fixed inset-0 z-50 bg-black/40"
      onClick={() => onClose()}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Photos for ${city.name}`}
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
    </div>
  );
}
