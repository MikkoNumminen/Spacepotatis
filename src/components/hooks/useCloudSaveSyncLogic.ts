// Pure decision helpers split out of useCloudSaveSync.tsx so vitest (Node
// environment, no React renderer) can pin the load-failure-detection
// contract that PR fix/usecloudsavesync-load-failure-ux added.
//
// useCloudSaveSync used to set `loaded: true` in `.finally(...)` regardless
// of outcome — a 5xx, network error, or schema parse failure left the
// in-memory state at INITIAL_STATE while the splash cleared, so the player
// saw what looked like a fresh account and could panic-clear localStorage.
// The hook now returns a 3-state status + reason, and these helpers encode
// the mapping from auth state + loadSave result + cache to that status.

import type { LoadResult, LoadFailureReason } from "@/game/state/sync";

export type CloudSaveStatus = "loading" | "loaded" | "load-failed";

export interface CloudSaveSyncState {
  readonly status: CloudSaveStatus;
  // Coarse machine-readable tag for the load-failed branch (NOT a raw
  // error.message — see leaderboard error.tsx for why we don't surface
  // those). undefined for loading / loaded.
  readonly reason?: LoadFailureReason;
}

const STATE_LOADING: CloudSaveSyncState = { status: "loading" };
const STATE_LOADED: CloudSaveSyncState = { status: "loaded" };

// Map a LoadResult to the user-visible CloudSaveStatus. server-loaded /
// anon / no-save / pending-only are all "loaded" from the UI's POV — the
// player either has a hydrated save or is anonymously playing fresh; the
// galaxy is safe to render. Only "load-failed" triggers the error overlay.
export function loadResultToState(result: LoadResult): CloudSaveSyncState {
  if (result.kind === "load-failed") {
    return { status: "load-failed", reason: result.reason };
  }
  return STATE_LOADED;
}

// Defensive narrowing for the rich cache slot. The slot is typed `unknown`
// in syncCache.ts so the cache file stays Zod-free; this helper accepts a
// runtime value and returns a CloudSaveSyncState, treating any
// unrecognized shape as "loading" (safer than asserting "loaded" — a
// corrupted slot must never silently bypass the error UI).
export function cachedResultToState(cached: unknown): CloudSaveSyncState {
  if (cached === null || cached === undefined) return STATE_LOADING;
  if (typeof cached !== "object") return STATE_LOADING;
  const kind = (cached as { kind?: unknown }).kind;
  if (
    kind === "server-loaded" ||
    kind === "anon" ||
    kind === "no-save" ||
    kind === "pending-only"
  ) {
    return STATE_LOADED;
  }
  if (kind === "load-failed") {
    const reason = (cached as { reason?: unknown }).reason;
    const validReason: LoadFailureReason | undefined =
      reason === "http_error" ||
      reason === "network_error" ||
      reason === "schema_rejected"
        ? reason
        : undefined;
    return { status: "load-failed", reason: validReason };
  }
  return STATE_LOADING;
}

// Pre-fetch decision: given the auth status + whether the cache already
// has a hydrated answer, what state should the hook seed / hold?
//  - "loading"    — auth not yet resolved AND cache has no answer (need to
//                   wait for a load attempt).
//  - "skip-load"  — anonymous OR cache already authoritative; status is
//                   "loaded" without firing a fetch.
//  - "fire-load"  — authenticated, cache cold; need to call loadSave and
//                   render based on the outcome.
export type FetchDecision =
  | { readonly kind: "loading" }
  | { readonly kind: "skip-load"; readonly state: CloudSaveSyncState }
  | { readonly kind: "fire-load" };

export function decideFetch(
  authStatus: "loading" | "authenticated" | "unauthenticated",
  cachedState: CloudSaveSyncState
): FetchDecision {
  if (authStatus === "loading") {
    // Don't yank loaded back to "loading" on a hot remount where the cache
    // already proves the load resolved.
    if (cachedState.status !== "loading") {
      return { kind: "skip-load", state: cachedState };
    }
    return { kind: "loading" };
  }
  if (authStatus !== "authenticated") {
    // Anonymous play — there's no server save to read; the galaxy is safe
    // to render with INITIAL_STATE (or a localStorage-only progression).
    return { kind: "skip-load", state: STATE_LOADED };
  }
  if (cachedState.status !== "loading") {
    return { kind: "skip-load", state: cachedState };
  }
  return { kind: "fire-load" };
}
