"use client";

import { useCallback } from "react";
import type { MissionDefinition } from "@/types";
import { combatMusic, resolveCombatTrack } from "@/game/audio";
import { ROUTES } from "@/lib/routes";

// Owns the combat-session lifecycle that used to sit inline in GameCanvas:
// entering combat from a planet click (`handleLaunch`) and returning to the
// galaxy when combat ends (`onCombatExit`). Pure orchestration over the mode
// machine + transition overlay + combat music bed — no rendering, no state of
// its own.
//
// `onCombatExit` only touches the mode setters, so it is safe to compute here
// and hand to useVictoryFlow (which fires it after the post-combat sync). That
// keeps the galaxy↔combat swap in one place instead of split across the
// orchestrator.
export function useCombatLaunch(args: {
  fadeOverlay: (to: number) => Promise<void> | void;
  leaveGalaxy: (path: string) => void;
  setMode: (mode: "galaxy" | "combat") => void;
  setLaunching: (mission: MissionDefinition | null) => void;
  clearFocus: () => void;
}): {
  handleLaunch: (mission: MissionDefinition) => Promise<void>;
  onCombatExit: () => void;
} {
  const { fadeOverlay, leaveGalaxy, setMode, setLaunching, clearFocus } = args;

  const handleLaunch = useCallback(
    async (mission: MissionDefinition) => {
      // Defensive: scenery bodies have no action and shouldn't reach here
      // (QuestPanel and the raycaster filter them out), but if a click
      // sneaks through, do nothing rather than launching a no-op combat.
      if (mission.kind === "scenery") return;
      if (mission.kind === "shop") {
        // Client-side nav preserves in-memory GameState (credits etc.).
        leaveGalaxy(ROUTES.page.shop);
        return;
      }
      clearFocus();
      // Start fetching + playing the mission bed BEFORE the fade-to-black so
      // the audio is up by the time the combat scene appears. CombatScene's
      // own loadTrack call later is a no-op when the src already matches —
      // resolveCombatTrack guarantees both sites pick the same src (incl.
      // the fallback for missions with no dedicated track).
      combatMusic.loadTrack(resolveCombatTrack(mission.musicTrack));
      await fadeOverlay(1);
      setLaunching(mission);
      setMode("combat");
      requestAnimationFrame(() => void fadeOverlay(0));
    },
    [clearFocus, fadeOverlay, leaveGalaxy, setLaunching, setMode]
  );

  const onCombatExit = useCallback(() => {
    setLaunching(null);
    setMode("galaxy");
  }, [setLaunching, setMode]);

  return { handleLaunch, onCombatExit };
}
