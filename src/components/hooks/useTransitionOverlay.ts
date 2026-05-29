"use client";

import { useCallback, useRef } from "react";

// Owns the black fade overlay used to mask the galaxy↔combat swap.
// One concern: ref the overlay div and expose an async fade(toOpacity)
// helper that dynamically imports the three.js TransitionManager so the
// helper itself doesn't drag the three.js scene chunks into this file's
// static-import graph.
//
// Why a deep dynamic import (not the @/game/three barrel): Next.js does
// not tree-shake dynamic imports of barrels — pulling the barrel here
// would re-introduce every scene/sun/planet/orbit module into the
// resulting chunk.

export interface UseTransitionOverlayResult {
  readonly overlayRef: React.RefObject<HTMLDivElement | null>;
  readonly fadeOverlay: (toOpacity: number) => Promise<void>;
}

export function useTransitionOverlay(): UseTransitionOverlayResult {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const fadeOverlay = useCallback(async (toOpacity: number): Promise<void> => {
    const el = overlayRef.current;
    if (!el) return;
    const { fade } = await import("@/game/three/TransitionManager");
    await fade(el, toOpacity, 0.35).promise;
  }, []);

  return { overlayRef, fadeOverlay };
}
