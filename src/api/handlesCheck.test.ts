// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHandleCheck } from './handlesCheck';

// Helper: build a Response-like stub that .json() resolves to the given body.
// Avoids needing the real Response constructor in jsdom edge cases.
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

describe('useHandleCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns { state: "idle" } for empty candidate and does not fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useHandleCheck('', true));
    expect(result.current).toEqual({ state: 'idle' });
    // Even after advancing timers past the debounce window, no fetch.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns { state: "idle" } when enabled=false and does not fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useHandleCheck('bryan', false));
    expect(result.current).toEqual({ state: 'idle' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns "checking" immediately, fetches only AFTER 300ms debounce', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ available: true }));
    const { result } = renderHook(() => useHandleCheck('bryan', true));
    expect(result.current).toEqual({ state: 'checking' });
    // Before 300ms, no fetch.
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    // After 300ms, exactly one fetch fires.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/handles/check?candidate=bryan',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('debounces rapid typing: 3 keystrokes within 300ms = 1 fetch', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ available: true }));
    const { rerender } = renderHook(
      ({ c }: { c: string }) => useHandleCheck(c, true),
      { initialProps: { c: 'b' } },
    );
    // First keystroke 'b' at t=0; advance 100ms then type 'br'.
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ c: 'br' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ c: 'bry' });
    // Total elapsed: 200ms — still under 300ms; no fetch yet.
    expect(fetchSpy).not.toHaveBeenCalled();
    // Advance another 300ms so the latest input's timer fires.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/handles/check?candidate=bry',
      expect.anything(),
    );
  });

  it('reqIdRef drops stale slow response when a fresh response wins', async () => {
    // Deferred-promise pattern: control the order of resolution.
    let resolveFirst!: (r: Response) => void;
    const firstFetch = new Promise<Response>((r) => {
      resolveFirst = r;
    });
    let resolveSecond!: (r: Response) => void;
    const secondFetch = new Promise<Response>((r) => {
      resolveSecond = r;
    });
    vi.spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(firstFetch)
      .mockReturnValueOnce(secondFetch);

    const { result, rerender } = renderHook(
      ({ c }: { c: string }) => useHandleCheck(c, true),
      { initialProps: { c: 'bry' } },
    );
    // Fire the first request (slow).
    act(() => {
      vi.advanceTimersByTime(300);
    });
    // Type more — debounce again, fire the second request (fast).
    rerender({ c: 'bryan' });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Resolve SECOND (fast) first. It maps to 'available'.
    await act(async () => {
      resolveSecond(jsonResponse({ available: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current).toEqual({ state: 'available' });

    // Now resolve FIRST (stale slow). It is { available: false, taken } —
    // would clobber state if reqIdRef didn't drop it.
    await act(async () => {
      resolveFirst(jsonResponse({ available: false, reason: 'taken' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    // State must still reflect the fast (second) response.
    expect(result.current).toEqual({ state: 'available' });
  });

  it('calls AbortController.abort() on cleanup', () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ available: true }));
    const { unmount } = renderHook(() => useHandleCheck('bryan', true));
    // Cleanup on unmount: must abort.
    unmount();
    expect(abortSpy).toHaveBeenCalled();
  });

  it.each([
    ['too_short'],
    ['too_long'],
    ['invalid_chars'],
    ['reserved'],
    ['taken'],
  ] as const)('maps server reason "%s" to { state: "unavailable", reason }', async (reason) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ available: false, reason }),
    );
    const { result } = renderHook(() => useHandleCheck('bryan', true));
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current).toEqual({ state: 'unavailable', reason });
  });

  it('maps { available: true } to { state: "available" }', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ available: true }));
    const { result } = renderHook(() => useHandleCheck('bryan', true));
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current).toEqual({ state: 'available' });
  });

  it('maps non-ok response (e.g. 500) to { state: "error" }', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'oops' }, { ok: false, status: 500 }),
    );
    const { result } = renderHook(() => useHandleCheck('bryan', true));
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current).toEqual({ state: 'error' });
  });

  it('swallows AbortError silently (does not set error state)', async () => {
    // fetch rejects with an AbortError as a real abort would.
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);
    const { result } = renderHook(() => useHandleCheck('bryan', true));
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    // State should NOT flip to 'error' on an abort — the new keystroke
    // (in real usage) already set its own 'checking' state.
    expect(result.current).not.toEqual({ state: 'error' });
    // It also should not be 'unavailable' or 'available'.
    expect(result.current).toEqual({ state: 'checking' });
  });
});
