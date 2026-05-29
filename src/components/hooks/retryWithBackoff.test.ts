import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryWithBackoff } from "./retryWithBackoff";

// The retry policy backs the renderer init paths (useGalaxyScene +
// usePhaserGame). A regression here is the difference between "transient
// WebGL blip recovers silently on a warp" and "player sees RENDERER
// FAILED TO START on the first throw" — the exact UX failure mode that
// motivated PR #266.

describe("retryWithBackoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns ok with the value when the first attempt succeeds", async () => {
    const attempt = vi.fn().mockResolvedValue("scene");
    const result = await retryWithBackoff(attempt, {
      maxAttempts: 3,
      delayMs: 300,
      isCancelled: () => false
    });
    expect(result).toEqual({ kind: "ok", value: "scene" });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and returns ok once an attempt succeeds", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("blip-1"))
      .mockRejectedValueOnce(new Error("blip-2"))
      .mockResolvedValueOnce("scene");

    const promise = retryWithBackoff(attempt, {
      maxAttempts: 3,
      delayMs: 300,
      isCancelled: () => false
    });

    // Two backoff sleeps × 300ms — drain them while leaving the resolved
    // attempt in the microtask queue to settle.
    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;

    expect(result).toEqual({ kind: "ok", value: "scene" });
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("returns failed with the last error after exhausting all attempts", async () => {
    const finalErr = new Error("blip-3");
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("blip-1"))
      .mockRejectedValueOnce(new Error("blip-2"))
      .mockRejectedValueOnce(finalErr);

    const onAttemptFailed = vi.fn();
    const promise = retryWithBackoff(attempt, {
      maxAttempts: 3,
      delayMs: 300,
      isCancelled: () => false,
      onAttemptFailed
    });
    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;

    expect(result).toEqual({ kind: "failed", lastError: finalErr });
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(onAttemptFailed).toHaveBeenCalledTimes(3);
    expect(onAttemptFailed.mock.calls[0]?.[1]).toBe(1);
    expect(onAttemptFailed.mock.calls[2]?.[1]).toBe(3);
  });

  it("short-circuits with cancelled when isCancelled flips true before the first attempt", async () => {
    const attempt = vi.fn().mockResolvedValue("scene");
    const result = await retryWithBackoff(attempt, {
      maxAttempts: 3,
      delayMs: 300,
      isCancelled: () => true
    });
    expect(result).toEqual({ kind: "cancelled" });
    expect(attempt).not.toHaveBeenCalled();
  });

  it("short-circuits with cancelled when isCancelled flips true during a backoff sleep", async () => {
    let cancelled = false;
    const attempt = vi.fn().mockRejectedValue(new Error("blip"));
    const promise = retryWithBackoff(attempt, {
      maxAttempts: 3,
      delayMs: 300,
      isCancelled: () => cancelled
    });

    // First attempt fails synchronously. Flip cancelled while the backoff
    // sleep is in flight; the post-sleep cancellation check must catch it
    // and stop further attempts.
    await vi.advanceTimersByTimeAsync(50);
    cancelled = true;
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result).toEqual({ kind: "cancelled" });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("returns ok with the value even if isCancelled flips true after a successful attempt", async () => {
    // Intentional contract: a constructed value (live GalaxyScene /
    // Phaser.Game) must reach the caller so the caller can dispose it.
    // Dropping it on the floor here would leak its WebGL context.
    let cancelled = false;
    const attempt = vi.fn().mockImplementation(async () => {
      cancelled = true;
      return "scene";
    });
    const result = await retryWithBackoff(attempt, {
      maxAttempts: 3,
      delayMs: 300,
      isCancelled: () => cancelled
    });
    expect(result).toEqual({ kind: "ok", value: "scene" });
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
