import type { PhotoDTO } from '@/api/photos';

interface PhotoGridProps {
  readonly photos: readonly PhotoDTO[];
  readonly onPhotoClick?: (photo: PhotoDTO, index: number) => void;
}

export function PhotoGrid({ photos, onPhotoClick }: PhotoGridProps) {
  if (photos.length === 0) {
    // No empty-state illustration (DESIGN.md locked risk #3). Plain text.
    return (
      <p className="text-ink-mute text-[15px] py-6 text-center">
        No photos yet.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-3 gap-2 md:grid-cols-4">
      {photos.map((p, idx) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onPhotoClick?.(p, idx)}
            className="block w-full aspect-square overflow-hidden rounded-xl bg-bg-elev focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg min-w-[44px]"
          >
            <img
              src={p.thumbUrl}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
