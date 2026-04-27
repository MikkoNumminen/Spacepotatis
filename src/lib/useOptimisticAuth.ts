"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  clearAuthCache,
  readAuthCache,
  writeAuthCache,
  type AuthSnapshot
} from "./authCache";
import { ROUTES } from "./routes";
import { useHandle, type HandleStatus } from "./useHandle";

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
  const { status: sessionStatus } = useSession();
  const handleResult = useHandle();
  const [hasSave, setHasSave] = useState<boolean | null>(null);
  const [cached] = useState<AuthSnapshot | null>(() => readAuthCache());

  // Probe /api/save once we know the user is authenticated. Co-located here
  // (instead of in PlayButton) so SignInButton/UserMenu also get the cache
  // refreshed even if the player never visits the landing page during the
  // session.
  useEffect(() => {
    if (sessionStatus !== "authenticated") {
      setHasSave(null);
      return;
    }
    let cancelled = false;
    fetch(ROUTES.api.save, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return false;
        const body = (await res.json()) as unknown;
        return body !== null;
      })
      .then((exists) => {
        if (!cancelled) setHasSave(exists);
      })
      .catch(() => {
        if (!cancelled) setHasSave(false);
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
