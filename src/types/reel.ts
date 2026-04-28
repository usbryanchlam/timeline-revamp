export type Coordinates = readonly [longitude: number, latitude: number];

export interface PhotoSeed {
  readonly id: string;
  readonly gradient: readonly [string, string];
  readonly alt: string;
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
  readonly photos: readonly PhotoSeed[];
}

export type ReelStateName =
  | 'IDLE'
  | 'SCRUBBING'
  | 'CHAPTER_SWIPE'
  | 'MAP_INTERACT'
  | 'PAUSED'
  | 'SUSPENDED';
