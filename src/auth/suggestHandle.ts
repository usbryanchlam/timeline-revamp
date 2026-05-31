import { validateHandle } from '@server/handles/validate.js';

// Derives a candidate handle from Auth0 user identity for the HandlePicker
// initial state. The first paint of the modal then shows a pre-filled,
// already-available handle in most cases — the Claim button is enabled
// immediately instead of starting in disabled-dim state.
//
// Algorithm (first hit wins):
//   1. nickname (Auth0 default; usually short and identifier-like)
//   2. email local part (everything before '@')
//   3. given_name (social providers like Google)
//
// Each candidate goes through sanitize() which:
//   - lowercases
//   - replaces '.', '_', ' ' with '-'
//   - strips any character not in [a-z0-9-]
//   - trims leading/trailing hyphens
//   - collapses consecutive hyphens
//   - truncates to 20 chars (with trailing-hyphen re-trim if needed)
//
// The sanitized candidate is then validated against the server's
// validateHandle() (single source of truth — same rules as the API).
// Returns the validated handle string or '' if no candidate passed.
//
// If the suggestion is later found to be already taken, the live
// availability check (useHandleCheck) flips check.state to 'unavailable'
// and the user types a different one. We don't auto-increment on
// conflict — keeps the UX honest about the first choice failing.
export interface HandleSuggestionInputs {
  readonly nickname?: string;
  readonly email?: string;
  readonly given_name?: string;
}

export function suggestHandle(inputs: HandleSuggestionInputs): string {
  const candidates: readonly string[] = [
    inputs.nickname ?? '',
    inputs.email?.split('@')[0] ?? '',
    inputs.given_name ?? '',
  ];

  for (const raw of candidates) {
    const sanitized = sanitize(raw);
    if (!sanitized) continue;
    const v = validateHandle(sanitized);
    if (v.ok) return v.handle;
  }
  return '';
}

function sanitize(raw: string): string {
  const lowercased = raw.toLowerCase();
  const dashed = lowercased.replace(/[._\s]+/g, '-');
  const stripped = dashed.replace(/[^a-z0-9-]/g, '');
  const collapsed = stripped.replace(/-+/g, '-');
  const trimmed = collapsed.replace(/^-+|-+$/g, '');
  if (trimmed.length === 0) return '';
  const truncated = trimmed.slice(0, 20);
  return truncated.replace(/-+$/, '');
}
