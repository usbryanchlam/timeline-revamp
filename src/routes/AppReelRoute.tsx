import { Link } from 'react-router';
import { useCitiesQuery } from '@/api/cities';
import { groupChapters } from '@/reel/groupChapters';
import { chaptersWithPhotos } from '@/reel/chaptersWithPhotos';
import { useAllPhotos } from '@/hooks/useAllPhotos';
import { Reel } from '@/reel/Reel';
import { ReducedMotionReel } from '@/reel/ReducedMotionReel';
import { usePrefersReducedMotion } from '@/reel/usePrefersReducedMotion';

// `.app-reel-host` is the marker class read by index.css to lift the
// ChapterRail above the BottomNav (h-16 = 64px) on `/app/`. The public reel
// at `/` does not get this class, so its rail anchors to the default
// `max(env(safe-area-inset-bottom), 32px)`.
//
// Phase 5 wires this route to the logged-in user's cities via useCitiesQuery.
// Public routes (`/`, `/u/:handle`) remain on SEEDED_CITIES — both Reel and
// ReducedMotionReel accept an optional `chapters` prop and fall back to the
// seeded data when no prop is passed.
//
// Phase 6 / REEL-09: useAllPhotos fans out GET /api/cities/:id/photos for
// each city. chaptersWithPhotos merges the photo map into the chapter pipeline
// produced by groupChapters. The reel doesn't jolt on photo arrival — chapter
// layout is fixed; the photo cycle appears in the stack slot once data lands.
export function AppReelRoute() {
  const reduced = usePrefersReducedMotion();
  const { data: cities, error, refetch } = useCitiesQuery();

  // Loading: dark map bg, no card flash. Keep dimensions consistent so the
  // reel doesn't jolt into place when data arrives.
  if (cities === undefined) {
    return <div className="app-reel-host h-[100dvh] bg-bg-map" />;
  }

  if (error) {
    return (
      <div className="app-reel-host h-[100dvh] bg-bg flex items-center justify-center p-6">
        <div className="space-y-3 text-center">
          <p className="text-ink">Couldn&apos;t load your reel.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="bg-amber-500 text-black px-4 py-2 rounded-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (cities.length === 0) {
    return (
      <div className="app-reel-host h-[100dvh] bg-bg flex items-center justify-center p-6">
        <div className="space-y-4 text-center max-w-sm">
          <h2 className="text-display text-2xl">No trips yet.</h2>
          <p className="text-ink-mute">
            Add your first city to start the camera flying.
          </p>
          <Link
            to="/app/trips"
            className="inline-block bg-amber-500 text-black px-4 py-2 rounded-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Add a city
          </Link>
        </div>
      </div>
    );
  }

  // REEL-09: collapse adjacent identical-coord cities into one chapter group.
  // Adjacent-dedup from groupChapters is preserved — chaptersWithPhotos cycles
  // photos WITHIN a single ChapterGroup, never across group boundaries.
  // NOTE: country renders blank for /app/-reel chapters — see groupChapters.ts v1 limitation.
  return <AppReelContent cities={cities} reduced={reduced} />;
}

// Extracted inner component so hooks (useAllPhotos) are always called at the
// top level of a component that's always rendered (not conditionally inside a
// branch). React rules-of-hooks: hooks must not be called after early returns.
function AppReelContent({
  cities,
  reduced,
}: {
  readonly cities: NonNullable<ReturnType<typeof useCitiesQuery>['data']>;
  readonly reduced: boolean;
}) {
  // Phase 6 / REEL-09: real photos cycle within each chapter.
  // photosByCityId resolves to an empty Map on first render; chapters
  // render with empty photos until the fan-out resolves.
  const photosByCityId = useAllPhotos(cities);
  const groups = groupChapters(cities);
  const chapters = chaptersWithPhotos(groups, photosByCityId);

  return (
    <div className="app-reel-host">
      {reduced ? (
        <ReducedMotionReel chapters={chapters} />
      ) : (
        <Reel chapters={chapters} />
      )}
    </div>
  );
}
