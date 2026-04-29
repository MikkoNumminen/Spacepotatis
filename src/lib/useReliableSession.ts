"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { readAuthCache } from "./authCache";

// Wraps `useSession` with a one-shot retry that catches transient
// `/api/auth/session` failures.
//
// The bug it fixes: on a page refresh, NextAuth's session probe
// occasionally returned "no session" even when the auth cookie was still
// valid (Edge cold-start race, transient network blip, etc.). That flip to
// `status: "unauthenticated"` cascaded through the app — the auth cache
// got wiped, the handle reset to "Pilot", `useCloudSaveSync` skipped
// `loadSave()`, and the player's credits + missions appeared lost. Once
// the cache was wiped, the next refresh had nothing to optimistic-render
// from, so the broken state was sticky until the player re-signed-in.
//
// Behavior:
// - On first observation of (cache says authenticated) + (session says
//   unauthenticated), trigger `update()` once and surface the status as
//   `"loading"` until the refetch resolves.
// - The retry flag is module-level so multiple consumers (the HUD,
//   `useCloudSaveSync`, `useHandle`) share a single retry per page load
//   instead of firing N parallel `/api/auth/session` probes.
// - If the post-retry session is still unauthenticated, the hook returns
//   `"unauthenticated"` exactly as before — no infinite loop, no masking
//   of a real sign-out.
let retriedThisSession = false;

// Test-only — reset between cases so suite-level state doesn't leak.
export function resetReliableSessionRetry(): void {
  retriedThisSession = false;
}

export function useReliableSession(): ReturnType<typeof useSession> {
  const result = useSession();
  const { status, update } = result;
  // Snapshot the cache once on mount. The cache is only relevant for the
  // very first session check after a refresh; later updates flow through
  // the normal NextAuth path.
  const [cachedAuth] = useState(() => readAuthCache()?.status === "authenticated");

  useEffect(() => {
    if (retriedThisSession) return;
    if (!cachedAuth) return;
    if (status !== "unauthenticated") return;
    retriedThisSession = true;
    void update();
  }, [status, cachedAuth, update]);

  if (!retriedThisSession && cachedAuth && status === "unauthenticated") {
    return {
      data: null,
      status: "loading",
      update
    } as ReturnType<typeof useSession>;
  }
  return result;
}
