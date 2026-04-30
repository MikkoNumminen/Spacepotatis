"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import MenuBriefing from "@/components/MenuBriefing";
import Splash, { type SplashStep } from "@/components/Splash";
import SplashGate from "@/components/SplashGate";
import { useOptimisticAuth } from "@/lib/useOptimisticAuth";

// Client wrapper for the landing page main content. Holds the boot splash
// up until the auth status is verified. MenuBriefing is only rendered
// after the splash has fully dismissed so the briefing voice queue
// doesn't kick off while the loading screen is still on top.
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
  }, []);

  return (
    <SplashGate ready={isVerified} splash={<Splash steps={steps} />} onDismiss={onDismiss}>
      {children}
      {splashDismissed && <MenuBriefing />}
    </SplashGate>
  );
}
