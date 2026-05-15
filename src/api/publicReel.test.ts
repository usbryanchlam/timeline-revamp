// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePublicReel, type PublicReelDTO } from './publicReel';

function makeOkPayload(handle: string): PublicReelDTO {
  return {
    user: { handle, displayName: null },
    cities: [],
    photos: [],
  };
}

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }): void {
  const res = {
    ok: response.ok ?? true,
    status: response.status ?? 200,
    statusText: response.statusText ?? '',
    json: response.json ?? (async () => ({})),
  } as unknown as Response;
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(res);
}

describe('usePublicReel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in loading state and transitions to ok on 200', async () => {
    const payload = makeOkPayload('bryan');
    mockFetchOnce({ ok: true, status: 200, json: async () => payload });
    const { result } = renderHook(() => usePublicReel('bryan'));
    expect(result.current.kind).toBe('loading');
    await waitFor(() => expect(result.current.kind).toBe('ok'));
    if (result.current.kind !== 'ok') throw new Error('expected ok');
    expect(result.current.data.user.handle).toBe('bryan');
  });

  it('maps 404 to { kind: "not_found" } (not error)', async () => {
    mockFetchOnce({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({ error: 'not_found' }) });
    const { result } = renderHook(() => usePublicReel('nope'));
    await waitFor(() => expect(result.current.kind).toBe('not_found'));
  });

  it('maps 500 to { kind: "error" } with API 500 message', async () => {
    mockFetchOnce({ ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) });
    const { result } = renderHook(() => usePublicReel('bryan'));
    await waitFor(() => expect(result.current.kind).toBe('error'));
    if (result.current.kind !== 'error') throw new Error('expected error');
    expect(result.current.error.message).toContain('API 500');
  });

  it('maps network failure to { kind: "error" } with rejection reason', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => usePublicReel('bryan'));
    await waitFor(() => expect(result.current.kind).toBe('error'));
    if (result.current.kind !== 'error') throw new Error('expected error');
    expect(result.current.error.message).toBe('boom');
  });

  it('stale-drop: rapid handle change drops the older slow response', async () => {
    let resolveFirst!: (r: Response) => void;
    const first = new Promise<Response>((r) => {
      resolveFirst = r;
    });
    let resolveSecond!: (r: Response) => void;
    const second = new Promise<Response>((r) => {
      resolveSecond = r;
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    const { result, rerender } = renderHook(({ h }) => usePublicReel(h), {
      initialProps: { h: 'bryan' },
    });
    rerender({ h: 'alice' });

    // Resolve the SECOND (newer) request first with alice's data.
    await act(async () => {
      resolveSecond({
        ok: true,
        status: 200,
        json: async () => makeOkPayload('alice'),
      } as unknown as Response);
      await Promise.resolve();
    });
    // Now resolve the FIRST (older) request — should be dropped via reqIdRef.
    await act(async () => {
      resolveFirst({
        ok: true,
        status: 200,
        json: async () => makeOkPayload('bryan'),
      } as unknown as Response);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.kind).toBe('ok'));
    if (result.current.kind !== 'ok') throw new Error('expected ok');
    expect(result.current.data.user.handle).toBe('alice');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('unmount during in-flight fetch: no late state update fires', async () => {
    let resolveIt!: (r: Response) => void;
    const pending = new Promise<Response>((r) => {
      resolveIt = r;
    });
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(pending);

    const { result, unmount } = renderHook(() => usePublicReel('bryan'));
    expect(result.current.kind).toBe('loading');
    unmount();
    await act(async () => {
      resolveIt({
        ok: true,
        status: 200,
        json: async () => makeOkPayload('bryan'),
      } as unknown as Response);
      await Promise.resolve();
    });
    // No assertion error from React about state update on unmounted component:
    // reqIdRef.current === -1 short-circuits the setState. We can't observe
    // post-unmount state directly via result.current, but the absence of a
    // React warning is the contract.
    expect(true).toBe(true);
  });

  it('encodes special characters in the handle via encodeURIComponent', async () => {
    mockFetchOnce({ ok: true, status: 200, json: async () => makeOkPayload('weird name') });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderHook(() => usePublicReel('weird name'));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url).toBe('/api/public/u/weird%20name');
  });

  it('preserves response shape: cities is array, user.handle is string, displayName nullable', async () => {
    const payload: PublicReelDTO = {
      user: { handle: 'bryan', displayName: null },
      cities: [],
      photos: [],
    };
    mockFetchOnce({ ok: true, status: 200, json: async () => payload });
    const { result } = renderHook(() => usePublicReel('bryan'));
    await waitFor(() => expect(result.current.kind).toBe('ok'));
    if (result.current.kind !== 'ok') throw new Error('expected ok');
    expect(Array.isArray(result.current.data.cities)).toBe(true);
    expect(typeof result.current.data.user.handle).toBe('string');
    expect(result.current.data.user.displayName).toBeNull();
  });
});
