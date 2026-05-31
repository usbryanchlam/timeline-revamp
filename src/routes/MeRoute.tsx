import { useAuth0 } from '@auth0/auth0-react';

// MeRoute — minimal v1 profile page. Shows the signed-in user's display
// info from the Auth0 ID token (no extra API call) plus a Sign Out
// button. Lives inside <AppLayout> which is wrapped by AuthProvider +
// RequireAuth, so useAuth0() is safe here.
//
// Future iterations: handle reservation status, photo storage usage,
// account deletion, etc. Tracked as a follow-up — see Phase 9 backlog.
export function MeRoute() {
  const { user, logout } = useAuth0();

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-display text-2xl">Me</h1>

      <section className="rounded-2xl border border-line bg-bg-elev p-4 space-y-3">
        {user?.picture && (
          <img
            src={user.picture}
            alt=""
            className="w-16 h-16 rounded-full border border-line"
          />
        )}
        <dl className="space-y-1 text-sm">
          {user?.name && (
            <div className="flex gap-2">
              <dt className="text-ink-mute w-16">Name</dt>
              <dd className="text-ink">{user.name}</dd>
            </div>
          )}
          {user?.email && (
            <div className="flex gap-2">
              <dt className="text-ink-mute w-16">Email</dt>
              <dd className="text-ink">{user.email}</dd>
            </div>
          )}
        </dl>
      </section>

      <button
        type="button"
        onClick={() => {
          void logout({ logoutParams: { returnTo: window.location.origin } });
        }}
        className="w-full rounded-lg border border-line bg-bg-elev px-4 py-3 text-ink font-semibold active:opacity-70 transition-opacity duration-[120ms]"
      >
        Sign out
      </button>
    </main>
  );
}
