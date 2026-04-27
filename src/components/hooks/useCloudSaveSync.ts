"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { loadSave } from "@/game/state/sync";

// Hydrate from cloud save once on sign-in. No-op when unauthenticated.
export function useCloudSaveSync(): void {
  const { status: authStatus } = useSession();
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    void loadSave();
  }, [authStatus]);
}
