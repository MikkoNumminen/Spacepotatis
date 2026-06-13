"use client";

import { useCallback, useState } from "react";
import type { MissionId, SolarSystemId } from "@/types";
import { getAllMissions, getAllSolarSystems } from "@/game/data";
import { setSolarSystem } from "@/game/state";

// Owns the galaxy warp control: the WarpPicker open/close flag plus the
// "warp to the next system that still has unfinished missions" jump. Extracted
// from GameCanvas — pure progression math over the mission catalog + the
// player's completed set, with no rendering.
//
// `warpToNext` scans unlocked systems in order from the current one; the
// first with an unfinished combat mission becomes the destination. If none
// qualifies (everything cleared), it falls back to opening the picker so the
// player can still revisit a cleared system manually.
export function useWarpControls(args: {
  completedMissions: readonly MissionId[];
  currentSolarSystemId: SolarSystemId;
  unlockedSolarSystems: readonly SolarSystemId[];
}): {
  warpOpen: boolean;
  openWarp: () => void;
  closeWarp: () => void;
  warpToNext: () => void;
  warpToSystem: (id: SolarSystemId) => void;
} {
  const { completedMissions, currentSolarSystemId, unlockedSolarSystems } = args;
  const [warpOpen, setWarpOpen] = useState(false);

  const warpToNext = useCallback(() => {
    const completed = new Set(completedMissions);
    const systemIds = getAllSolarSystems().map((s) => s.id);
    const currentIdx = systemIds.indexOf(currentSolarSystemId);
    for (let step = 1; step <= systemIds.length; step++) {
      const candidateId = systemIds[(currentIdx + step) % systemIds.length];
      if (!candidateId || candidateId === currentSolarSystemId) continue;
      if (!unlockedSolarSystems.includes(candidateId)) continue;
      const hasUnfinished = getAllMissions().some(
        (m) => m.solarSystemId === candidateId && m.kind === "mission" && !completed.has(m.id)
      );
      if (hasUnfinished) {
        setSolarSystem(candidateId);
        return;
      }
    }
    setWarpOpen(true);
  }, [completedMissions, currentSolarSystemId, unlockedSolarSystems]);

  const warpToSystem = useCallback((id: SolarSystemId) => {
    setSolarSystem(id);
    setWarpOpen(false);
  }, []);

  const openWarp = useCallback(() => setWarpOpen(true), []);
  const closeWarp = useCallback(() => setWarpOpen(false), []);

  return { warpOpen, openWarp, closeWarp, warpToNext, warpToSystem };
}
