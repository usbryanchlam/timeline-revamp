import { useState, type FormEvent } from 'react';
import { validateHandle } from '@server/handles/validate.js';
import { useApi } from '@/auth/useApi';

// AUTH-07 modal. Presentational only — wrapped by HandlePickerGate
// which decides when to render. Client-side validation uses the SAME
// validate.ts as the API route (single source of truth across the
// trust boundary), so the user sees the same error messages whether
// the check happens locally or on the server.
//
// Submit flow:
//   1. Re-validate with shared validateHandle (cheap; avoids POSTing
//      something the server is going to reject anyway)
//   2. POST /api/me/handle with the lowercased candidate
//   3. 200 → onPicked(handle), modal closes
//      409 → "taken" message
//      422 → server disagrees with our local check (shouldn't happen,
//             but treat as generic error so the user can try again)

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

export function HandlePickerModal({ onPicked }: { onPicked: (handle: string) => void }) {
  const api = useApi();
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const preview = input.trim().toLowerCase();
  const localValidation = preview.length === 0 ? null : validateHandle(input);

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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="bg-bg-elev rounded-2xl p-6 w-full max-w-sm space-y-4 border border-line"
      >
        <h2 className="text-display text-xl">Pick your handle</h2>
        <p className="text-ink-mute text-sm">
          This is your public reel URL. Lowercase letters, numbers, and hyphens. 3-20 characters.
        </p>
        <input
          autoFocus
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setStatus('idle');
          }}
          placeholder="bryan"
          className="w-full px-3 py-2 rounded-lg bg-bg border border-line text-ink"
          maxLength={20}
          autoComplete="off"
        />
        {preview && preview !== input && (
          <p className="text-xs text-ink-mute">
            Will be saved as <code>{preview}</code>
          </p>
        )}
        {localValidation && !localValidation.ok && (
          <p className="text-xs text-amber-500">{errorFor(localValidation.reason)}</p>
        )}
        {typeof status === 'object' && 'error' in status && (
          <p className="text-xs text-amber-500">{status.error}</p>
        )}
        <button
          type="submit"
          disabled={status === 'submitting' || !localValidation?.ok}
          className="w-full bg-amber-500 text-black font-semibold py-2 rounded-lg disabled:opacity-50"
        >
          {status === 'submitting' ? 'Saving…' : 'Claim handle'}
        </button>
      </form>
    </div>
  );
}
