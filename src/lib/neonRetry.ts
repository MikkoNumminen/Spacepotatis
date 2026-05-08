// Retry wrapper for Neon serverless calls. The /leaderboard page fans out
// N+1 RSC children (TopPilots + one panel per mission); on a cold instance
// a subset of those parallel queries can come back with "Control plane
// request failed" — Neon's transient error when the control plane API can't
// route the connection in time. Other concurrent panels in the same render
// often succeed, so retrying once or twice with backoff is enough to mask
// the flake without changing the page's architecture.
//
// IMPORTANT: this wraps the *inner* fetcher passed to `unstable_cache`, so a
// retried success still lands in the data cache exactly once. Wrapping the
// public entry instead would also be fine — but pinning it inside the cached
// function keeps the cache contract identical to before.
const TRANSIENT_PATTERNS: readonly RegExp[] = [
  /control plane request failed/i,
  /connection terminated unexpectedly/i,
  /econnreset/i,
  /etimedout/i,
  /fetch failed/i,
  /socket hang up/i
];

export function isTransientNeonError(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!message) return false;
  return TRANSIENT_PATTERNS.some((re) => re.test(message));
}

export interface NeonRetryOptions {
  readonly attempts?: number;
  readonly baseDelayMs?: number;
}

// Run `fn`, retrying on transient Neon errors with exponential backoff +
// jitter. Default: 3 attempts (1 try + 2 retries), 100ms base.
export async function withNeonRetry<T>(
  fn: () => Promise<T>,
  opts: NeonRetryOptions = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 100;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientNeonError(err) || i === attempts - 1) throw err;
      const jitter = Math.random() * baseDelayMs;
      const delay = baseDelayMs * Math.pow(2, i) + jitter;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  // Unreachable — the loop either returns or throws — but TS can't see that.
  throw lastErr;
}
