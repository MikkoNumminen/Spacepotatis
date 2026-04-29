"use client";

import { useEffect, useState } from "react";
import { isSaveCached, loadSave } from "@/game/state/sync";
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
export function useCloudSaveSync(): { loaded: boolean } {
  const { status: authStatus } = useReliableSession();
  const [loaded, setLoaded] = useState(() => isSaveCached());

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
