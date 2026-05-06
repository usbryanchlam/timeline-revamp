// RequireAuth: Phase 3 stub — returns children as-is.
// Phase 4 (per ROADMAP) replaces this body with:
//   - check Auth0 session
//   - if loading: render <SplashScreen />
//   - if unauthenticated: <Navigate to="/" replace />
//   - if authenticated: render {children}
// Do not delete or inline this component — it is the route-guard seam
// for the entire /app/* tree.
import type { ReactNode } from 'react';

export function RequireAuth({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
