import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTransientNeonError, withNeonRetry } from "./neonRetry";

// withNeonRetry warn-logs on every retry. Mute it in this file so the
// unit-test output stays clean — production behavior is unchanged and the
// warn is observable in Vercel logs where it actually matters.
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
});

describe("isTransientNeonError", () => {
  it("matches Neon control plane flake — the symptom we actually saw on /leaderboard", () => {
    expect(isTransientNeonError(new Error("Control plane request failed"))).toBe(true);
    expect(isTransientNeonError(new Error("control plane request FAILED with extra"))).toBe(true);
  });

  it("matches WebSocket / connection flakes Neon's driver surfaces", () => {
    expect(isTransientNeonError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isTransientNeonError(new Error("ECONNRESET reading from socket"))).toBe(true);
    expect(isTransientNeonError(new Error("ETIMEDOUT"))).toBe(true);
    expect(isTransientNeonError(new Error("fetch failed"))).toBe(true);
    expect(isTransientNeonError(new Error("socket hang up"))).toBe(true);
  });

  it("does NOT classify SQL / permission / syntax errors as transient", () => {
    // Retrying these would just hide bugs and waste budget. The deny-by-
    // default-via-allowlist design is intentional.
    expect(isTransientNeonError(new Error("permission denied for table players"))).toBe(false);
    expect(isTransientNeonError(new Error("syntax error at or near \"FROM\""))).toBe(false);
    expect(isTransientNeonError(new Error("relation \"foo\" does not exist"))).toBe(false);
  });

  it("handles non-Error throws (string, null, undefined) without crashing", () => {
    expect(isTransientNeonError("Control plane request failed")).toBe(true);
    expect(isTransientNeonError("definitely not transient")).toBe(false);
    expect(isTransientNeonError(null)).toBe(false);
    expect(isTransientNeonError(undefined)).toBe(false);
    expect(isTransientNeonError(42)).toBe(false);
  });
});

describe("withNeonRetry", () => {
  it("returns the value on first success without sleeping", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await withNeonRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on a transient error and returns the eventual success", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("Control plane request failed");
      return "ok";
    });
    const result = await withNeonRetry(fn, { baseDelayMs: 0 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rethrows immediately on a non-transient error (no retry)", async () => {
    const fn = vi.fn(async () => {
      throw new Error("permission denied for table players");
    });
    await expect(withNeonRetry(fn, { baseDelayMs: 0 })).rejects.toThrow(
      "permission denied"
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the configured attempts and rethrows the last transient error", async () => {
    const fn = vi.fn(async () => {
      throw new Error("Control plane request failed");
    });
    await expect(
      withNeonRetry(fn, { attempts: 3, baseDelayMs: 0 })
    ).rejects.toThrow("Control plane request failed");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("respects a custom attempts count of 1 (try once, no retries)", async () => {
    const fn = vi.fn(async () => {
      throw new Error("Control plane request failed");
    });
    await expect(withNeonRetry(fn, { attempts: 1, baseDelayMs: 0 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("guards `attempts: 0` to a single try (no infinite-loop or undefined-throw footgun)", async () => {
    const fn = vi.fn(async () => "ok");
    // Without the Math.max(1, ...) guard this would skip the loop and
    // throw `undefined` — silent footgun if a caller ever passed 0.
    const result = await withNeonRetry(fn, { attempts: 0, baseDelayMs: 0 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("includes the supplied `label` in the retry warn-log so call sites are distinguishable in Vercel logs", async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      if (calls === 1) throw new Error("Control plane request failed");
      return "ok";
    };
    // Don't use the file-scoped warnSpy — this test specifically asserts on
    // the warn payload, so we need our own spy that doesn't get cleared
    // between retries.
    warnSpy.mockClear();
    await withNeonRetry(fn, { baseDelayMs: 0, label: "test:custom-label" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0]?.[0];
    expect(typeof message).toBe("string");
    expect(message).toContain("withNeonRetry[test:custom-label]");
    expect(message).toContain("attempt 1/3");
    expect(message).toContain("Control plane request failed");
  });

  it("falls back to label='anonymous' when no label is supplied", async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      if (calls === 1) throw new Error("Control plane request failed");
      return "ok";
    };
    warnSpy.mockClear();
    await withNeonRetry(fn, { baseDelayMs: 0 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("withNeonRetry[anonymous]");
  });
});
