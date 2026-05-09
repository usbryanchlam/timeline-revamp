import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/auth/useApi';
import type { CityDTO } from '@/types/city';

// useCitiesQuery: minimal hook for GET /api/cities.
//
// Phase 5 doesn't justify pulling in TanStack Query — the only consumer is
// the reel boot path (which fetches once on mount) and the form submit
// path in 05-02 (which uses fetchCities directly outside of React).
//
// Returns:
//   data:    readonly CityDTO[] | undefined  (undefined while loading)
//   error:   Error | null
//   refetch: () => Promise<void>             (call after a write completes)
export function useCitiesQuery(): {
  readonly data: readonly CityDTO[] | undefined;
  readonly error: Error | null;
  readonly refetch: () => Promise<void>;
} {
  const api = useApi();
  const [data, setData] = useState<readonly CityDTO[] | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await api('/api/cities');
      if (!res.ok) {
        throw new Error(`API ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as readonly CityDTO[];
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [api]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, error, refetch };
}

// fetchCities: escape hatch for non-hook contexts (e.g. the form submit
// path in 05-02 wants to refresh the cities list after a successful
// create/update without re-rendering through a hook).
//
// Pass the `api` callable from useApi() — keeps the auth header attached
// without re-implementing token fetching here.
export async function fetchCities(
  api: ReturnType<typeof useApi>,
): Promise<readonly CityDTO[]> {
  const res = await api('/api/cities');
  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as readonly CityDTO[];
}
