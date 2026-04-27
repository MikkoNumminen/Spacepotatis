"use client";

import { useEffect, useRef } from "react";
import type { MissionDefinition, SolarSystemId } from "@/types/game";
import { getAllMissions } from "@/game/data/missions";

const MISSIONS = getAllMissions();

function pickNextMission(
  unlocked: readonly string[],
  completed: readonly string[],
  systemId: SolarSystemId
): MissionDefinition | null {
  // Missions are one-shot: once cleared they cannot be replayed (future
  // replayable content will live under a different concept, e.g. patrols
  // or sorties). So this only suggests an UNCOMPLETED, unlocked mission
  // in the active system. If everything is done, return null and the UI
  // skips auto-opening the launch panel.
  return (
    MISSIONS.find(
      (m) =>
        m.kind === "mission" &&
        m.solarSystemId === systemId &&
        unlocked.includes(m.id) &&
        !completed.includes(m.id)
    ) ?? null
  );
}

// On entering the galaxy view, surface the next playable mission so the
// launch panel is visible immediately. User can dismiss with × — it stays
// closed until the next galaxy entry. The previous-mode ref ensures we
// only run on combat→galaxy (or first-mount) transitions, not every time
// unlockedPlanets / completedMissions change while already in galaxy.
export function useNextMissionAutoSelect({
  inGalaxy,
  unlockedPlanets,
  completedMissions,
  currentSolarSystemId,
  onSelect
}: {
  inGalaxy: boolean;
  unlockedPlanets: readonly string[];
  completedMissions: readonly string[];
  currentSolarSystemId: SolarSystemId;
  onSelect: (mission: MissionDefinition) => void;
}): void {
  const prevInGalaxyRef = useRef<boolean | null>(null);
  useEffect(() => {
    const prev = prevInGalaxyRef.current;
    prevInGalaxyRef.current = inGalaxy;
    if (!inGalaxy) return;
    if (prev === true) return;
    const next = pickNextMission(unlockedPlanets, completedMissions, currentSolarSystemId);
    if (next) onSelect(next);
  }, [inGalaxy, currentSolarSystemId, unlockedPlanets, completedMissions, onSelect]);
}
