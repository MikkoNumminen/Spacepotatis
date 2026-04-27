import { describe, expect, it } from "vitest";
import { isAuthVerified } from "./useOptimisticAuth";

// The hook itself is glue around useSession + useHandle + a fetch effect;
// exercising it would need React + jsdom which the project doesn't pull in.
// The pure decision function is the actual reconciliation logic and the
// thing worth pinning in tests.
describe("isAuthVerified", () => {
  it("waits while session status is still loading", () => {
    expect(isAuthVerified("loading", "ready", true)).toBe(false);
    expect(isAuthVerified("loading", "idle", null)).toBe(false);
  });

  it("considers unauthenticated immediately verified — no handle/save needed", () => {
    expect(isAuthVerified("unauthenticated", "unauthenticated", null)).toBe(true);
    expect(isAuthVerified("unauthenticated", "loading", null)).toBe(true);
  });

  it("waits for the handle fetch when authenticated", () => {
    expect(isAuthVerified("authenticated", "idle", true)).toBe(false);
    expect(isAuthVerified("authenticated", "loading", true)).toBe(false);
  });

  it("waits for the /api/save probe when authenticated and handle is ready", () => {
    expect(isAuthVerified("authenticated", "ready", null)).toBe(false);
  });

  it("reports verified once authenticated, handle resolved, save probed", () => {
    expect(isAuthVerified("authenticated", "ready", true)).toBe(true);
    expect(isAuthVerified("authenticated", "ready", false)).toBe(true);
  });

  it("treats handle-fetch error as 'resolved' so a flaky /api/handle does not block forever", () => {
    expect(isAuthVerified("authenticated", "error", true)).toBe(true);
  });
});
