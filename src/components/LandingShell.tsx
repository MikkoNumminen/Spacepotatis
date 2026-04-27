"use client";

import { useMemo, type ReactNode } from "react";
import Splash, { type SplashStep } from "@/components/Splash";
import SplashGate from "@/components/SplashGate";
import { useOptimisticAuth } from "@/lib/useOptimisticAuth";

// Client wrapper for the landing page main content. Holds the boot splash
// up until the auth status is verified — that's the only signal worth
// gating on here, since the page is force-static (HTML ships instantly)
// and the only thing that "pops in" is the auth-aware buttons.
export default function LandingShell({ children }: { children: ReactNode }) {
  const { isVerified } = useOptimisticAuth();

  const steps = useMemo<readonly SplashStep[]>(
    () => [
      { label: "warm reactors", done: true },
      { label: "verify pilot session", done: isVerified }
    ],
    [isVerified]
  );

  return (
    <SplashGate ready={isVerified} splash={<Splash steps={steps} />}>
      {children}
    </SplashGate>
  );
}
