"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { useRouter } from "next/navigation";

// Owns the galaxy view's transition/exit concern, extracted from GameCanvas
// where the white-flash + warp-transition fixes had accreted inline. Two
// responsibilities, one cohesive concern ("moving the galaxy view in and
// out of frame cleanly"):
//
//   1. `galaxyHasBooted` latch + `showGalaxyTransition` — distinguishes the
//      initial boot (covered by SplashGate) from a post-boot warp, where
//      `sceneReady` briefly flips false while the old GalaxyScene is disposed
//      and a new one is constructed. The transient overlay keys off this so
//      it only paints during warps and never double-covers the splash.
//
//   2. `leaveGalaxy(href)` — hides the WebGL canvas SYNCHRONOUSLY before
//      navigating. The galaxy canvas is a large GPU-composited layer; when
//      React tears the /play tree down during a route swap the browser paints
//      a white frame where that layer was (even canvas-less destinations like
//      /shop flash for it). Setting visibility:hidden here, inside the click
//      handler and before router.push, removes the compositor layer first so
//      the teardown has nothing to flash. Must run here, not in
//      useGalaxyScene's effect cleanup — that's a passive cleanup React runs
//      AFTER the node is detached, too late to affect the painted frame.
//      No un-hide path needed: leaveGalaxy only fires on a route change that
//      unmounts GameCanvas (and the canvas with it) within the same tick.

type Router = ReturnType<typeof useRouter>;

export interface UseGalaxyTransitionResult {
  readonly showGalaxyTransition: boolean;
  readonly leaveGalaxy: (href: string) => void;
}

export function useGalaxyTransition({
  mode,
  sceneReady,
  galaxyError,
  showLoadError,
  canvasRef,
  router
}: {
  mode: "galaxy" | "combat";
  sceneReady: boolean;
  galaxyError: string | null;
  showLoadError: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  router: Router;
}): UseGalaxyTransitionResult {
  const [galaxyHasBooted, setGalaxyHasBooted] = useState(false);
  useEffect(() => {
    if (sceneReady) setGalaxyHasBooted(true);
  }, [sceneReady]);

  const showGalaxyTransition =
    mode === "galaxy"
    && galaxyHasBooted
    && !sceneReady
    && !galaxyError
    && !showLoadError;

  const leaveGalaxy = useCallback(
    (href: string) => {
      const canvas = canvasRef.current;
      if (canvas) canvas.style.visibility = "hidden";
      router.push(href);
    },
    [canvasRef, router]
  );

  return { showGalaxyTransition, leaveGalaxy };
}
