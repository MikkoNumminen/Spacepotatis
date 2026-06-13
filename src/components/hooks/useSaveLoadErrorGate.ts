"use client";

import { useCallback, useEffect, useState } from "react";
import { clearLoadSaveCache } from "@/game/state";
import type { CloudSaveSyncState } from "./useCloudSaveSyncLogic";

// Owns the save-load error overlay's visibility, extracted from GameCanvas.
// One cohesive concern: "should the blocking load-error overlay show, and
// what happens on retry/dismiss?".
//
// SECURITY NOTE: dismissing the overlay only removes the visual blocker. It
// does NOT clear the underlying load-failed status — saveNow stays gated by
// the hydration flag in syncCache, so even an "I understand the risk"
// dismissal can't trigger an INITIAL_STATE POST that would wipe the server
// save. See useCloudSaveSync / syncCache for the hydration gate.
export function useSaveLoadErrorGate(saveSync: CloudSaveSyncState): {
  showLoadError: boolean;
  reason: CloudSaveSyncState["reason"];
  onRetry: () => void;
  onDismiss: () => void;
} {
  const [errorDismissed, setErrorDismissed] = useState(false);
  const showLoadError = saveSync.status === "load-failed" && !errorDismissed;

  // Reset the dismissal whenever a successful load happens (e.g. retry
  // succeeds after an earlier failure), so a future failure cycle re-blocks
  // instead of being silently dismissed from the previous one.
  useEffect(() => {
    if (saveSync.status === "loaded") setErrorDismissed(false);
  }, [saveSync.status]);

  const onRetry = useCallback(() => {
    // clearLoadSaveCache wipes the cache + lastLoadResult + hydration flag.
    // The simplest reliable retry is a full reload: it re-runs the splash
    // gate's loadSave with a clean slate, and avoids needing to thread a
    // re-fetch trigger through useReliableSession (which is what otherwise
    // gates the useCloudSaveSync effect).
    clearLoadSaveCache();
    setErrorDismissed(false);
    window.location.reload();
  }, []);

  const onDismiss = useCallback(() => setErrorDismissed(true), []);

  return {
    showLoadError,
    reason: saveSync.status === "load-failed" ? saveSync.reason : undefined,
    onRetry,
    onDismiss
  };
}
