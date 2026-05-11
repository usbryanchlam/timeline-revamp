// CityDTO mirrors the JSON shape returned by GET /api/cities.
//
// Note on dates: Drizzle hydrates `timestamp` columns to JS Date objects on
// the server, but those become ISO strings once they cross the JSON wire.
// We type `arrivedAt`, `createdAt`, and `updatedAt` as `string` to reflect
// what the client actually receives — never `Date`. Consumers that need a
// Date should `new Date(dto.arrivedAt)` at the point of use.
export interface CityDTO {
  readonly id: string;
  readonly userId: string;
  readonly orderIndex: number;
  readonly name: string;
  readonly tripLabel: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly zoom: number;
  readonly pitch: number;
  readonly bearing: number;
  readonly arrivedAt: string; // ISO timestamp
  readonly caption: string | null;
  readonly createdAt: string; // ISO timestamp
  readonly updatedAt: string; // ISO timestamp
}
