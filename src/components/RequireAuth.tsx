// RequireAuth: gates the entire /app/* tree behind Auth0 Universal
// Login. Phase 3 shipped a stub that returned children as-is; this
// plan (04-02) fills in the real check.
//
// Mount order matters: AuthProvider must wrap RequireAuth (because
// useAuth0() throws outside an Auth0Provider). AppLayout enforces
// that ordering — see src/routes/AppLayout.tsx.
//
// Behavior:
//   - isLoading        → "Signing in…" splash (covers initial silent
//                        auth attempt + post-redirect token exchange)
//   - !isAuthenticated → loginWithRedirect with appState.returnTo set
//                        to the current pathname so the user comes back
//                        to where they were trying to go
//   - authenticated    → render children
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, loginWithRedirect } = useAuth0();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // ?signup=1 on the entry URL routes the user to Auth0's signup tab
      // instead of the login tab. Used by the "Make your own" CTA on the
      // public reel surface — that link can't call loginWithRedirect itself
      // because Auth0Provider is scoped to /app/* (AUTH-04 architectural
      // seam, src/auth/AuthProvider.tsx), so it just navigates here and we
      // forward the hint.
      const isSignup = new URLSearchParams(window.location.search).has('signup');
      void loginWithRedirect({
        appState: { returnTo: window.location.pathname },
        authorizationParams: isSignup ? { screen_hint: 'signup' } : undefined,
      });
    }
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg text-ink-mute">
        <span className="text-caps">Signing in…</span>
      </div>
    );
  }

  return <>{children}</>;
}
