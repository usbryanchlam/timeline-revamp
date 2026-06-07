export type Coordinates = readonly [longitude: number, latitude: number];

/** Public seeded reel — gradient placeholder. */
export interface PhotoSeed {
  readonly id: string;
  readonly gradient: readonly [string, string];
  readonly alt: string;
}

/** Real photo at a URL. Two sources today:
 *  - /app/ reel: PhotoCard[] from /api/cities/:id/photos (Phase 6) — OCI public URLs (DATA-07).
 *  - Public seeded reel: PhotoCard[] from src/data/seeded-cities.ts — local /seed-photos/... files.
 *  Both render through PhotoCycle (crossfade cycling). */
export interface PhotoCard {
  readonly id: string;
  readonly masterUrl: string;     // OCI public URL or local /seed-photos/... path
  readonly thumbUrl: string;      // Same family as masterUrl; placeholder while master loads
  readonly alt: string;           // empty string '' when no caption (A11Y-05)
  readonly orderIndex: number;
}

/** Union: chapters from /app/ have PhotoCard[], chapters from / and /u/:handle have PhotoSeed[]. */
export type ReelPhoto = PhotoSeed | PhotoCard;

/** Type-guard used by ChapterOverlay + ReducedMotionReel to branch. */
export function isPhotoCard(p: ReelPhoto): p is PhotoCard {
  return 'masterUrl' in p;
}

export interface CityChapter {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly center: Coordinates;
  readonly zoom: number;
  readonly pitch: number;
  readonly bearing: number;
  readonly arrivedAt: string;
  readonly caption: string;
  readonly photos: readonly ReelPhoto[];
}

export type ReelStateName =
  | 'IDLE'
  | 'SCRUBBING'
  | 'CHAPTER_SWIPE'
  | 'MAP_INTERACT'
  | 'PAUSED'
  | 'SUSPENDED';
