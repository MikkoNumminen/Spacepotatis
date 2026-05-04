import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as UserActivationT from "./userActivation";

// userActivation is the gesture gate every raw .play() call funnels
// through. Tests pin: queue order, idempotency of the gesture-flush, the
// post-activation inline path, and that callbacks throwing don't poison
// the queue for siblings.

let mod: typeof UserActivationT;

beforeEach(async () => {
  vi.resetModules();
  mod = await import("./userActivation");
});

afterEach(() => {
  vi.resetModules();
});

describe("userActivation", () => {
  it("starts un-activated and queues callbacks until the first gesture", () => {
    const calls: string[] = [];
    expect(mod.isUserActivated()).toBe(false);
    mod.onUserActivation(() => calls.push("a"));
    mod.onUserActivation(() => calls.push("b"));
    expect(calls).toEqual([]);
    mod._markActivatedForTesting();
    expect(mod.isUserActivated()).toBe(true);
    expect(calls).toEqual(["a", "b"]);
  });

  it("after activation, onUserActivation runs callbacks inline", () => {
    mod._markActivatedForTesting();
    const spy = vi.fn();
    mod.onUserActivation(spy);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a throwing callback does not block the rest of the queue", () => {
    const order: string[] = [];
    mod.onUserActivation(() => order.push("first"));
    mod.onUserActivation(() => {
      order.push("boom");
      throw new Error("ignored");
    });
    mod.onUserActivation(() => order.push("third"));
    // Silence the console.warn from the engine's catch so test output stays
    // clean — the assertion above is what tells us it didn't throw upward.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mod._markActivatedForTesting();
    expect(order).toEqual(["first", "boom", "third"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("calling _markActivatedForTesting twice flushes only once", () => {
    const spy = vi.fn();
    mod.onUserActivation(spy);
    mod._markActivatedForTesting();
    mod._markActivatedForTesting();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
