import { useCallback, useEffect, useRef, useState } from 'react';
import type { CityDTO } from '@/types/city';

export interface PublicReelPhotoDTO {
  readonly id: string;
  readonly cityId: string;
  readonly masterUrl: string;
  readonly thumbUrl: string;
  readonly orderIndex: number;
}

export interface PublicReelDTO {
  readonly user: { readonly handle: string; readonly displayName: string | null };
  readonly cities: readonly CityDTO[];
  readonly photos: readonly PublicReelPhotoDTO[];
}

export type PublicReelState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: PublicReelDTO }
  | { kind: 'not_found' }
  | { kind: 'error'; error: Error };

/**
 * usePublicReel — fetch the public reel payload for a handle.
 *
 * - No auth header (public endpoint).
 * - reqIdRef sentinel for stale-drop discipline; see project memory
 *   feedback_mountedref_strictmode.md for why the alternative pattern
 *   (a boolean cleanup-only ref) fails under StrictMode double-mount.
 * - 404 → distinct state (not collapsed to 'error') so the route can render
 *   NotFoundHandleRoute without a string-match on the error.
 */
export function usePublicReel(handle: string): PublicReelState {
  const [state, setState] = useState<PublicReelState>({ kind: 'loading' });
  const reqIdRef = useRef(0);

  useEffect(() => {
    return () => {
      reqIdRef.current = -1;
    };
  }, []);

  const refetch = useCallback(async () => {
    const myId = ++reqIdRef.current;
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/public/u/${encodeURIComponent(handle)}`);
      if (myId !== reqIdRef.current) return;
      if (res.status === 404) {
        setState({ kind: 'not_found' });
        return;
      }
      if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
      const data = (await res.json()) as PublicReelDTO;
      if (myId !== reqIdRef.current) return;
      setState({ kind: 'ok', data });
    } catch (e) {
      if (myId !== reqIdRef.current) return;
      setState({ kind: 'error', error: e instanceof Error ? e : new Error(String(e)) });
    }
  }, [handle]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return state;
}
