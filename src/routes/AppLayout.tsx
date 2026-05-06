import { Outlet } from 'react-router';
import { RequireAuth } from '@/components/RequireAuth';
import { BottomNav } from '@/components/BottomNav';

// AppLayout: the /app/* parent route. Phase 4 will wrap <Outlet /> in
// <Auth0Provider> + a redirect-to-login guard here. Do not inline this layout
// into the route config — keeping it as a real component is the seam that
// lets auth land without touching public routes. Bottom nav lands here in 03-02.
//
// Note on `pb-16`: BottomNav is fixed-positioned with h-16 (64px). Without
// bottom padding on the scrollable content area, the last items in Trips/Me
// would slide under the nav. The Reel route handles its own collision via
// the `.app-reel-host` class (see AppReelRoute + index.css).
export function AppLayout() {
  return (
    <RequireAuth>
      <div className="min-h-dvh bg-bg text-ink pb-16">
        <Outlet />
        <BottomNav />
      </div>
    </RequireAuth>
  );
}
