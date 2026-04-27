"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ROUTES } from "@/lib/routes";

// Shape returned by GET /api/handle. See src/app/api/handle/route.ts — the
// route either returns { handle: string | null } on success, or an
// { error: string } body with a 401/500 status.
export interface HandleResponse {
  handle: string | null;
}

export type HandleStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error"
  | "unauthenticated";

export interface UseHandleResult {
  handle: string | null;
  status: HandleStatus;
  error: string | null;
  refetch: () => void;
}

// Module-level cache + in-flight de-dup. Multiple components mount on the
// same page (UserMenu, PlayButton, HandlePrompt's parent) and used to fire
// concurrent GETs each render. With this cache the round-trip happens
// once per session, every consumer awaits the same Promise, and subsequent
// hook calls resolve from cache synchronously on first effect tick.
//
// TODO: clear `cached` on signOut so a new account doesn't see the previous
// account's handle. Acceptable to defer because every UserMenu mount
// already triggers a fresh fetch keyed off auth status changes.
let cached: HandleResponse | null = null;
let inflight: Promise<HandleResponse> | null = null;

async function fetchHandle(): Promise<HandleResponse> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(ROUTES.api.handle, { cache: "no-store" });
      if (!res.ok) {
        const fallback: HandleResponse = { handle: null };
        cached = fallback;
        return fallback;
      }
      const body = (await res.json()) as HandleResponse;
      cached = body;
      return body;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useHandle(): UseHandleResult {
  const { status: authStatus } = useSession();
  const [handle, setHandle] = useState<string | null>(cached?.handle ?? null);
  const [status, setStatus] = useState<HandleStatus>(() => {
    if (cached) return "ready";
    return "idle";
  });
  const [error, setError] = useState<string | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);

  useEffect(() => {
    if (authStatus === "loading") {
      setStatus("loading");
      return;
    }
    if (authStatus !== "authenticated") {
      setHandle(null);
      setStatus("unauthenticated");
      setError(null);
      return;
    }

    let cancelled = false;
    setStatus(cached ? "ready" : "loading");
    fetchHandle()
      .then((body) => {
        if (cancelled) return;
        setHandle(body.handle);
        setStatus("ready");
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHandle(null);
        setStatus("error");
        setError(err instanceof Error ? err.message : "fetch_failed");
      });

    return () => {
      cancelled = true;
    };
  }, [authStatus, refetchTick]);

  const refetch = useCallback(() => {
    cached = null;
    inflight = null;
    setRefetchTick((n) => n + 1);
  }, []);

  return { handle, status, error, refetch };
}
