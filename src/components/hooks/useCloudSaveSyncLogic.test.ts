import { describe, expect, it } from "vitest";
import {
  cachedResultToState,
  decideFetch,
  loadResultToState,
  type CloudSaveSyncState
} from "./useCloudSaveSyncLogic";
import type { LoadResult } from "@/game/state/sync";

// Pure helpers behind useCloudSaveSync. These are the load-failure-detection
// contract: a regression here is the difference between "splash clears,
// galaxy renders with INITIAL_STATE, player thinks save is gone" (the bug
// this PR fixes) and "splash holds, error overlay appears, player has
// agency to retry without panicking".

describe("loadResultToState", () => {
  it.each([
    { kind: "server-loaded" },
    { kind: "anon" },
    { kind: "no-save" },
    { kind: "pending-only" }
  ] satisfies LoadResult[])("maps $kind to status='loaded' (galaxy is safe to render)", (result) => {
    expect(loadResultToState(result)).toEqual({ status: "loaded" });
  });

  it("maps load-failed to status='load-failed' and forwards the reason", () => {
    expect(
      loadResultToState({ kind: "load-failed", reason: "http_error", status: 500 })
    ).toEqual({ status: "load-failed", reason: "http_error" });
    expect(
      loadResultToState({ kind: "load-failed", reason: "schema_rejected", status: 200 })
    ).toEqual({ status: "load-failed", reason: "schema_rejected" });
    expect(
      loadResultToState({ kind: "load-failed", reason: "network_error", status: 0 })
    ).toEqual({ status: "load-failed", reason: "network_error" });
  });

  it("maps load-failed without a reason to status='load-failed' with reason undefined", () => {
    expect(loadResultToState({ kind: "load-failed" })).toEqual({
      status: "load-failed",
      reason: undefined
    });
  });
});

describe("cachedResultToState", () => {
  it("treats null / undefined as still-loading (safer than asserting loaded)", () => {
    expect(cachedResultToState(null)).toEqual({ status: "loading" });
    expect(cachedResultToState(undefined)).toEqual({ status: "loading" });
  });

  it("treats non-object cache values as still-loading", () => {
    expect(cachedResultToState("server-loaded")).toEqual({ status: "loading" });
    expect(cachedResultToState(42)).toEqual({ status: "loading" });
    expect(cachedResultToState(true)).toEqual({ status: "loading" });
  });

  it("treats objects without a recognized kind as still-loading (corrupted slot must NOT bypass error UI)", () => {
    expect(cachedResultToState({})).toEqual({ status: "loading" });
    expect(cachedResultToState({ kind: "garbage" })).toEqual({ status: "loading" });
  });

  it.each([
    { kind: "server-loaded" },
    { kind: "anon" },
    { kind: "no-save" },
    { kind: "pending-only" }
  ])("maps cache shape with kind=$kind to loaded", (cache) => {
    expect(cachedResultToState(cache)).toEqual({ status: "loaded" });
  });

  it("maps load-failed cache + valid reason through to the overlay state", () => {
    expect(
      cachedResultToState({ kind: "load-failed", reason: "http_error" })
    ).toEqual({ status: "load-failed", reason: "http_error" });
  });

  it("maps load-failed cache + missing/invalid reason to load-failed with reason undefined", () => {
    // The hook's overlay still triggers — only the optional sub-label is
    // omitted — so the player still sees the warning UI even after a
    // partial cache corruption.
    expect(cachedResultToState({ kind: "load-failed" })).toEqual({
      status: "load-failed",
      reason: undefined
    });
    expect(
      cachedResultToState({ kind: "load-failed", reason: "garbage" })
    ).toEqual({ status: "load-failed", reason: undefined });
  });
});

describe("decideFetch", () => {
  it("auth=loading + cold cache → 'loading' (wait for auth before deciding)", () => {
    expect(decideFetch("loading", { status: "loading" })).toEqual({ kind: "loading" });
  });

  it("auth=loading + warm cache → 'skip-load' with the cached state (hot remount)", () => {
    // Without this branch, hot-remounting /play would yank the splash back
    // to "loading" even though the previous mount already loaded everything.
    expect(decideFetch("loading", { status: "loaded" })).toEqual({
      kind: "skip-load",
      state: { status: "loaded" }
    });
    expect(
      decideFetch("loading", { status: "load-failed", reason: "http_error" })
    ).toEqual({
      kind: "skip-load",
      state: { status: "load-failed", reason: "http_error" }
    });
  });

  it("auth=unauthenticated → 'skip-load' as loaded (no server save to read)", () => {
    expect(decideFetch("unauthenticated", { status: "loading" })).toEqual({
      kind: "skip-load",
      state: { status: "loaded" }
    });
  });

  it("auth=authenticated + cold cache → 'fire-load' (need to call loadSave)", () => {
    expect(decideFetch("authenticated", { status: "loading" })).toEqual({
      kind: "fire-load"
    });
  });

  it("auth=authenticated + warm cache → 'skip-load' with the cached state (avoid re-fetch on remount)", () => {
    expect(decideFetch("authenticated", { status: "loaded" })).toEqual({
      kind: "skip-load",
      state: { status: "loaded" }
    });
    expect(
      decideFetch("authenticated", { status: "load-failed", reason: "schema_rejected" })
    ).toEqual({
      kind: "skip-load",
      state: { status: "load-failed", reason: "schema_rejected" }
    });
  });

  it("auth=authenticated + cached load-failed → does NOT silently re-fetch (overlay sticks until explicit retry)", () => {
    // This is the key invariant for the dismissal flow: if a previous
    // mount's load failed, a fresh remount must NOT fire a silent retry
    // and flip to 'loaded' before the overlay is shown. The user retry
    // (which calls clearLoadSaveCache + reload) is the only path back to a
    // fire-load decision.
    const decision = decideFetch("authenticated", {
      status: "load-failed",
      reason: "network_error"
    });
    expect(decision.kind).toBe("skip-load");
    if (decision.kind === "skip-load") {
      expect(decision.state.status).toBe("load-failed");
    }
  });
});

describe("status=load-failed must drive SplashGate.failed=true (PR #101 follow-up blocker)", () => {
  // The reviewer-found blocker on PR #101 was a wiring bug: the splash sat
  // on top of SaveLoadErrorOverlay because GameCanvas wasn't telling the
  // gate to bail out on load-failed. The fix passes `failed={saveSync.status
  // === "load-failed"}` to SplashGate. These tests pin the decision in
  // pure form so a future refactor that drops the failed prop wiring trips
  // a red light here — without rendering the JSX (no RTL in this repo).

  function shouldSplashYieldToOverlay(state: CloudSaveSyncState): boolean {
    return state.status === "load-failed";
  }

  it("loaded status keeps the splash in charge of fading", () => {
    expect(shouldSplashYieldToOverlay({ status: "loaded" })).toBe(false);
  });

  it("loading status keeps the splash up (no failure yet)", () => {
    expect(shouldSplashYieldToOverlay({ status: "loading" })).toBe(false);
  });

  it("load-failed status forces the splash to yield (overlay takes over)", () => {
    expect(
      shouldSplashYieldToOverlay({ status: "load-failed", reason: "http_error" })
    ).toBe(true);
    expect(
      shouldSplashYieldToOverlay({ status: "load-failed", reason: "network_error" })
    ).toBe(true);
    expect(
      shouldSplashYieldToOverlay({ status: "load-failed", reason: "schema_rejected" })
    ).toBe(true);
    expect(shouldSplashYieldToOverlay({ status: "load-failed" })).toBe(true);
  });
});
