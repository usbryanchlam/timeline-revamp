/**
 * Extract the Postgres SQLSTATE error code from an error thrown by Drizzle or
 * raw pg. Drizzle wraps pg errors in `DrizzleQueryError`, putting the original
 * code on `err.cause.code`. Raw pg throws errors with `err.code` directly.
 * This helper handles both shapes.
 */
export function pgErrorCode(err: unknown): string | undefined {
  if (err == null || typeof err !== 'object') return undefined;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (typeof e.code === 'string') return e.code;
  if (e.cause && typeof e.cause === 'object' && typeof e.cause.code === 'string') {
    return e.cause.code;
  }
  return undefined;
}
