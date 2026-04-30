"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import MenuBriefing from "@/components/MenuBriefing";
import Splash, { type SplashStep } from "@/components/Splash";
import SplashGate from "@/components/SplashGate";
import { allowPlayback } from "@/game/audio/playbackGate";
import { useOptimisticAuth } from "@/lib/useOptimisticAuth";

// Client wrapper for the landing page main content. Holds the boot splash
// up until the auth status is verified, then opens the audio gate so the
// menu music engine and the briefing voice queue both start their
// countdowns AFTER the player can actually see the menu — not while the
// loading screen is still on top.
export default function LandingShell({ children }: { children: ReactNode }) {
  const { isVerified } = useOptimisticAuth();
  const [splashDismissed, setSplashDismissed] = useState(false);

  const steps = useMemo<readonly SplashStep[]>(
    () => [
      { label: "warm reactors", done: true },
      { label: "verify pilot session", done: isVerified }
    ],
    [isVerified]
  );

  const onDismiss = useCallback(() => {
    setSplashDismissed(true);
    allowPlayback();
  }, []);

  return (
    <SplashGate ready={isVerified} splash={<Splash steps={steps} />} onDismiss={onDismiss}>
      {children}
      {splashDismissed && <MenuBriefing />}
    </SplashGate>
  );
}
