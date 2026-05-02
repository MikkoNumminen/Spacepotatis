"use client";

import { useEffect, useState } from "react";
import { loadSave } from "@/game/state/sync";
import { isSaveCached, setCurrentPlayerEmail } from "@/game/state/syncCache";
import { useReliableSession } from "@/lib/useReliableSession";

// Returns `loaded` so SplashGate can wait for the save to land before
// revealing the galaxy view — otherwise the player sees the panel render
// with INITIAL_STATE (0 credits, no missions cleared) for a tick before
// the cloud save populates.
//
// Initial state seeds from the loadSave module cache so a hot remount
// (nav back into /play after a successful load) reports loaded=true on
// the very first render — that's the signal SplashGate needs to skip
// the splash entirely.
//
// Side effect: pushes the resolved player email into syncCache so saveQueue
// stamps every pending snapshot with account ownership. A nullish email
// (loading / unauthenticated) clears the cache, which also resets the
// hydration flag so a subsequent saveNow can't POST INITIAL_STATE under a
// different account on the same browser.
export function useCloudSaveSync(): { loaded: boolean } {
  const { status: authStatus, data: session } = useReliableSession();
  const sessionEmail = session?.user?.email ?? null;
  const [loaded, setLoaded] = useState(() => isSaveCached());

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
    if (authStatus === "loading") {
      // Don't yank loaded back to false on a hot remount where the cache
      // already proves the save is loaded.
      if (!isSaveCached()) setLoaded(false);
      return;
    }
    if (authStatus !== "authenticated") {
      setLoaded(true);
      return;
    }
    if (isSaveCached()) {
      setLoaded(true);
      return;
    }
    setLoaded(false);
    let cancelled = false;
    void loadSave().finally(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  return { loaded };
}
