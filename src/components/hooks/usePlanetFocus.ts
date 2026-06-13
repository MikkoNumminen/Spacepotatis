"use client";

import { useCallback, useState } from "react";
import type { MissionDefinition, MissionId } from "@/types";

// The 3D galaxy scene reports planet clicks; QuestPanel reads `focusedPlanetId`
// to expand the matching entry inline. This hook owns that one-way focus
// bridge, extracted from GameCanvas. `handleSceneSelect(null)` (click on empty
// space) collapses back via the panel's own toggle; `clearFocus` is called
// when a mission launches so the panel doesn't stay expanded over combat.
export function usePlanetFocus(): {
  focusedPlanetId: MissionId | null;
  handleSceneSelect: (mission: MissionDefinition | null) => void;
  clearFocus: () => void;
} {
  const [focusedPlanetId, setFocusedPlanetId] = useState<MissionId | null>(null);
  const handleSceneSelect = useCallback(
    (mission: MissionDefinition | null) => setFocusedPlanetId(mission?.id ?? null),
    []
  );
  const clearFocus = useCallback(() => setFocusedPlanetId(null), []);
  return { focusedPlanetId, handleSceneSelect, clearFocus };
}
