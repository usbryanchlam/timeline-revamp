import { Outlet } from 'react-router';

// AppLayout: the /app/* parent route. Phase 4 will wrap <Outlet /> in
// <Auth0Provider> + a redirect-to-login guard here. Do not inline this layout
// into the route config — keeping it as a real component is the seam that
// lets auth land without touching public routes. Bottom nav lands here in 03-02.
export function AppLayout() {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <Outlet />
    </div>
  );
}
