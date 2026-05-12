// TripsRoute — authenticated /app/trips view.
//
// Composition: top-half MapPicker, bottom-half cities list, plus a transient
// CityForm modal/sheet for create-or-edit. 05-02 task 3 replaces the
// previous DraftPinPanel placeholder with the real Zod-validated form
// (POST/PATCH/DELETE /api/cities).
//
// Mutual-exclusion rule: at most one of { draftPin, editingId } is set at a
// time. Picking on the map clears any open edit; clicking a CityCard or its
// map marker clears any draft pin. This guarantees CityForm renders exactly
// one mode at a time.
//
// Reactive marker sync on MapPicker is still deferred (see SUMMARY) — after
// save we refetch the cities list, but the map markers reflect the snapshot
// captured at MapPicker mount. 05-03 (reorder) will need to revisit this and
// is the natural place to introduce live marker sync.

import { useCallback, useState } from 'react';
import { useCitiesQuery } from '@/api/cities';
import { reverseGeocode, type GeocodeResult } from '@/geocode/bigdatacloud';
import { MapPicker } from '@/components/MapPicker';
import { CityForm } from '@/components/CityForm';
import type { CityDTO } from '@/types/city';

interface DraftPin {
  readonly lat: number;
  readonly lng: number;
}

export function TripsRoute() {
  const { data: cities, error, refetch } = useCitiesQuery();
  const [draftPin, setDraftPin] = useState<DraftPin | null>(null);
  const [geocoded, setGeocoded] = useState<GeocodeResult | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingCity = cities?.find((c) => c.id === editingId) ?? null;

  const handlePick = useCallback((lat: number, lng: number) => {
    // Map pick wins over any open edit — close edit first.
    setEditingId(null);
    setDraftPin({ lat, lng });
    setGeocoded(null); // clear stale lookup before the new one resolves
    setLookupPending(true);
    void reverseGeocode(lat, lng)
      .then((res) => setGeocoded(res))
      .finally(() => setLookupPending(false));
  }, []);

  const handleCityClick = useCallback((id: string) => {
    // Clicking a city wins over an in-progress draft pin.
    setDraftPin(null);
    setGeocoded(null);
    setLookupPending(false);
    setEditingId(id);
  }, []);

  const closePanel = useCallback(() => {
    setDraftPin(null);
    setGeocoded(null);
    setLookupPending(false);
    setEditingId(null);
  }, []);

  const handleSaved = useCallback(() => {
    closePanel();
    void refetch();
  }, [closePanel, refetch]);

  const handleDeleted = useCallback(() => {
    closePanel();
    void refetch();
  }, [closePanel, refetch]);

  const isLoading = cities === undefined && !error;
  const empty = cities !== undefined && cities.length === 0;

  // CityForm prefill needs a non-empty name (Zod min(1)). If reverse-geocode
  // is still pending or returned nothing usable, fall back to a generic
  // "New city" placeholder so the user can immediately type a real name
  // without the empty-name validation tripping on first render.
  const draftPrefillName = geocoded?.name || (lookupPending ? '' : 'New city');
  const draftPrefillCountry = geocoded?.country ?? '';

  return (
    <main className="h-[calc(100dvh-4rem)] flex flex-col">
      {cities !== undefined ? (
        <div className="h-1/2 relative">
          <MapPicker
            cities={cities}
            draftPin={draftPin}
            onPick={handlePick}
            onCityClick={handleCityClick}
          />
          {empty && (
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-max max-w-[90%] glass-pill px-4 py-3 rounded-full text-ink text-sm pointer-events-none">
              Drop a pin on the map to start your reel
            </div>
          )}
        </div>
      ) : (
        // Placeholder reserves the map area while cities load — prevents
        // layout shift on resolve and avoids mounting MapPicker with [] (which
        // would lock its lazy-init snapshot to an empty city set).
        <div
          className="h-1/2 bg-bg-elev animate-pulse"
          aria-label="Loading map"
          aria-busy="true"
        />
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-line bg-bg-elev p-3 text-sm text-ink-dim flex items-center justify-between gap-3"
          >
            <span>Couldn't load your cities. {error.message}</span>
            <button
              type="button"
              onClick={() => {
                void refetch();
              }}
              className="text-amber-500 font-semibold"
            >
              Retry
            </button>
          </div>
        )}

        {isLoading && (
          <ul className="space-y-3" aria-label="Loading cities">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="h-16 rounded-lg bg-bg-elev border border-line animate-pulse"
              />
            ))}
          </ul>
        )}

        {!isLoading && !error && cities && cities.length > 0 && (
          <ul className="space-y-3">
            {cities.map((city) => (
              <CityCard
                key={city.id}
                city={city}
                onClick={() => handleCityClick(city.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {draftPin && !lookupPending && (
        <CityForm
          mode="create"
          prefill={{
            lat: draftPin.lat,
            lng: draftPin.lng,
            name: draftPrefillName,
            country: draftPrefillCountry,
          }}
          onCancel={closePanel}
          onSaved={handleSaved}
        />
      )}
      {draftPin && lookupPending && (
        // Light loading scrim while reverse-geocode resolves. Keeps the user
        // from seeing an empty name field jump to the geocoded value mid-type.
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
          role="status"
          aria-label="Looking up location"
        >
          <p className="text-ink-dim text-sm">Looking up location…</p>
        </div>
      )}

      {editingCity && (
        <CityForm
          mode="edit"
          city={editingCity}
          onCancel={closePanel}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </main>
  );
}

// CityCard stays inline (extraction is a Phase 6 follow-up flagged in 05-01).
function CityCard({
  city,
  onClick,
}: {
  readonly city: CityDTO;
  readonly onClick: () => void;
}) {
  const arrived = formatArrived(city.arrivedAt);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left rounded-lg bg-bg-elev border border-line p-3 hover:border-amber-500/40 transition-colors"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-ink font-semibold truncate">{city.name}</span>
          <span className="text-ink-mute text-xs whitespace-nowrap">{arrived}</span>
        </div>
        {city.caption && (
          <p className="mt-1 text-ink-dim text-sm line-clamp-2">{city.caption}</p>
        )}
      </button>
    </li>
  );
}

function formatArrived(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
