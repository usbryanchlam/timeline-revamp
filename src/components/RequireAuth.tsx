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
      void loginWithRedirect({
        appState: { returnTo: window.location.pathname + window.location.search },
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
