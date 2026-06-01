import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyError, BACKOFF_MS, MAX_AUTO_RETRIES, sleep } from './retry';

describe('classifyError — ERR-01 transient vs terminal classification', () => {
  it("classifies 'Network error' as transient", () => {
    expect(classifyError(new Error('Network error'))).toBe('transient');
  });

  it.each([
    ['HTTP 429', 'transient'],
    ['HTTP 500', 'transient'],
    ['HTTP 502', 'transient'],
    ['HTTP 503', 'transient'],
    ['HTTP 504', 'transient'],
  ] as const)("classifies '%s' as %s", (msg, expected) => {
    expect(classifyError(new Error(msg))).toBe(expected);
  });

  it("classifies 'HTTP 413' as terminal-too-large (single discriminated case)", () => {
    expect(classifyError(new Error('HTTP 413'))).toBe('terminal-too-large');
  });

  it.each([
    'HTTP 400',
    'HTTP 401',
    'HTTP 403',
    'HTTP 404',
    'HTTP 422',
    'Aborted',
    'weird custom message',
    'HTTP 999',
  ] as const)("classifies '%s' as terminal-other", (msg) => {
    expect(classifyError(new Error(msg))).toBe('terminal-other');
  });

  it.each([
    'plain string',
    42,
    null,
    undefined,
    {},
    [],
  ])('classifies non-Error input as terminal-other', (value) => {
    expect(classifyError(value)).toBe('terminal-other');
  });
});

describe('BACKOFF_MS — ERR-01 locked schedule', () => {
  it('equals exactly [2000, 4000, 8000]', () => {
    expect([...BACKOFF_MS]).toEqual([2000, 4000, 8000]);
  });

  it('MAX_AUTO_RETRIES equals BACKOFF_MS.length', () => {
    expect(MAX_AUTO_RETRIES).toBe(3);
    expect(MAX_AUTO_RETRIES).toBe(BACKOFF_MS.length);
  });
});

describe('sleep — timer-driven Promise resolution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the specified delay', async () => {
    const promise = sleep(2000);
    let resolved = false;
    void promise.then(() => { resolved = true; });
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(resolved).toBe(true);
  });

  it('does not resolve before the delay', async () => {
    const promise = sleep(2000);
    let resolved = false;
    void promise.then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(1999);
    expect(resolved).toBe(false);
  });
});
