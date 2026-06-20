// @vitest-environment jsdom
//
// F8 close-out (integration): HandlePickerGate threads suggestHandle(user)
// through to HandlePickerModal's `suggestedHandle` prop so the input opens
// pre-filled when a clean suggestion exists.
//
// Two cases:
//   - Test 9: useAuth0 user has nickname='Bryan Lam' AND /api/me returns
//     handle=null → modal mounts with input value 'bryan-lam'.
//   - Test 10: useAuth0 user has no usable claims (nickname='', email='',
//     given_name='') → modal mounts with input value '' (empty fallback).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks (declared BEFORE component import)
// ---------------------------------------------------------------------------

// useAuth0 — driven per-test via mockAuth0User.
let mockAuth0User: {
  nickname?: string;
  email?: string;
  given_name?: string;
} = {};

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => ({ user: mockAuth0User }),
}));

// useApi → returns a callable that hits a per-test fetch mock.
vi.mock('@/auth/useApi', () => ({
  useApi: () => (url: string, init?: RequestInit) => fetch(url, init),
}));

// Mock useHandleCheck — the live availability check is out of scope here.
// We force it to 'idle' so the modal renders without firing network calls.
vi.mock('@/api/handlesCheck', () => ({
  useHandleCheck: () => ({ state: 'idle' as const }),
}));

// ---------------------------------------------------------------------------
// jsdom polyfill: HTMLDialogElement.showModal / close (HandlePickerModal opens
// itself via showModal()).
// ---------------------------------------------------------------------------

function installDialogPolyfill(): void {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal?: () => void;
    close?: () => void;
  };
  if (proto.showModal && proto.showModal.name === 'mockShowModal') return;
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    writable: true,
    value: function mockShowModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    writable: true,
    value: function mockClose(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
}

// ---------------------------------------------------------------------------
// Component import AFTER mocks
// ---------------------------------------------------------------------------

import { HandlePickerGate } from './HandlePickerGate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockMeFetch(handle: string | null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/me')) {
        return new Response(
          JSON.stringify({
            id: 'u1',
            email: 'test@example.com',
            handle,
            createdAt: new Date().toISOString(),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200 });
    }),
  );
}

beforeEach(() => {
  installDialogPolyfill();
  vi.unstubAllGlobals();
  mockAuth0User = {};
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HandlePickerGate — F8 suggestion threading', () => {
  it('Test 9: renders HandlePickerModal with input pre-filled from nickname (Bryan Lam → bryan-lam)', async () => {
    mockAuth0User = { nickname: 'Bryan Lam' };
    mockMeFetch(null);

    render(
      <HandlePickerGate>
        <div>app body</div>
      </HandlePickerGate>,
    );

    // Wait for /api/me → handle=null branch to mount the modal.
    const input = (await screen.findByPlaceholderText(
      'e.g. bryan',
    )) as HTMLInputElement;

    await waitFor(() => {
      expect(input.value).toBe('bryan-lam');
    });
  });

  it('Test 10: renders HandlePickerModal with empty input when no usable suggestion exists', async () => {
    // No nickname, no email, no given_name → suggestHandle returns ''.
    mockAuth0User = {};
    mockMeFetch(null);

    render(
      <HandlePickerGate>
        <div>app body</div>
      </HandlePickerGate>,
    );

    const input = (await screen.findByPlaceholderText(
      'e.g. bryan',
    )) as HTMLInputElement;

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('does NOT render HandlePickerModal when /api/me reports a non-null handle', async () => {
    mockAuth0User = { nickname: 'Bryan Lam' };
    mockMeFetch('bryan'); // user already claimed a handle

    render(
      <HandlePickerGate>
        <div>app body</div>
      </HandlePickerGate>,
    );

    // Wait for the /api/me fetch to resolve and the gate's loaded state to flip.
    // Then assert the modal is NOT in the DOM (no input present).
    await waitFor(() => {
      // The children render path; the dialog should not exist.
      expect(screen.queryByPlaceholderText('e.g. bryan')).toBeNull();
    });
  });
});
