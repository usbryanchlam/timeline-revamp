// TripsRoute — authenticated /app/trips view.
//
// Composition: top-half MapPicker, bottom-half cities list, plus a transient
// DraftPinPanel when the user drops a pin. The panel here is INTENTIONALLY a
// minimal placeholder for plan 05-01 task 3: it shows the prefilled
// reverse-geocoded name/country and a disabled Save button labeled
// "(Saving lands in 05-02)". Plan 05-02 replaces this panel with the real
// create/edit form (Zod-validated POST /api/cities). The CityCard list item
// is also inline + minimal here; 05-02 may extract it to its own file.

import { useCallback, useState } from 'react';
import { useCitiesQuery } from '@/api/cities';
import { reverseGeocode, type GeocodeResult } from '@/geocode/bigdatacloud';
import { MapPicker } from '@/components/MapPicker';
import type { CityDTO } from '@/types/city';

interface DraftPin {
  readonly lat: number;
  readonly lng: number;
}

export function TripsRoute() {
  const { data: cities, error, refetch } = useCitiesQuery();
  const [draftPin, setDraftPin] = useState<DraftPin | null>(null);
  const [geocoded, setGeocoded] = useState<GeocodeResult | null>(null);

  const handlePick = useCallback((lat: number, lng: number) => {
    setDraftPin({ lat, lng });
    setGeocoded(null); // clear stale lookup before the new one resolves
    void reverseGeocode(lat, lng).then((res) => setGeocoded(res));
  }, []);

  const closePanel = useCallback(() => {
    setDraftPin(null);
    setGeocoded(null);
  }, []);

  const isLoading = cities === undefined && !error;
  const empty = cities !== undefined && cities.length === 0;

  return (
    <main className="h-[calc(100dvh-4rem)] flex flex-col">
      <div className="h-1/2 relative">
        <MapPicker
          cities={cities ?? []}
          draftPin={draftPin}
          onPick={handlePick}
        />
        {empty && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-max max-w-[90%] glass-pill px-4 py-3 rounded-full text-ink text-sm pointer-events-none">
            Drop a pin on the map to start your reel
          </div>
        )}
      </div>

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
              <CityCard key={city.id} city={city} />
            ))}
          </ul>
        )}
      </div>

      {draftPin && (
        <DraftPinPanel
          pin={draftPin}
          prefill={geocoded}
          onClose={closePanel}
        />
      )}
    </main>
  );
}

// --- Inline placeholder components --------------------------------------
// Both CityCard and DraftPinPanel are deliberately small and inline for plan
// 05-01. They will be extracted/replaced in 05-02 when the real create/edit
// form lands.

function CityCard({ city }: { readonly city: CityDTO }) {
  const arrived = formatArrived(city.arrivedAt);
  return (
    <li className="rounded-lg bg-bg-elev border border-line p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink font-semibold truncate">{city.name}</span>
        <span className="text-ink-mute text-xs whitespace-nowrap">{arrived}</span>
      </div>
      {city.caption && (
        <p className="mt-1 text-ink-dim text-sm line-clamp-2">{city.caption}</p>
      )}
    </li>
  );
}

interface DraftPinPanelProps {
  readonly pin: DraftPin;
  readonly prefill: GeocodeResult | null;
  readonly onClose: () => void;
}

function DraftPinPanel({ pin, prefill, onClose }: DraftPinPanelProps) {
  const lookupPending = prefill === null;
  return (
    <div
      role="dialog"
      aria-label="New city"
      className="absolute inset-x-0 bottom-0 mx-auto max-w-md glass-pill rounded-t-2xl p-4 m-2 shadow-xl"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-display text-lg">New city</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-mute text-sm"
          aria-label="Close"
        >
          Close
        </button>
      </div>

      <dl className="text-sm space-y-1 mb-3">
        <div className="flex justify-between">
          <dt className="text-ink-mute">Name</dt>
          <dd className="text-ink truncate ml-3">
            {lookupPending
              ? 'Looking up location…'
              : prefill?.name || '(unknown)'}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-mute">Country</dt>
          <dd className="text-ink truncate ml-3">
            {lookupPending ? '…' : prefill?.country || '(unknown)'}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-mute">Coordinates</dt>
          <dd className="text-ink-dim font-mono text-xs ml-3">
            {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        disabled
        className="w-full rounded-lg bg-amber-500/40 text-bg font-semibold py-2 cursor-not-allowed"
      >
        Save (Saving lands in 05-02)
      </button>
    </div>
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
