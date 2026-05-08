import { useAuth0 } from '@auth0/auth0-react';
import { useCallback } from 'react';

// useApi: returns a fetch-shaped function that auto-attaches the
// Auth0 access token as a Bearer Authorization header on every call.
// Components call api('/api/me', { ... }) and never see the token.
//
// getAccessTokenSilently is cached by the Auth0 SDK; calling it on
// every request is cheap (returns the cached token unless it's near
// expiry, in which case it silently refreshes).
export function useApi() {
  const { getAccessTokenSilently } = useAuth0();
  return useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getAccessTokenSilently();
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
    [getAccessTokenSilently],
  );
}

// useApiJson: thin convenience over useApi for the common "fetch JSON,
// throw on non-2xx" case. Generic T is the expected response shape.
export function useApiJson<T>() {
  const api = useApi();
  return useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
      const res = await api(input, init);
      if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
      return (await res.json()) as T;
    },
    [api],
  );
}
