"use client";

import { useEffect, type RefObject } from "react";
import type { CombatSummary } from "@/game/phaser/config";
import type { MissionId } from "@/types/game";

// Combat lifecycle: mount Phaser into the parent div when enabled.
// Callers should route their onComplete through a ref so a mid-combat
// auth flip ("loading" → "authenticated") doesn't leave Phaser holding a
// stale closure that skips saveNow()/submitScore(). Re-instantiating
// Phaser on auth changes would be wasteful (and would tear down the
// active game), so the ref pattern is the correct fix here.
export function usePhaserGame({
  enabled,
  parentRef,
  missionId,
  onComplete
}: {
  enabled: boolean;
  parentRef: RefObject<HTMLDivElement | null>;
  missionId: MissionId | null;
  onComplete: (summary: CombatSummary) => void | Promise<void>;
}): void {
  useEffect(() => {
    if (!enabled) return;
    const parent = parentRef.current;
    if (!parent || !missionId) return;

    let disposed = false;
    let game: import("phaser").Game | null = null;

    void (async () => {
      const { createPhaserGame } = await import("@/game/phaser/config");
      if (disposed || !parentRef.current) return;
      const created = await createPhaserGame(parentRef.current, {
        missionId,
        onComplete: (summary) => onComplete(summary)
      });
      // If the effect cleanup ran while createPhaserGame was awaiting,
      // the outer-scope cleanup already ran with game === null. The
      // newly-created Phaser.Game would leak its WebGL context + tickers
      // forever. Destroy it here and exit before assigning the ref.
      if (disposed) {
        created.destroy(true);
        return;
      }
      game = created;
    })();

    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, [enabled, parentRef, missionId, onComplete]);
}
