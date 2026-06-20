// F8 close-out: tests for the Auth0-derived handle suggestion algorithm.
//
// Per D-LOCK CONTEXT note 6, the algorithm is ALREADY ON DISK (Phase 8) —
// Phase 11 only adds tests + UAT verification. The algorithm file is NOT
// modified. If any of these tests fail, the failure is recorded in the plan's
// SUMMARY.md as a finding — DO NOT change suggestHandle.ts to make them pass.
//
// Algorithm summary (from suggestHandle.ts):
//   Fallback chain (first hit wins):
//     1. nickname (Auth0 default)
//     2. email local-part (everything before '@')
//     3. given_name (social providers)
//   Sanitize chain (per candidate):
//     - lowercase
//     - '.', '_', whitespace → '-'
//     - strip [^a-z0-9-]
//     - collapse consecutive '-'
//     - trim leading/trailing '-'
//     - truncate to 20 chars (re-trim trailing '-')
//   Final filter: validateHandle() from server/handles/validate.ts
//     - 3-20 char length
//     - [a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])? regex
//     - 26-entry RESERVED_HANDLES set

import { describe, it, expect } from 'vitest';
import { suggestHandle } from './suggestHandle';

describe('suggestHandle — Auth0 nickname fallback', () => {
  it('Test 1: nickname with space lowercased + dashed → "bryan-lam"', () => {
    expect(suggestHandle({ nickname: 'Bryan Lam' })).toBe('bryan-lam');
  });

  it('Test 2: nickname matching a reserved word returns "" (filtered by validateHandle)', () => {
    // 'admin' is in the RESERVED_HANDLES set; even though it sanitizes to a
    // valid-shape handle, validateHandle rejects it. The fallback chain
    // continues to email + given_name (both absent here) → final ''.
    expect(suggestHandle({ nickname: 'Admin' })).toBe('');
  });
});

describe('suggestHandle — email local-part fallback', () => {
  it('Test 3: email local-part with dot → "bryan-lam" (no nickname)', () => {
    expect(
      suggestHandle({ email: 'bryan.lam@gmail.com' }),
    ).toBe('bryan-lam');
  });
});

describe('suggestHandle — given_name fallback', () => {
  it('Test 4: given_name → "bryan" (no nickname, no email)', () => {
    expect(suggestHandle({ given_name: 'Bryan' })).toBe('bryan');
  });
});

describe('suggestHandle — empty fallback', () => {
  it('Test 5: empty inputs → "" (no source claims)', () => {
    expect(suggestHandle({})).toBe('');
  });
});

describe('suggestHandle — sanitize chain correctness', () => {
  it('Test 6: non-ASCII chars stripped, multiple dashes collapsed, trailing dashes trimmed', () => {
    // 'Très Bién!!!' → lowercased 'très bién!!!' → space → '-' → 'très-bién!!!'
    // → strip non-[a-z0-9-]: 'trs-bin' → collapse no-op → no leading/trailing
    // dashes to trim → fits regex, > 3 chars → validateHandle ok.
    const result = suggestHandle({ nickname: 'Très Bién!!!' });
    // Assert the shape: lowercase, [a-z0-9-]+, no leading/trailing dash.
    expect(result).toMatch(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
    // The accented characters are stripped, leaving the base letters.
    expect(result).toBe('trs-bin');
  });

  it('Test 7: 50-char repeated input truncates to 20 chars', () => {
    const input = 'a'.repeat(50);
    const result = suggestHandle({ nickname: input });
    expect(result).toBe('a'.repeat(20));
    expect(result.length).toBe(20);
  });
});

describe('suggestHandle — length floor enforced via validateHandle', () => {
  it('Test 8: 2-char nickname fails validateHandle (too_short) → ""', () => {
    // 'ab' sanitizes to 'ab' but validateHandle rejects with too_short.
    // Fallback chain has no email / given_name, so the final result is ''.
    expect(suggestHandle({ nickname: 'ab' })).toBe('');
  });

  it('falls through to the next candidate when nickname is too short and email is present', () => {
    // 'ab' fails validation → fall through to email local-part 'bryan' → ok.
    expect(
      suggestHandle({ nickname: 'ab', email: 'bryan@gmail.com' }),
    ).toBe('bryan');
  });

  it('falls through to given_name when nickname AND email both fail', () => {
    // 'ab' and 'a' (from 'a@x.com' local-part) both fail; given_name 'Bryan'
    // succeeds.
    expect(
      suggestHandle({
        nickname: 'ab',
        email: 'a@x.com',
        given_name: 'Bryan',
      }),
    ).toBe('bryan');
  });
});

describe('suggestHandle — fallback order', () => {
  it('prefers nickname when all three are present and nickname is valid', () => {
    expect(
      suggestHandle({
        nickname: 'Bryan',
        email: 'someone-else@gmail.com',
        given_name: 'NotMe',
      }),
    ).toBe('bryan');
  });

  it('prefers email local-part when nickname is empty', () => {
    expect(
      suggestHandle({
        nickname: '',
        email: 'bryan@gmail.com',
        given_name: 'NotMe',
      }),
    ).toBe('bryan');
  });
});
