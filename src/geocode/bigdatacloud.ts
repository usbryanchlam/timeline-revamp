// Client-side only. BigDataCloud Fair Use Policy prohibits server-side calls
// to this endpoint. The keyless `reverse-geocode-client` endpoint is rate-
// limited per browser; calling it from the server (or any backend job) would
// pool requests under a single IP and trigger HTTP 402. The architectural
// guard in `server/auth/__no-bigdatacloud.test.ts` enforces that no file
// under server/ ever references "bigdatacloud" — keep this file out of any
// server import graph.

export interface GeocodeResult {
  readonly name: string;       // best-effort: city || locality || principalSubdivision || ''
  readonly country: string;    // countryName, may be ''
  readonly countryCode: string;
}

interface BigDataCloudResponse {
  readonly city?: string;
  readonly locality?: string;
  readonly principalSubdivision?: string;
  readonly countryName?: string;
  readonly countryCode?: string;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GeocodeResult | null> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null; // 402 means we violated Fair Use — should be impossible from src/
    const j = (await res.json()) as BigDataCloudResponse;
    return {
      name: j.city || j.locality || j.principalSubdivision || '',
      country: j.countryName ?? '',
      countryCode: j.countryCode ?? '',
    };
  } catch {
    return null; // network errors → caller opens form with empty fields
  }
}
