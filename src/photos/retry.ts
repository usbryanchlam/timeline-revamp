/**
 * ERR-01 photo-upload retry helpers.
 *
 * Backoff is CONTEXT-locked to [2000, 4000, 8000] ms — 3 auto-retries before
 * the tile flips to manual-retry mode. Total observation window ~14s before
 * the operator sees the manual retry button.
 *
 * classifyError mirrors the reject contract emitted by xhrUpload in
 * uploadQueue.ts (lines 64-68):
 *   - 'Network error'   -> transient (xhr.onerror)
 *   - 'HTTP 429'        -> transient (rate limited)
 *   - 'HTTP 5xx'        -> transient (server-side flake)
 *   - 'HTTP 413'        -> terminal-too-large (file size lock)
 *   - 'HTTP 4xx other'  -> terminal-other (auth / validation / bad request)
 *   - 'Aborted'         -> terminal-other (cancelAll path)
 *   - non-Error / unknown -> terminal-other (safer default)
 *
 * Regex is fully anchored — no catastrophic backtracking (RESEARCH Security V5).
 */

export const BACKOFF_MS = [2000, 4000, 8000] as const;
export const MAX_AUTO_RETRIES = BACKOFF_MS.length;

export type RetryClass = 'transient' | 'terminal-too-large' | 'terminal-other';

export function classifyError(err: unknown): RetryClass {
  if (!(err instanceof Error)) return 'terminal-other';
  const msg = err.message;
  if (msg === 'Network error') return 'transient';
  const m = msg.match(/^HTTP (\d{3})$/);
  if (!m) return 'terminal-other';
  const status = Number(m[1]);
  if (status === 413) return 'terminal-too-large';
  if (status === 429) return 'transient';
  if (status >= 500 && status < 600) return 'transient';
  return 'terminal-other';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
