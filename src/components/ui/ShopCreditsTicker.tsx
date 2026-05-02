"use client";

import { useGameState } from "@/game/state/useGameState";

// Live credit balance for the sticky shop header. Reads via useGameState so
// a buy/sell/upgrade in the panels below updates the ticker in the same
// frame as the panel's local credit text, with no manual prop-drilling
// down from /shop's page-level server component.
//
// Format mirrors the in-panel credit headers ("¢ 2081") so the player
// associates the ticker with the same currency reading they see in the
// loadout / hull / new-weapons sections.
export default function ShopCreditsTicker() {
  const credits = useGameState((s) => s.credits);
  return (
    <div className="font-mono text-sm text-hud-amber sm:text-base">
      ¢ {credits.toLocaleString()}
    </div>
  );
}
