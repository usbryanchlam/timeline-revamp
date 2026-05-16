// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { HandleCheckState } from '@/api/handlesCheck';

// ---------------------------------------------------------------------------
// Mocks (must be declared BEFORE the dynamic import of the component)
// ---------------------------------------------------------------------------

// Mock useApi so tests don't need Auth0 — replace with raw fetch so we can
// spy on fetch calls and drive submit behaviour.
vi.mock('@/auth/useApi', () => ({
  useApi: () => (url: string, init?: RequestInit) => fetch(url, init),
}));

// Drive the live-check state per-test. The mock receives (candidate, enabled)
// and returns whatever the test sets up beforehand.
const mockCheck = vi.fn<(candidate: string, enabled: boolean) => HandleCheckState>(
  () => ({ state: 'idle' }),
);
vi.mock('@/api/handlesCheck', () => ({
  useHandleCheck: (candidate: string, enabled: boolean) => mockCheck(candidate, enabled),
}));

// ---------------------------------------------------------------------------
// jsdom polyfill: HTMLDialogElement.showModal / .close / cancel event
// ---------------------------------------------------------------------------
// jsdom currently does not implement showModal / close. Polyfill them so
// the component's effect can call them; the polyfill also wires the
// `cancel` event so Esc-handling can be tested.

function installDialogPolyfill(): void {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal: () => void;
    close: () => void;
    open: boolean;
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
// Component import AFTER mocks are set up
// ---------------------------------------------------------------------------

const { HandlePickerModal } = await import('./HandlePickerModal');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setCheck(state: HandleCheckState): void {
  mockCheck.mockImplementation(() => state);
}

function getDialog(): HTMLDialogElement {
  return screen.getByRole('dialog') as HTMLDialogElement;
}

function getInput(): HTMLInputElement {
  return screen.getByPlaceholderText('e.g. bryan') as HTMLInputElement;
}

function getClaimButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /^Claim$|^Saving/ }) as HTMLButtonElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HandlePickerModal', () => {
  beforeEach(() => {
    installDialogPolyfill();
    vi.clearAllMocks();
    setCheck({ state: 'idle' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders dialog with open attribute after mount (showModal called)', () => {
    render(<HandlePickerModal onPicked={() => {}} />);
    const dialog = getDialog();
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('does NOT close dialog on cancel event (Esc preventDefault)', () => {
    render(<HandlePickerModal onPicked={() => {}} />);
    const dialog = getDialog();
    expect(dialog.hasAttribute('open')).toBe(true);
    // Dispatch a cancelable cancel event — the component's listener calls
    // preventDefault, so defaultPrevented must be true. Real browser would
    // skip the close; our polyfill leaves `open` untouched on cancel.
    const cancelEvent = new Event('cancel', { cancelable: true, bubbles: true });
    act(() => {
      dialog.dispatchEvent(cancelEvent);
    });
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('intercepts Escape keydown in document capture phase (double-Esc anti-modal-trap fix)', () => {
    render(<HandlePickerModal onPicked={() => {}} />);
    const dialog = getDialog();
    expect(dialog.hasAttribute('open')).toBe(true);
    // Real browser regression: Chromium's close watcher closes the dialog on
    // the SECOND Esc press even when the first cancel event was prevented.
    // The fix is a document-level keydown listener in capture phase that
    // preventDefaults the key before the close request is generated.
    const keyEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
      bubbles: true,
    });
    act(() => {
      document.dispatchEvent(keyEvent);
    });
    expect(keyEvent.defaultPrevented).toBe(true);
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('renders the URL preview line `timeline.bryanlam.dev/u/<input>`', () => {
    render(<HandlePickerModal onPicked={() => {}} />);
    // With empty input, preview shows the placeholder token "<input>".
    expect(screen.getByText(/timeline\.bryanlam\.dev\/u\//)).toBeTruthy();
    // Type a candidate — preview reflects the lowercased trimmed form.
    const input = getInput();
    act(() => {
      fireEvent.change(input, { target: { value: 'Bryan' } });
    });
    // Preview should now show 'bryan'.
    expect(screen.getByText('bryan')).toBeTruthy();
  });

  it('calls useHandleCheck with the lowercased preview when local validation passes', () => {
    render(<HandlePickerModal onPicked={() => {}} />);
    const input = getInput();
    act(() => {
      fireEvent.change(input, { target: { value: 'Bryan' } });
    });
    // Last call to mockCheck should be with the lowercased candidate AND
    // enabled=true (local validateHandle('Bryan') succeeds since it
    // lowercases internally and 'bryan' is 5 chars, valid).
    const calls = mockCheck.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[0]).toBe('bryan');
    expect(lastCall?.[1]).toBe(true);
  });

  it('disables Claim button and shows muted "taken" message when unavailable', () => {
    setCheck({ state: 'unavailable', reason: 'taken' });
    render(<HandlePickerModal onPicked={() => {}} />);
    const input = getInput();
    act(() => {
      fireEvent.change(input, { target: { value: 'bryan' } });
    });
    expect(getClaimButton().disabled).toBe(true);
    expect(screen.getByText(/That handle is taken/i)).toBeTruthy();
  });

  it('enables Claim button when live check returns available', () => {
    setCheck({ state: 'available' });
    render(<HandlePickerModal onPicked={() => {}} />);
    const input = getInput();
    act(() => {
      fireEvent.change(input, { target: { value: 'bryan' } });
    });
    expect(getClaimButton().disabled).toBe(false);
    // Amber check indicator visible (status text "Available").
    expect(screen.getByText(/Available/i)).toBeTruthy();
  });

  it('POSTs /api/me/handle on submit and calls onPicked with the returned handle', async () => {
    setCheck({ state: 'available' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ handle: 'bryan' }),
    } as unknown as Response);

    const onPicked = vi.fn();
    render(<HandlePickerModal onPicked={onPicked} />);
    act(() => {
      fireEvent.change(getInput(), { target: { value: 'bryan' } });
    });
    await act(async () => {
      fireEvent.click(getClaimButton());
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/me/handle',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ handle: 'bryan' }),
      }),
    );
    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(onPicked).toHaveBeenCalledWith('bryan');
  });

  it('keeps submit blocked at button level when live check is not available', () => {
    // Defense in depth: button disabled when state !== 'available'.
    setCheck({ state: 'unavailable', reason: 'taken' });
    render(<HandlePickerModal onPicked={() => {}} />);
    act(() => {
      fireEvent.change(getInput(), { target: { value: 'bryan' } });
    });
    expect(getClaimButton().disabled).toBe(true);
  });

  it('does not fire useHandleCheck when local validation fails (enabled=false)', () => {
    render(<HandlePickerModal onPicked={() => {}} />);
    act(() => {
      fireEvent.change(getInput(), { target: { value: 'ab' } }); // too short
    });
    // The hook IS called (component always invokes it), but `enabled`
    // should be false on the latest call so it won't fetch.
    const calls = mockCheck.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toBe(false);
  });

  it('has D-05 copy: title "Pick your handle", button "Claim", placeholder "e.g. bryan", no close/skip', () => {
    render(<HandlePickerModal onPicked={() => {}} />);
    expect(screen.getByText('Pick your handle')).toBeTruthy();
    // The Claim button: when idle and no live check, button text is "Claim".
    expect(screen.getByRole('button', { name: /^Claim$/ })).toBeTruthy();
    // Placeholder.
    expect(screen.getByPlaceholderText('e.g. bryan')).toBeTruthy();
    // NO "Claim handle" longer copy.
    expect(screen.queryByText(/Claim handle/)).toBeNull();
    // NO close button / skip link.
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull();
    expect(screen.queryByText(/skip for now/i)).toBeNull();
  });
});
