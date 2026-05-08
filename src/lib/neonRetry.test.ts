import { describe, expect, it, vi } from "vitest";
import { isTransientNeonError, withNeonRetry } from "./neonRetry";

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
});
