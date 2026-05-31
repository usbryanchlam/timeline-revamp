import { useEffect, useRef, useState, type FormEvent } from 'react';
import { validateHandle } from '@server/handles/validate.js';
import { useApi } from '@/auth/useApi';
import { useHandleCheck } from '@/api/handlesCheck';

// AUTH-05/06/07 — Phase 7 upgrade of the Phase 4 handle picker.
//
// Modal is a native <dialog> opened via showModal() so the browser handles
// focus trap + backdrop natively. The `cancel` event (Esc) is intercepted
// and preventDefault'd per D-01 — the modal is blocking and cannot be
// dismissed until a handle is claimed.
//
// Live availability check (D-02): useHandleCheck debounces the input by
// 300ms and only fires when local validateHandle already passes. Cache-
// Control: no-store on the endpoint side keeps the answer fresh between
// racing pickers. The authoritative claim path is still POST /api/me/handle,
// which re-validates and collapses 23505 → 409.

type Status = 'idle' | 'submitting' | { error: string };
type ValidationReason = 'too_short' | 'too_long' | 'invalid_chars' | 'reserved';

function errorFor(reason: ValidationReason): string {
  switch (reason) {
    case 'too_short':
      return 'Too short (minimum 3 characters).';
    case 'too_long':
      return 'Too long (maximum 20 characters).';
    case 'invalid_chars':
      return 'Use lowercase letters, numbers, and hyphens only. Cannot start or end with a hyphen.';
    case 'reserved':
      return 'That word is reserved. Try another.';
  }
}

interface HandlePickerModalProps {
  readonly onPicked: (handle: string) => void;
  // Optional pre-filled handle suggestion derived from Auth0 user identity
  // (see HandlePickerGate → suggestHandle). When provided AND valid, the
  // modal opens with the input populated and the live availability check
  // fires automatically — the Claim button is enabled on first paint if
  // the suggestion isn't already taken. Falls back to empty string when
  // no usable suggestion can be derived (returns to the prior behavior).
  readonly suggestedHandle?: string;
}

export function HandlePickerModal({ onPicked, suggestedHandle = '' }: HandlePickerModalProps) {
  const api = useApi();
  const [input, setInput] = useState(suggestedHandle);
  const [status, setStatus] = useState<Status>('idle');
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const preview = input.trim().toLowerCase();
  const localValidation = preview.length === 0 ? null : validateHandle(input);
  const check = useHandleCheck(preview, localValidation?.ok === true);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (!d.open) d.showModal();
    // D-01 blocking — Esc cannot dismiss. Two listeners are needed:
    //   1. `cancel` preventDefault catches the first Esc (standard path).
    //   2. `keydown` in the document-level capture phase catches every Esc
    //      BEFORE the browser's close-watcher logic runs. Chromium's close
    //      watcher implements an anti-modal-trap rule: when a `cancel` event
    //      is preventDefault'd, the NEXT close request closes the dialog
    //      anyway. Capturing the keydown stops the close request from ever
    //      being generated.
    const onCancel = (e: Event) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && d.open) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    d.addEventListener('cancel', onCancel);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      d.removeEventListener('cancel', onCancel);
      document.removeEventListener('keydown', onKeyDown, true);
      if (d.open) d.close();
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = validateHandle(input);
    if (!v.ok) {
      setStatus({ error: errorFor(v.reason) });
      return;
    }
    setStatus('submitting');
    try {
      const res = await api('/api/me/handle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handle: v.handle }),
      });
      if (res.status === 409) {
        setStatus({ error: 'That handle is taken. Try another.' });
        return;
      }
      if (!res.ok) {
        setStatus({ error: 'Something went wrong. Try again.' });
        return;
      }
      const json = (await res.json()) as { handle: string };
      onPicked(json.handle);
    } catch {
      setStatus({ error: 'Network error. Try again.' });
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="handle-picker-title"
      className="bg-bg-elev rounded-2xl p-6 w-full max-w-sm space-y-4 border border-line backdrop:bg-black/60 m-auto"
    >
      <form onSubmit={submit} className="space-y-4">
        <h2 id="handle-picker-title" className="text-display text-xl">Pick your handle</h2>
        <p className="text-ink-mute text-sm">
          lowercase letters, numbers, hyphens · 3–20 chars
        </p>
        <input
          autoFocus
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setStatus('idle');
          }}
          placeholder="e.g. bryan"
          className="w-full px-3 py-2 rounded-lg bg-bg border border-line text-ink"
          maxLength={20}
          autoComplete="off"
          aria-describedby="handle-picker-url-preview"
        />
        <p id="handle-picker-url-preview" className="text-xs text-ink-mute">
          timeline.bryanlam.dev/u/<code>{preview || '<input>'}</code>
        </p>
        {/* Live-check icon row — single amber accent for the check ONLY. */}
        {localValidation?.ok && check.state === 'checking' && (
          <p className="text-xs text-ink-mute" role="status" aria-live="polite">Checking…</p>
        )}
        {localValidation?.ok && check.state === 'available' && (
          <p className="text-xs text-amber-500" role="status" aria-live="polite">✓ Available</p>
        )}
        {localValidation?.ok && check.state === 'unavailable' && (
          <p className="text-xs text-ink-mute" role="status" aria-live="polite">
            {check.reason === 'taken'
              ? 'That handle is taken. Try another.'
              : errorFor(check.reason as ValidationReason)}
          </p>
        )}
        {localValidation && !localValidation.ok && (
          <p className="text-xs text-ink-mute">{errorFor(localValidation.reason)}</p>
        )}
        {typeof status === 'object' && 'error' in status && (
          <p className="text-xs text-amber-500">{status.error}</p>
        )}
        <button
          type="submit"
          disabled={status === 'submitting' || check.state !== 'available'}
          className="w-full bg-amber-500 text-black font-semibold py-2 rounded-lg disabled:opacity-50"
        >
          {status === 'submitting' ? 'Saving…' : 'Claim'}
        </button>
      </form>
    </dialog>
  );
}
