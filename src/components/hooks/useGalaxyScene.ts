"use client";

import { useEffect, useState, type RefObject } from "react";
import type { MissionDefinition, SolarSystemId } from "@/types/game";

// Returns `ready` so SplashGate can wait for the first rendered frame
// before fading the boot screen out — rendering the HUD over a black
// canvas looks worse than holding the splash an extra ~50ms.
export function useGalaxyScene({
  enabled,
  canvasRef,
  currentSolarSystemId,
  onHover,
  onSelect
}: {
  enabled: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  currentSolarSystemId: SolarSystemId;
  onHover: (mission: MissionDefinition | null) => void;
  onSelect: (mission: MissionDefinition | null) => void;
}): { ready: boolean } {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const { GalaxyScene } = await import("@/game/three/GalaxyScene");
      if (disposed) return;
      const scene = new GalaxyScene(canvas, {
        onPlanetHover: onHover,
        onPlanetSelect: onSelect,
        activeSystemId: currentSolarSystemId
      });
      scene.start();
      requestAnimationFrame(() => {
        if (!disposed) setReady(true);
      });
      cleanup = () => scene.dispose();
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [enabled, canvasRef, currentSolarSystemId, onHover, onSelect]);

  return { ready };
}
