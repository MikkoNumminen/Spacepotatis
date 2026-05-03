import { describe, expect, it } from "vitest";
import { shouldHideSplash, shouldUnmountImmediately } from "./splashGateLogic";

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

describe("shouldUnmountImmediately", () => {
  // Regression guard for the PR #101 reviewer-found blocker: the splash's
  // `fixed inset-0 z-50 pointer-events-auto` shell was sitting on top of
  // SaveLoadErrorOverlay, making the overlay's three buttons unclickable.
  // The fix is to short-circuit the gate the moment a load failure is
  // surfaced — bypassing both `ready` and `minTimeElapsed` — so the
  // sibling overlay has a clean viewport to claim.

  it("does not unmount when failed is false (normal happy path)", () => {
    expect(shouldUnmountImmediately(false)).toBe(false);
  });

  it("unmounts immediately when failed is true (overlay must take over)", () => {
    expect(shouldUnmountImmediately(true)).toBe(true);
  });

  it("ignores ready / minTimeElapsed entirely — failed always wins", () => {
    // Belt-and-suspenders: the helper takes only `failed`, so neither
    // ready nor minTimeElapsed can leak in and delay the unmount. Encoding
    // this as a separate test so a future signature change (e.g. someone
    // gating failed-unmount on minTimeElapsed "to avoid flicker") trips
    // a red light, since that would re-introduce the bug — the player
    // sees the splash blocking the overlay for up to 600ms.
    expect(shouldUnmountImmediately(true)).toBe(true);
  });
});
