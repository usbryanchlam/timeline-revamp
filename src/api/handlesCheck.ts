import { useEffect, useRef, useState } from 'react';

// AUTH-05/06/07 — Phase 7 D-02.
// useHandleCheck — debounced live availability check for the handle
// picker. Pairs with the new public GET /api/handles/check endpoint
// (server/routes/handlesCheck.ts).
//
// Behavior contract:
//   - 300ms debounce after the last input change (D-02).
//   - Stale in-flight requests are aborted on each new keystroke via
//     AbortController.
//   - A slow response that arrives after a fresher one is dropped via
//     the reqIdRef sentinel (project invariant — see project memory
//     feedback-mountedref-strictmode for the StrictMode landmine that
//     ruled out the cleanup-only-boolean alternative).
//   - `enabled=false` short-circuits to 'idle' so the modal can skip the
//     network call entirely while local validateHandle is still failing
//     (saves round-trips on garbage input).
//
// Public endpoint: NO Authorization header — bare fetch only, no
// auth-aware api callable. No TanStack Query — the project doesn't
// have it installed (RESEARCH §Alternatives Considered).

export type HandleCheckState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available' }
  | {
      state: 'unavailable';
      reason: 'too_short' | 'too_long' | 'invalid_chars' | 'reserved' | 'taken';
    }
  | { state: 'error' };

type ServerResponse =
  | { available: true }
  | {
      available: false;
      reason: 'too_short' | 'too_long' | 'invalid_chars' | 'reserved' | 'taken';
    };

export function useHandleCheck(
  candidate: string,
  enabled: boolean,
): HandleCheckState {
  const [result, setResult] = useState<HandleCheckState>({ state: 'idle' });
  const reqIdRef = useRef(0);

  // Unmount sentinel: any in-flight response with myId !== -1 is dropped.
  // Cleanup-only is fine HERE because the increment-on-each-request
  // pattern is the comparison key — we're not relying on the ref's
  // initial value across mounts (the landmine in
  // feedback_mountedref_strictmode.md).
  useEffect(() => {
    return () => {
      reqIdRef.current = -1;
    };
  }, []);

  useEffect(() => {
    if (!enabled || candidate.length === 0) {
      setResult({ state: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    const myId = ++reqIdRef.current;
    setResult({ state: 'checking' });

    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/handles/check?candidate=${encodeURIComponent(candidate)}`,
          { signal: ctrl.signal },
        );
        if (myId !== reqIdRef.current) return;
        if (!res.ok) {
          setResult({ state: 'error' });
          return;
        }
        const json = (await res.json()) as ServerResponse;
        if (myId !== reqIdRef.current) return;
        if (json.available) {
          setResult({ state: 'available' });
        } else {
          setResult({ state: 'unavailable', reason: json.reason });
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        if (myId !== reqIdRef.current) return;
        setResult({ state: 'error' });
      }
    }, 300);

    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [candidate, enabled]);

  return result;
}
