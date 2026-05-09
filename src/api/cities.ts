import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/auth/useApi';
import type { CityDTO } from '@/types/city';

/**
 * useCitiesQuery — fetch the current user's cities.
 *
 * Behavior:
 * - Auto-fetches on mount.
 * - Auto-refetches whenever the api callable changes (e.g., Auth0 silent
 *   token rotation may produce a new callable identity). One extra GET per
 *   rotation is acceptable; the stale-request guard ensures data correctness.
 * - Caller-driven refetch via the returned `refetch` is safe to call from
 *   write paths in 05-02 — concurrent calls won't stomp each other.
 *
 * Returns:
 *   data:    readonly CityDTO[] | undefined  (undefined while loading)
 *   error:   Error | null
 *   refetch: () => Promise<void>             (call after a write completes)
 */
export function useCitiesQuery(): {
  readonly data: readonly CityDTO[] | undefined;
  readonly error: Error | null;
  readonly refetch: () => Promise<void>;
} {
  const api = useApi();
  const [data, setData] = useState<readonly CityDTO[] | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    return () => {
      reqIdRef.current = -1;
    };
  }, []);

  const refetch = useCallback(async () => {
    const myId = ++reqIdRef.current;
    try {
      const res = await api('/api/cities');
      if (myId !== reqIdRef.current) return;
      if (!res.ok) {
        throw new Error(`API ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as readonly CityDTO[];
      if (myId !== reqIdRef.current) return;
      setData(json);
      setError(null);
    } catch (e) {
      if (myId !== reqIdRef.current) return;
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
