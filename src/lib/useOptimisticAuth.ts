"use client";

import { useEffect, useState } from "react";
import {
  clearAuthCache,
  readAuthCache,
  writeAuthCache,
  type AuthSnapshot
} from "./authCache";
import { getSaveCache, loadSave } from "@/game/state/sync";
import { useHandle, type HandleStatus } from "./useHandle";
import { useReliableSession } from "./useReliableSession";

export type OptimisticAuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface OptimisticAuthResult {
  // The status the consumer should render. May be cached/optimistic until
  // `isVerified` flips true.
  status: OptimisticAuthStatus;
  handle: string | null;
  hasSave: boolean;
  // True once the real session + handle + save check have all resolved.
  // Optimistic rendering between mount and verification is the whole point
  // of this hook, so consumers usually don't need to read this — it exists
  // for tests and for the rare component that wants to avoid acting on
  // possibly-stale state.
  isVerified: boolean;
  // True only when there was no cached snapshot to render optimistically
  // and the real session is still resolving. Components that want to show
  // a skeleton on first visit (rather than a wrong-state flash) gate on
  // this.
  firstVisit: boolean;
  // Pass-through so PlayButton / HandlePrompt can refresh the handle after
  // the user picks one without going through the cache.
  refetchHandle: () => void;
}

// Pure helper exported for tests. Decides whether the real session +
// handle + hasSave triple is ready to overwrite the cached snapshot.
export function isAuthVerified(
  sessionStatus: OptimisticAuthStatus,
  handleStatus: HandleStatus,
  hasSave: boolean | null
): boolean {
  if (sessionStatus === "loading") return false;
  if (sessionStatus === "unauthenticated") return true;
  // sessionStatus === "authenticated" — wait for handle to resolve AND for
  // the /api/save existence check to land.
  if (handleStatus === "idle" || handleStatus === "loading") return false;
  return hasSave !== null;
}

export function useOptimisticAuth(): OptimisticAuthResult {
  const { status: sessionStatus } = useReliableSession();
  const handleResult = useHandle();
  // Seed from the loadSave module cache so a hot remount renders with
  // hasSave already known — that's what lets isAuthVerified return true on
  // the very first render and SplashGate skip the splash entirely.
  const [hasSave, setHasSave] = useState<boolean | null>(() => getSaveCache());
  const [cached] = useState<AuthSnapshot | null>(() => readAuthCache());

  // Derive hasSave from the shared loadSave promise so the splash gate's
  // useCloudSaveSync and this hook share a single /api/save Edge invocation.
  // loadSave() returns true when a save row was loaded into GameState, false
  // otherwise — same boolean we want for hasSave.
  useEffect(() => {
    if (sessionStatus !== "authenticated") {
      setHasSave(null);
      return;
    }
    let cancelled = false;
    void loadSave().then((exists) => {
      if (!cancelled) setHasSave(exists);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  const realStatus: OptimisticAuthStatus = sessionStatus;
  const verified = isAuthVerified(realStatus, handleResult.status, hasSave);

  // Reconciliation: write the just-verified snapshot to cache so the next
  // load is instant. On unauthenticated, clear the cache so a future
  // sign-in starts cold rather than rendering a stale handle.
  useEffect(() => {
    if (!verified) return;
    if (realStatus === "authenticated") {
      writeAuthCache({
        status: "authenticated",
        handle: handleResult.handle,
        hasSave: hasSave ?? false
      });
    } else {
      clearAuthCache();
    }
  }, [verified, realStatus, handleResult.handle, hasSave]);

  if (verified && realStatus !== "loading") {
    return {
      status: realStatus,
      handle: handleResult.handle,
      hasSave: hasSave ?? false,
      isVerified: true,
      firstVisit: false,
      refetchHandle: handleResult.refetch
    };
  }

  if (cached) {
    return {
      status: cached.status,
      handle: cached.handle,
      hasSave: cached.hasSave,
      isVerified: false,
      firstVisit: false,
      refetchHandle: handleResult.refetch
    };
  }

  return {
    status: "loading",
    handle: null,
    hasSave: false,
    isVerified: false,
    firstVisit: true,
    refetchHandle: handleResult.refetch
  };
}
