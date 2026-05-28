"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Splash, { type SplashStep } from "@/components/Splash";
import SplashGate from "@/components/SplashGate";
import SaveLoadErrorOverlay from "@/components/SaveLoadErrorOverlay";
import { useCloudSaveSync } from "@/components/hooks/useCloudSaveSync";
import { clearLoadSaveCache, useOptimisticAuth } from "@/game/state";

// Client wrapper for /shop. Holds the boot splash up until auth is verified
// AND the cloud save has loaded — without it, a hard refresh on the shop
// drops the player into INITIAL_STATE for the first ~100ms (0 credits, no
// augments owned) before the cloud save hydrates.
//
// Audio recovery on hard refresh is handled at the engine layer (each
// engine routes through `onUserActivation`), not here — this shell just
// gives the player the visual gate they expect on a fresh load. ShopUI's
// mount effects fire as usual; the gesture queue catches the autoplay
// block and starts both the market-arrival voice and the shop music bed
// inside the first user gesture.
//
// SaveLoadErrorOverlay is a sibling of SplashGate (not a child) so a
// load-failed branch stays unblocked even if SplashGate's own failed-fast
// path ever regresses — same defense-in-depth pattern as GameCanvas.
export default function ShopShell({ children }: { children: ReactNode }) {
  const { isVerified } = useOptimisticAuth();
  const saveSync = useCloudSaveSync();
  const saveLoaded = saveSync.status === "loaded";
  const [errorDismissed, setErrorDismissed] = useState(false);
  const showLoadError = saveSync.status === "load-failed" && !errorDismissed;

  const steps = useMemo<readonly SplashStep[]>(
    () => [
      { label: "verify pilot session", done: isVerified },
      { label: "load saved progress", done: saveLoaded }
    ],
    [isVerified, saveLoaded]
  );
  const ready = isVerified && saveLoaded;

  const handleRetryLoad = useCallback(() => {
    clearLoadSaveCache();
    setErrorDismissed(false);
    window.location.reload();
  }, []);

  return (
    <>
      <SplashGate
        ready={ready}
        failed={saveSync.status === "load-failed"}
        splash={<Splash steps={steps} />}
      >
        {children}
      </SplashGate>
      {showLoadError && (
        <SaveLoadErrorOverlay
          reason={saveSync.status === "load-failed" ? saveSync.reason : undefined}
          onRetry={handleRetryLoad}
          onDismiss={() => setErrorDismissed(true)}
        />
      )}
    </>
  );
}
