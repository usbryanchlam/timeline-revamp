import { RESERVED_HANDLES } from '@server/handles/reservedWords.js';

// AUTH-05: handles match [a-z0-9-]{3,20}, lowercase-enforced.
// The pattern is anchored — empty string and overlong inputs fail.
// Hyphens are allowed but not at start/end (URL hygiene; nicer slugs).
//
// Anchors: ^[a-z0-9] then either nothing more (single char would be
// blocked by the length check) or {1,18} of [a-z0-9-] then [a-z0-9].
// That makes the maximum length 20 chars total and forbids leading or
// trailing hyphens.
const HANDLE_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])?$/;

export type HandleValidation =
  | { ok: true; handle: string }
  | { ok: false; reason: 'too_short' | 'too_long' | 'invalid_chars' | 'reserved' };

// Validates a candidate handle. Lowercases the input (AUTH-05's
// "lowercase-enforced") before checks so the user typing "Bryan" gets
// "bryan" — the picker UI surfaces the lowercased form to make the
// transformation visible.
//
// Returns a discriminated union (not throws) so the picker UI can
// render a specific error message per failure type without
// string-matching exception messages.
export function validateHandle(rawInput: string): HandleValidation {
  const input = rawInput.trim().toLowerCase();
  if (input.length < 3) return { ok: false, reason: 'too_short' };
  if (input.length > 20) return { ok: false, reason: 'too_long' };
  if (!HANDLE_REGEX.test(input)) return { ok: false, reason: 'invalid_chars' };
  if (RESERVED_HANDLES.has(input)) return { ok: false, reason: 'reserved' };
  return { ok: true, handle: input };
}
