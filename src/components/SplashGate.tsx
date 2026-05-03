"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { shouldHideSplash, shouldUnmountImmediately } from "./splashGateLogic";

const MIN_DISPLAY_MS = 600;
const FADE_MS = 400;

export default function SplashGate({
  ready,
  splash,
  children,
  failed = false,
  onDismiss
}: {
  ready: boolean;
  splash: ReactNode;
  children: ReactNode;
  // Set true to rip the splash out of the tree immediately, regardless of
  // `ready`/`minTimeElapsed`. Used when a sibling overlay needs full
  // pointer-event control of the viewport (SaveLoadErrorOverlay on a
  // load-failed status) — without this short-circuit the splash's
  // `fixed inset-0 z-50 pointer-events-auto` shell sits on top of the
  // overlay and swallows every click.
  failed?: boolean;
  // Fires once, exactly when the splash has finished fading out and
  // unmounted. Use this to delay anything that should NOT compete for
  // user attention (or autoplay activation) while the loading screen
  // is on top — menu music, briefing voice queue, etc.
  onDismiss?: () => void;
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

  const hide = shouldHideSplash(ready, minTimeElapsed) || shouldUnmountImmediately(failed);

  // Run the fade for FADE_MS, then drop the splash from the tree entirely so
  // it stops costing render cycles on the live page. On `failed` we skip the
  // fade entirely and unmount synchronously — the player needs the overlay
  // unblocked NOW, not in 400ms.
  useEffect(() => {
    if (failed) {
      setUnmount(true);
      return;
    }
    if (!hide) return;
    const t = setTimeout(() => setUnmount(true), FADE_MS);
    return () => clearTimeout(t);
  }, [hide, failed]);

  // Fire onDismiss once when the splash has fully unmounted. Ref guard so
  // a re-render doesn't re-fire it; the contract is "dismissed for this
  // mount" and parents that rely on it (audio gating) only want it once.
  const dismissFiredRef = useRef(false);
  useEffect(() => {
    if (!unmount || dismissFiredRef.current) return;
    dismissFiredRef.current = true;
    onDismiss?.();
  }, [unmount, onDismiss]);

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
