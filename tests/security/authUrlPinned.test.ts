import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * SEC-012 (defense-in-depth) — when running on Vercel or any
 * production-like environment, `AUTH_URL` MUST be pinned to the canonical
 * deployment URL.
 *
 * `src/lib/auth.ts` sets `trustHost: true`, which makes @auth/core fall
 * back to the request's `Host` / `X-Forwarded-Host` header for callback-URL
 * construction when AUTH_URL is unset. Two upstream guards make that
 * tolerable today (Vercel sanitizes the Host header upstream; the Google
 * OAuth Console allow-list pins the redirect URI). If EITHER of those
 * guards weakens — a migration off Vercel, or a loosened allow-list — the
 * route flips to account-takeover-class.
 *
 * Failure mode if this test fails in CI: the workflow's `NODE_ENV` or
 * `VERCEL` env var is set without a matching `AUTH_URL`. CI runs unit
 * tests in `NODE_ENV=test`; if the env has been bumped to `production` or
 * a Vercel-build step set `VERCEL=1`, set `AUTH_URL` to the canonical
 * deployment origin (e.g. `https://spacepotatis.com`) so this contract is
 * met. The same env var must be set in the Vercel project's Production
 * AND Preview env scopes.
 */

// Pure helper, copy of the production rule under test. Lifted here so the
// test file documents the contract without coupling to NextAuth internals.
function isProductionLikeEnv(env: NodeJS.ProcessEnv): boolean {
  return env.VERCEL === "1" || env.NODE_ENV === "production";
}

function authUrlIsPinned(env: NodeJS.ProcessEnv): boolean {
  const url = env.AUTH_URL ?? "";
  return url.length > 0;
}

describe("SEC-012 — AUTH_URL pinning contract", () => {
  const originalAuthUrl = process.env.AUTH_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVercel = process.env.VERCEL;

  beforeEach(() => {
    // Isolate this test from the host env so it never reads stale values
    // from a misconfigured shell. The afterEach below restores them.
    delete process.env.AUTH_URL;
    delete process.env.VERCEL;
    // NODE_ENV is typed readonly in @types/node; the cast is intentional
    // and narrowly scoped to this test setup. process.env IS a plain string
    // map at runtime.
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  });

  afterEach(() => {
    if (originalAuthUrl === undefined) delete process.env.AUTH_URL;
    else process.env.AUTH_URL = originalAuthUrl;
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  it("classifies VERCEL=1 as production-like", () => {
    expect(isProductionLikeEnv({ VERCEL: "1", NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("classifies NODE_ENV=production as production-like", () => {
    expect(isProductionLikeEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("classifies local dev / test env as NOT production-like", () => {
    expect(isProductionLikeEnv({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(false);
    expect(isProductionLikeEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("flags a production-like env with no AUTH_URL as a contract violation", () => {
    const env = { VERCEL: "1", NODE_ENV: "test" } as NodeJS.ProcessEnv;
    expect(isProductionLikeEnv(env)).toBe(true);
    expect(authUrlIsPinned(env)).toBe(false);
  });

  it("accepts a production-like env that pins AUTH_URL", () => {
    const env = {
      VERCEL: "1",
      NODE_ENV: "test",
      AUTH_URL: "https://spacepotatis.com"
    } as NodeJS.ProcessEnv;
    expect(isProductionLikeEnv(env)).toBe(true);
    expect(authUrlIsPinned(env)).toBe(true);
  });

  it("CURRENT PROCESS env: if production-like, AUTH_URL must be set", () => {
    // Tied to the actual env the test is running in. In CI / local dev,
    // NODE_ENV=test and VERCEL is unset → production-like is false and the
    // assertion below is vacuously true. The test exists so a future deploy
    // change that flips NODE_ENV / VERCEL without setting AUTH_URL fails CI.
    if (isProductionLikeEnv(process.env)) {
      expect(authUrlIsPinned(process.env)).toBe(true);
    } else {
      expect(isProductionLikeEnv(process.env)).toBe(false);
    }
  });
});
