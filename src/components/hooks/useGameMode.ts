"use client";

import { useEffect, useState } from "react";
import type { MissionDefinition } from "@/types";
import { combatMusic, menuMusic, shopMusic } from "@/game/audio";

// Owns the galaxy↔combat mode machine and the audio bed contract that
// follows it. The contract: combat owns audio in combat mode, menu owns
// it everywhere else. Hard-stopping combat music on every non-combat
// transition is what prevents the two beds from layering on top of each
// other during the fade-cross. CombatScene also calls
// combatMusic.loadTrack on its own create(), so the teardown half of
// the contract lives here.
//
// shopMusic is also stopped on every entry to non-combat: if the player
// arrived from /shop, ShopUI's own cleanup should already have stopped
// the shop bed, but the 4-sec fade can race against rapid navigation
// and the ShopTabs lifecycle (ShopUI mounts/unmounts on tab switch), so
// a defensive stop here guarantees the galaxy view never holds the shop
// bed alive.
//
// Cleanup gating: the cleanup branch must NOT call combatMusic.stop() on
// a galaxy→combat transition. handleLaunch primes combatMusic.loadTrack
// BEFORE flipping mode to "combat" — if cleanup unconditionally stops on
// the dep change, the just-loaded mission bed dies and the player gets
// silence for the first second of combat (until CombatScene.create()
// re-loads). Same shape for menuMusic.unduck(): leaving combat needs an
// unduck, but a route-swap unmount during combat must not pre-unduck the
// menu bed while the combat scene is still up.

export type Mode = "galaxy" | "combat";

export interface UseGameModeOptions {
  // Cancellation hook so a mission briefing playing under combat doesn't
  // step on the combat bed when mode flips to "combat".
  readonly cancelPendingBriefing: () => void;
}

export interface UseGameModeResult {
  readonly mode: Mode;
  readonly setMode: (mode: Mode) => void;
  readonly launching: MissionDefinition | null;
  readonly setLaunching: (mission: MissionDefinition | null) => void;
}

export function useGameMode({ cancelPendingBriefing }: UseGameModeOptions): UseGameModeResult {
  const [mode, setMode] = useState<Mode>("galaxy");
  const [launching, setLaunching] = useState<MissionDefinition | null>(null);

  useEffect(() => {
    if (mode === "combat") {
      menuMusic.duck();
      cancelPendingBriefing();
    } else {
      combatMusic.stop();
      shopMusic.stop();
      menuMusic.unduck();
    }
    return () => {
      // Only stop combat/shop beds and unduck menu when we are LEAVING
      // combat — never when entering it. The cleanup runs both on a
      // dep change (galaxy→combat) and on unmount; we want the teardown
      // half of the contract only when the previous mode was "combat".
      if (mode === "combat") {
        combatMusic.stop();
        shopMusic.stop();
        menuMusic.unduck();
      }
    };
  }, [mode, cancelPendingBriefing]);

  return { mode, setMode, launching, setLaunching };
}
