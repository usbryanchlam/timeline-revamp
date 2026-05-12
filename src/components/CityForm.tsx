// CityForm — create or edit a city.
//
// Replaces the 05-01 DraftPinPanel placeholder. Two modes via a discriminated
// prop:
//
//   - mode: 'create' — prefilled name/country from reverse-geocode, lat/lng
//     from the map pick. Submits POST /api/cities.
//   - mode: 'edit'   — populated from an existing CityDTO. Submits PATCH
//     /api/cities/:id and offers a Delete action (window.confirm gate, then
//     DELETE /api/cities/:id).
//
// Form surface is deliberately small (3 user-visible fields): name, arrivedAt,
// caption. Camera defaults (zoom/pitch/bearing) and tripLabel are NOT sent
// from the client — the Zod schema fills them server-side. lat/lng come from
// the map pick (create) and are immutable in edit mode (reorder/move lives in
// 05-03), so we display them as read-only footer text rather than as inputs.
//
// Errors map to DESIGN.md microcopy: short, sentence-case, no exclamation
// marks. 422 surfaces the first Zod issue verbatim; 409 surfaces the
// retry-this-action copy; everything else collapses to "Network error.".
//
// Layout: mobile-first slide-up sheet, escalates to a centered modal at md+
// via Tailwind responsive utilities. Backdrop click cancels; click on the
// sheet itself does not propagate.

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useApi } from '@/auth/useApi';
import type { CityDTO } from '@/types/city';

type CityFormProps =
  | {
      readonly mode: 'create';
      readonly prefill: {
        readonly lat: number;
        readonly lng: number;
        readonly name: string;
        readonly country: string;
      };
      readonly onCancel: () => void;
      readonly onSaved: (city: CityDTO) => void;
    }
  | {
      readonly mode: 'edit';
      readonly city: CityDTO;
      readonly onCancel: () => void;
      readonly onSaved: (city: CityDTO) => void;
      readonly onDeleted: (id: string) => void;
    };

const CAPTION_MAX = 500;
const NETWORK_ERROR = 'Network error. Try again.';
const CONFLICT_ERROR = 'Save conflicted with another change. Click Save again.';
const ALREADY_GONE = 'Already gone — refreshing.';

interface ApiIssue {
  readonly message: string;
}
interface ApiErrorBody {
  readonly error?: string;
  readonly issues?: readonly ApiIssue[];
}

function todayIso(): string {
  // YYYY-MM-DD in the user's local timezone — what <input type="date"> expects.
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isoToDateInput(iso: string): string {
  // Slice the YYYY-MM-DD prefix; falls back to today if the timestamp is bad.
  if (!iso) return todayIso();
  const idx = iso.indexOf('T');
  return idx > 0 ? iso.slice(0, idx) : iso.slice(0, 10);
}

async function readErrorBody(res: Response): Promise<ApiErrorBody | null> {
  try {
    return (await res.json()) as ApiErrorBody;
  } catch {
    return null;
  }
}

export function CityForm(props: CityFormProps) {
  const api = useApi();

  const initialName = props.mode === 'create' ? props.prefill.name : props.city.name;
  const initialArrived =
    props.mode === 'create' ? todayIso() : isoToDateInput(props.city.arrivedAt);
  const initialCaption =
    props.mode === 'create' ? '' : props.city.caption ?? '';

  const [name, setName] = useState(initialName);
  const [arrivedAt, setArrivedAt] = useState(initialArrived);
  const [caption, setCaption] = useState(initialCaption);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Mount guard: prevents state writes / save callbacks from firing after the
  // user cancels mid-submit and the parent tears this form down. Without this,
  // a "cancelled" save would still land in the list — surprising UX.
  const mountedRef = useRef(true);
  useEffect(() => {
    // Set true on every (re-)mount. React 18 StrictMode double-invokes the
    // mount/cleanup cycle in dev — without resetting here, the first cleanup
    // leaves mountedRef.current=false, and the live second mount never reaches
    // its post-await branches (Save button gets stuck on "Saving").
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initial focus on the name input for keyboard users opening the sheet.
  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // Escape-to-close. Ignored while a network request is in flight so the user
  // doesn't accidentally abandon a save they meant to complete.
  const onCancel = props.onCancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting && !deleting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting, deleting, onCancel]);

  const lat = props.mode === 'create' ? props.prefill.lat : props.city.lat;
  const lng = props.mode === 'create' ? props.prefill.lng : props.city.lng;

  const trimmedName = name.trim();
  const canSubmit =
    !submitting &&
    !deleting &&
    trimmedName.length > 0 &&
    arrivedAt.length > 0 &&
    caption.length <= CAPTION_MAX;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);

    // Anchor the date-input value (YYYY-MM-DD, no tz) to the user's LOCAL
    // midnight before sending. Submitting the bare string lets the server's
    // z.coerce.date() parse it as UTC midnight, which renders back a day off
    // for users east/west of UTC. Local-midnight + .toISOString() preserves
    // "the day the user picked" in their own locale on render.
    const arrivedAtIso = new Date(`${arrivedAt}T00:00:00`).toISOString();

    // Caption is omitted (not sent as empty string) so the server stores null.
    const captionToSend = caption.trim().length > 0 ? caption : undefined;

    try {
      const res =
        props.mode === 'create'
          ? await api('/api/cities', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: trimmedName,
                lat,
                lng,
                arrivedAt: arrivedAtIso,
                caption: captionToSend,
              }),
            })
          : await api(`/api/cities/${props.city.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: trimmedName,
                arrivedAt: arrivedAtIso,
                caption: captionToSend,
              }),
            });

      // Mount-guard after the network round-trip — if the user cancelled
      // mid-submit, drop the result on the floor instead of mutating state
      // or notifying the parent that a "cancelled" save succeeded.
      if (!mountedRef.current) return;

      if (res.status === 422) {
        const body = await readErrorBody(res);
        if (!mountedRef.current) return;
        setError(body?.issues?.[0]?.message ?? NETWORK_ERROR);
        return;
      }
      if (res.status === 409) {
        setError(CONFLICT_ERROR);
        return;
      }
      if (!res.ok) {
        setError(NETWORK_ERROR);
        return;
      }

      const saved = (await res.json()) as CityDTO;
      if (!mountedRef.current) return;
      props.onSaved(saved);
    } catch {
      if (!mountedRef.current) return;
      setError(NETWORK_ERROR);
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (props.mode !== 'edit') return;
    if (submitting || deleting) return;
    if (!window.confirm("Delete this city? This can't be undone.")) {
      return;
    }
    setError(null);
    setDeleting(true);
    try {
      const res = await api(`/api/cities/${props.city.id}`, { method: 'DELETE' });
      if (!mountedRef.current) return;
      if (res.status === 204) {
        props.onDeleted(props.city.id);
        return;
      }
      if (res.status === 404) {
        // Already gone from someone else's perspective — surface the copy and
        // still propagate so the parent refreshes its list.
        setError(ALREADY_GONE);
        props.onDeleted(props.city.id);
        return;
      }
      setError(NETWORK_ERROR);
    } catch {
      if (!mountedRef.current) return;
      setError(NETWORK_ERROR);
    } finally {
      if (mountedRef.current) setDeleting(false);
    }
  }

  function handleBackdropClick() {
    if (submitting || deleting) return;
    props.onCancel();
  }

  function stopPropagation(e: MouseEvent) {
    e.stopPropagation();
  }

  const title = props.mode === 'create' ? 'New city' : 'Edit city';
  const submitLabel = submitting
    ? 'Saving…'
    : props.mode === 'create'
      ? 'Save'
      : 'Save changes';

  const country =
    props.mode === 'create' && props.prefill.country
      ? props.prefill.country
      : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <form
        onSubmit={handleSubmit}
        onClick={stopPropagation}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="
          fixed inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto
          rounded-t-3xl bg-bg-elev border border-line p-6 space-y-4
          md:inset-0 md:max-w-md md:mx-auto md:my-auto md:rounded-3xl md:max-h-[80vh]
        "
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-display text-xl">{title}</h2>
          <button
            type="button"
            onClick={() => props.onCancel()}
            className="text-ink-mute text-sm"
            disabled={submitting || deleting}
          >
            Cancel
          </button>
        </div>

        <div className="space-y-1">
          <label htmlFor="city-name" className="text-xs text-ink-mute uppercase tracking-wider">
            Name
          </label>
          <input
            id="city-name"
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            autoComplete="off"
            className="w-full px-3 py-2 rounded-lg bg-bg border border-line text-ink"
          />
          {country && (
            <p className="text-xs text-ink-mute">in {country}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="city-arrived" className="text-xs text-ink-mute uppercase tracking-wider">
            Arrived
          </label>
          <input
            id="city-arrived"
            type="date"
            value={arrivedAt}
            onChange={(e) => setArrivedAt(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg bg-bg border border-line text-ink"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="city-caption" className="text-xs text-ink-mute uppercase tracking-wider">
            Caption
          </label>
          <textarea
            id="city-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            maxLength={CAPTION_MAX}
            className="w-full px-3 py-2 rounded-lg bg-bg border border-line text-ink resize-none"
          />
          <p className="text-xs text-ink-mute text-right">
            {caption.length}/{CAPTION_MAX}
          </p>
        </div>

        <p className="text-xs text-ink-mute font-mono">
          📍 {lat.toFixed(4)}, {lng.toFixed(4)}
        </p>

        {error && (
          <p role="alert" className="text-sm text-amber-500">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 bg-amber-500 text-black font-semibold py-2 rounded-lg disabled:opacity-50"
          >
            {submitLabel}
          </button>
          {props.mode === 'edit' && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting || deleting}
              className="px-3 py-2 rounded-lg border border-line text-red-400 hover:bg-red-400/10 disabled:opacity-50 text-sm"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
