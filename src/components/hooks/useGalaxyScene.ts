"use client";

import { useEffect, type RefObject } from "react";
import type { MissionDefinition, SolarSystemId } from "@/types/game";

// Galaxy lifecycle: mount GalaxyScene when enabled, tear down otherwise.
// Re-mounts when the active solar system changes so the planet set + sun
// tint reflect the new system. Cheap because Three.js disposal is fast.
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
}): void {
  useEffect(() => {
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
      cleanup = () => scene.dispose();
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [enabled, canvasRef, currentSolarSystemId, onHover, onSelect]);
}
