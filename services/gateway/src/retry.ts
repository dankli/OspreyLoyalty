/**
 * One retry with a short jittered pause, for IDEMPOTENT reads only — a mutation must
 * never ride this (its dedup lives in members' idempotency keys, not here). A thrown
 * error is a network fault, timeout or 5xx (the clients throw on those and return
 * values for expected outcomes like 404→null), so a single retry papers over exactly
 * the blips worth papering over; anything persistent still surfaces.
 */
export function withRetry<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 100));
      return fn(...args);
    }
  };
}
