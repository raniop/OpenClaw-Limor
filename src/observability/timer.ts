/**
 * Lightweight timing helper for measuring durations.
 */

export interface TimerResult<T> {
  result: T;
  durationMs: number;
}

/**
 * Time an async operation. Returns the result and duration.
 */
export async function timeAsync<T>(fn: () => Promise<T>): Promise<TimerResult<T>> {
  const start = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - start };
}

/**
 * Time a sync operation. Returns the result and duration.
 */
export function timeSync<T>(fn: () => T): TimerResult<T> {
  const start = Date.now();
  const result = fn();
  return { result, durationMs: Date.now() - start };
}

/**
 * Create a manual stopwatch.
 */
export function startTimer(): { stop: () => number } {
  const start = Date.now();
  return { stop: () => Date.now() - start };
}
