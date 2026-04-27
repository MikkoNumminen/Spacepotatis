"use client";

import { useEffect, useState, type ReactNode } from "react";
import { shouldHideSplash } from "./splashGateLogic";

const MIN_DISPLAY_MS = 600;
const FADE_MS = 400;

export default function SplashGate({
  ready,
  splash,
  children
}: {
  ready: boolean;
  splash: ReactNode;
  children: ReactNode;
}) {
  // If ready was already true on the very first render — e.g. navigating
  // /play → / where every cache is hot — skip the splash entirely. Without
  // this guard the 600ms minimum-display timer would re-run on every mount,
  // re-flashing the boot screen between in-app navigations.
  const [readyOnMount] = useState(ready);
  const [minTimeElapsed, setMinTimeElapsed] = useState(readyOnMount);
  const [unmount, setUnmount] = useState(readyOnMount);

  useEffect(() => {
    if (readyOnMount) return;
    const t = setTimeout(() => setMinTimeElapsed(true), MIN_DISPLAY_MS);
    return () => clearTimeout(t);
  }, [readyOnMount]);

  const hide = shouldHideSplash(ready, minTimeElapsed);

  // Run the fade for FADE_MS, then drop the splash from the tree entirely so
  // it stops costing render cycles on the live page.
  useEffect(() => {
    if (!hide) return;
    const t = setTimeout(() => setUnmount(true), FADE_MS);
    return () => clearTimeout(t);
  }, [hide]);

  return (
    <>
      {children}
      {!unmount && (
        <div
          className={`fixed inset-0 z-50 transition-opacity ${
            hide ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100"
          }`}
          style={{ transitionDuration: `${FADE_MS}ms` }}
          aria-hidden={hide}
        >
          {splash}
        </div>
      )}
    </>
  );
}
