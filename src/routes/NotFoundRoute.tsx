import { Link } from 'react-router';

export function NotFoundRoute() {
  return (
    <main className="min-h-dvh bg-bg text-ink flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-display text-2xl">Not found</h1>
      <Link to="/" className="underline underline-offset-4">
        Back to reel
      </Link>
    </main>
  );
}
