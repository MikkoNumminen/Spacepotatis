"use client";

import { useEffect, useState } from "react";
import { loadSave } from "@/game/state/sync";
import {
  getLastLoadResultValue,
  setCurrentPlayerEmail
} from "@/game/state/syncCache";
import { useReliableSession } from "@/lib/useReliableSession";
import {
  cachedResultToState,
  decideFetch,
  loadResultToState,
  type CloudSaveSyncState
} from "./useCloudSaveSyncLogic";

// Drives the splash gate's "load saved progress" step AND the new save-
// load error overlay. Returns three states:
//
//   - "loading"      — splash stays visible, waiting for the load attempt.
//   - "loaded"       — server-loaded / anon / no-save / pending-only. The
//                      galaxy is safe to render. NOT ALL of these mean a
//                      real save exists (anon / no-save) — but the player's
//                      visible state matches their actual progress.
//   - "load-failed"  — 5xx, network error, or schema parse failure with no
//                      pending save to fall back on. The in-memory
//                      GameState is still INITIAL_STATE; rendering the
//                      galaxy without a warning would show 0 credits / no
//                      missions and the player would think their save was
//                      wiped. The error overlay (SaveLoadErrorOverlay) MUST
//                      take priority over the game canvas in this branch.
//                      saveNow is independently gated by the hydration flag
//                      so even if the user dismisses the overlay,
//                      INITIAL_STATE never POSTs over their real save.
//
// Initial state seeds from the rich loadSave cache so a hot remount (nav
// back into /play after a successful load) reports loaded on the very
// first render — that's the signal SplashGate needs to skip the splash
// entirely. A previously-failed load also seeds correctly: the overlay
// shows immediately on remount instead of flashing the splash to "loaded".
//
// Side effect: pushes the resolved player email into syncCache so saveQueue
// stamps every pending snapshot with account ownership. A nullish email
// (loading / unauthenticated) clears the cache, which also resets the
// hydration flag so a subsequent saveNow can't POST INITIAL_STATE under a
// different account on the same browser.
export function useCloudSaveSync(): CloudSaveSyncState {
  const { status: authStatus, data: session } = useReliableSession();
  const sessionEmail = session?.user?.email ?? null;
  const [state, setState] = useState<CloudSaveSyncState>(() =>
    cachedResultToState(getLastLoadResultValue())
  );

  useEffect(() => {
    // Mirror the resolved auth state into syncCache. The setter is a no-op
    // when the value is unchanged, so spamming this on every render is
    // cheap. On account swap (different email or null), syncCache also
    // resets hydrationCompleted so saveNow blocks until the new account's
    // loadSave verifies.
    if (authStatus === "authenticated") {
      setCurrentPlayerEmail(sessionEmail);
    } else if (authStatus === "unauthenticated") {
      setCurrentPlayerEmail(null);
    }
    // authStatus === "loading" — leave the previous value in place. A flicker
    // through "loading" during a session refresh shouldn't drop the email
    // and reset hydration mid-flight.
  }, [authStatus, sessionEmail]);

  useEffect(() => {
    const cached = cachedResultToState(getLastLoadResultValue());
    const decision = decideFetch(authStatus, cached);
    if (decision.kind === "loading") {
      setState({ status: "loading" });
      return;
    }
    if (decision.kind === "skip-load") {
      setState(decision.state);
      return;
    }
    setState({ status: "loading" });
    let cancelled = false;
    void loadSave().then((result) => {
      if (cancelled) return;
      setState(loadResultToState(result));
    });
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  return state;
}
