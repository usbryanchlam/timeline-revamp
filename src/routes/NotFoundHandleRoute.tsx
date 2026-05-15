import { Link } from 'react-router';

// D-11: handle-specific 404. Distinct from generic NotFoundRoute so the
// copy speaks to "that handle doesn't exist" instead of "page not found".
export function NotFoundHandleRoute({ handle }: { readonly handle?: string }) {
  return (
    <main className="min-h-dvh bg-bg text-ink flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-display text-2xl">No reel at @{handle}</h1>
      <p className="text-ink-mute">That handle doesn&apos;t exist yet.</p>
      <Link to="/" className="underline underline-offset-4">Back to home</Link>
    </main>
  );
}
