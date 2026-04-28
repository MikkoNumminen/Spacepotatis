"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { MissionDefinition, MissionId, SolarSystemId } from "@/types/game";
import { getAllMissions } from "@/game/data/missions";
import type { GalaxyScene, MissionStatus, MissionStatusMap } from "@/game/three/GalaxyScene";

const STATUS_CLEARED: MissionStatus = { label: "✓ Cleared", color: "#5effa7" };
const STATUS_AVAILABLE: MissionStatus = { label: "Available", color: "#ffcc33" };
const STATUS_LOCKED: MissionStatus = { label: "Locked", color: "#7a8898" };
const STATUS_SHOP: MissionStatus = { label: "Shop", color: "#9ce8ff" };

function buildStatusMap(
  completedMissions: readonly MissionId[],
  unlockedPlanets: readonly MissionId[]
): MissionStatusMap {
  const completed = new Set(completedMissions);
  const unlocked = new Set(unlockedPlanets);
  const map = new Map<MissionId, MissionStatus>();
  for (const m of getAllMissions()) {
    if (m.kind === "scenery") continue;
    if (m.kind === "shop") {
      map.set(m.id, STATUS_SHOP);
    } else if (completed.has(m.id)) {
      map.set(m.id, STATUS_CLEARED);
    } else if (unlocked.has(m.id)) {
      map.set(m.id, STATUS_AVAILABLE);
    } else {
      map.set(m.id, STATUS_LOCKED);
    }
  }
  return map;
}

// Returns `ready` so SplashGate can wait for the first rendered frame
// before fading the boot screen out — rendering the HUD over a black
// canvas looks worse than holding the splash an extra ~50ms.
export function useGalaxyScene({
  enabled,
  canvasRef,
  currentSolarSystemId,
  completedMissions,
  unlockedPlanets,
  onHover,
  onSelect
}: {
  enabled: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  currentSolarSystemId: SolarSystemId;
  completedMissions: readonly MissionId[];
  unlockedPlanets: readonly MissionId[];
  onHover: (mission: MissionDefinition | null) => void;
  onSelect: (mission: MissionDefinition | null) => void;
}): { ready: boolean } {
  const [ready, setReady] = useState(false);
  const sceneRef = useRef<GalaxyScene | null>(null);

  // Recompute the status map whenever progress changes. Both effects below
  // read this — the build effect snapshots it for the constructor, the
  // apply effect re-pushes it to the live scene on subsequent updates.
  const statusMap = useMemo(
    () => buildStatusMap(completedMissions, unlockedPlanets),
    [completedMissions, unlockedPlanets]
  );
  const statusMapRef = useRef(statusMap);
  statusMapRef.current = statusMap;

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
        activeSystemId: currentSolarSystemId,
        initialStatuses: statusMapRef.current
      });
      sceneRef.current = scene;
      scene.start();
      requestAnimationFrame(() => {
        if (!disposed) setReady(true);
      });
      cleanup = () => {
        sceneRef.current = null;
        scene.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [enabled, canvasRef, currentSolarSystemId, onHover, onSelect]);

  // Mission clears and planet unlocks happen mid-session; push the new
  // status map to the live scene without rebuilding the rig.
  useEffect(() => {
    sceneRef.current?.applyStatuses(statusMap);
  }, [statusMap]);

  return { ready };
}
