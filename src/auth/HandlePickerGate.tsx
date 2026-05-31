import { useEffect, useState, type ReactNode } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useApi } from '@/auth/useApi';
import { HandlePickerModal } from '@/auth/HandlePickerModal';
import { suggestHandle } from '@/auth/suggestHandle';

interface MeResponse {
  id: string;
  email: string;
  handle: string | null;
  createdAt: string;
}

// AUTH-07: prompt users without a handle on first authenticated visit.
// Mounted INSIDE RequireAuth (which guarantees we're authenticated by
// the time this runs). Fetches /api/me; if handle is null, renders
// the modal as a sibling of children — children stay in the DOM (so
// the URL is unchanged) but are visually obscured by the modal scrim.
//
// AbortController on the in-flight /api/me prevents:
//   - React strict-mode double-invocation warnings in dev
//   - State writes after unmount (which would warn "can't update on
//     unmounted component" and leak a tiny bit of memory)
//
// The modal does NOT appear until the /api/me round-trip completes —
// for a sub-second moment the user sees the AppLayout chrome with no
// modal. Acceptable; avoids a flash-of-modal when the user already
// has a handle.
export function HandlePickerGate({ children }: { children: ReactNode }) {
  const api = useApi();
  const { user } = useAuth0();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Derived once at render. The Auth0 user object is stable across renders
  // for an authenticated session, so re-computing on every render is cheap.
  // Reads three standard claims; absent claims become empty strings and
  // the next candidate is tried.
  const suggestedHandle = suggestHandle({
    nickname: user?.nickname,
    email: user?.email,
    given_name: user?.given_name,
  });

  useEffect(() => {
    const ctrl = new AbortController();
    api('/api/me', { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`me failed: ${res.status}`);
        const m = (await res.json()) as MeResponse;
        setMe(m);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        // AbortError is expected on unmount — skip state writes after abort.
        if ((err as { name?: string }).name !== 'AbortError') setLoaded(true);
      });
    return () => ctrl.abort();
  }, [api]);

  return (
    <>
      {children}
      {loaded && me && me.handle === null && (
        <HandlePickerModal
          suggestedHandle={suggestedHandle}
          onPicked={(handle) => setMe({ ...me, handle })}
        />
      )}
    </>
  );
}
