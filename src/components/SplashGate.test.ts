import { describe, expect, it } from "vitest";
import { shouldHideSplash } from "./splashGateLogic";

describe("shouldHideSplash", () => {
  it("keeps the splash up when neither signal has fired", () => {
    expect(shouldHideSplash(false, false)).toBe(false);
  });

  it("keeps the splash up while ready but the minimum display window is still open", () => {
    expect(shouldHideSplash(true, false)).toBe(false);
  });

  it("keeps the splash up after the timer if ready never flipped", () => {
    expect(shouldHideSplash(false, true)).toBe(false);
  });

  it("hides only when both ready and the minimum time have landed", () => {
    expect(shouldHideSplash(true, true)).toBe(true);
  });
});
