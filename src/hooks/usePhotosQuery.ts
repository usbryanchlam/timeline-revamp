import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/auth/useApi';
import { listPhotos, type PhotoDTO } from '@/api/photos';

/**
 * usePhotosQuery — fetch a city's photos.
 *
 * Behavior:
 * - Auto-fetches on mount (and when cityId changes).
 * - Stale-response guard via reqIdRef prevents out-of-order responses from
 *   landing in state. Unmount sets sentinel -1 so any in-flight request
 *   discards its result.
 * - Caller-driven refetch via the returned `refetch` is safe to call from
 *   write paths — concurrent calls won't stomp each other.
 *
 * Returns:
 *   data:    readonly PhotoDTO[] | undefined  (undefined while loading)
 *   error:   Error | null
 *   refetch: () => Promise<void>             (call after a write completes)
 */
export function usePhotosQuery(cityId: string): {
  readonly data: readonly PhotoDTO[] | undefined;
  readonly error: Error | null;
  readonly refetch: () => Promise<void>;
} {
  const api = useApi();
  const [data, setData] = useState<readonly PhotoDTO[] | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const reqIdRef = useRef(0);

  // Sentinel -1 on unmount — any in-flight request discards its result.
  useEffect(() => {
    return () => {
      reqIdRef.current = -1;
    };
  }, []);

  const refetch = useCallback(async () => {
    const myId = ++reqIdRef.current;
    try {
      const photos = await listPhotos(api, cityId);
      if (myId !== reqIdRef.current) return;
      setData(photos);
      setError(null);
    } catch (e) {
      if (myId !== reqIdRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [api, cityId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, error, refetch };
}
