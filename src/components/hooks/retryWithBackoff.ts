// Small retry policy used by useGalaxyScene + usePhaserGame to suppress
// transient init failures (WebGL context blip, dynamic-import flake).
// Extracted as a pure helper so the timing + cancellation contract is
// testable from a `node` test env without a React renderer.

export interface RetryOptions {
  readonly maxAttempts: number;
  readonly delayMs: number;
  // Re-checked before each attempt, after each failure, and before the
  // backoff sleep. Returning true short-circuits with `kind: "cancelled"`.
  readonly isCancelled: () => boolean;
  // Side-effect hook for logging — called once per failed attempt with
  // the caught error and the 1-indexed attempt number.
  readonly onAttemptFailed?: (err: unknown, attempt: number) => void;
}

export type RetryResult<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "failed"; readonly lastError: unknown }
  | { readonly kind: "cancelled" };

export async function retryWithBackoff<T>(
  attempt: () => Promise<T>,
  options: RetryOptions
): Promise<RetryResult<T>> {
  let lastError: unknown;
  for (let i = 1; i <= options.maxAttempts; i++) {
    if (options.isCancelled()) return { kind: "cancelled" };
    try {
      // Intentionally NO post-success isCancelled() check: that would
      // drop the constructed value on the floor, leaking whatever
      // resources `attempt` allocated. The caller checks isCancelled()
      // after `kind: "ok"` and disposes the value itself.
      const value = await attempt();
      return { kind: "ok", value };
    } catch (err) {
      lastError = err;
      options.onAttemptFailed?.(err, i);
      if (options.isCancelled()) return { kind: "cancelled" };
      if (i < options.maxAttempts) {
        await new Promise((res) => setTimeout(res, options.delayMs));
        if (options.isCancelled()) return { kind: "cancelled" };
      }
    }
  }
  return { kind: "failed", lastError };
}
