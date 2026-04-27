"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { loadSave } from "@/game/state/sync";

// Returns `loaded` so SplashGate can wait for the save to land before
// revealing the galaxy view — otherwise the player sees the panel render
// with INITIAL_STATE (0 credits, no missions cleared) for a tick before
// the cloud save populates.
export function useCloudSaveSync(): { loaded: boolean } {
  const { status: authStatus } = useSession();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (authStatus === "loading") {
      setLoaded(false);
      return;
    }
    if (authStatus !== "authenticated") {
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
