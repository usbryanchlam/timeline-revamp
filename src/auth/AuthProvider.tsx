import { Auth0Provider } from '@auth0/auth0-react';
import { useNavigate } from 'react-router';
import type { ReactNode } from 'react';

// AUTH-04 enforcement seam. Mounted ONLY inside AppLayout. Public reel
// routes (/, /u/:handle) do NOT import or render this component, so
// the @auth0/auth0-react chunk only loads when /app/* mounts.
//
// Throws synchronously if any VITE_AUTH0_* env var is missing — fail
// fast in dev, fail-fast on every CI build that doesn't set them.
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  if (!domain || !clientId || !audience) {
    throw new Error(
      'VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, VITE_AUTH0_AUDIENCE must all be set',
    );
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin + '/app',
        audience,
        scope: 'openid profile email',
      }}
      cacheLocation="memory"
      onRedirectCallback={(appState) => {
        const returnTo =
          (appState as { returnTo?: string } | undefined)?.returnTo ?? '/app';
        navigate(returnTo, { replace: true });
      }}
    >
      {children}
    </Auth0Provider>
  );
}
