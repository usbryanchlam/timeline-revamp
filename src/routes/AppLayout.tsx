import { Outlet } from 'react-router';
import { RequireAuth } from '@/components/RequireAuth';
import { BottomNav } from '@/components/BottomNav';
import { AuthProvider } from '@/auth/AuthProvider';
import { HandlePickerGate } from '@/auth/HandlePickerGate';

// AppLayout: the /app/* parent route. Phase 3 added BottomNav +
// RequireAuth (stub). Phase 4 (this plan) adds:
//   - <AuthProvider>: scopes the Auth0 SDK to /app/* only (AUTH-04).
//     Public reel routes (/ and /u/:handle in App.tsx) do NOT mount
//     this — that's the architectural seam preventing Auth0 silent-auth
//     traffic on the public surface.
//   - <HandlePickerGate>: AUTH-07 — modal on first visit if handle is
//     null. Runs /api/me on mount; renders children + (conditional)
//     modal sibling.
//
// Order matters. AuthProvider must wrap RequireAuth (RequireAuth
// calls useAuth0, which throws outside Auth0Provider). HandlePickerGate
// must be inside RequireAuth (it calls /api/me, which requires auth).
//
// pb-16 preserved from 03-02: BottomNav is fixed-positioned with
// h-16 (64px) — without bottom padding, the last items in
// Trips/Me would slide under the nav.
export function AppLayout() {
  return (
    <AuthProvider>
      <RequireAuth>
        <HandlePickerGate>
          <div className="min-h-dvh bg-bg text-ink pb-16">
            <Outlet />
            <BottomNav />
          </div>
        </HandlePickerGate>
      </RequireAuth>
    </AuthProvider>
  );
}
