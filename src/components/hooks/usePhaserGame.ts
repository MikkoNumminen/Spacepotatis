"use client";

import { useEffect, useState, type RefObject } from "react";
import type { CombatSummary } from "@/game/phaser";
import type { MissionId } from "@/types";

// Retry budget for transient init failures (dynamic-import flake, brief
// WebGL context loss as the parent div mounts, etc.). The error is only
// surfaced after MAX_INIT_ATTEMPTS — transient blips that recover on a
// retry never reach the user.
const MAX_INIT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;

// Combat lifecycle: mount Phaser into the parent div when enabled.
// Callers should route their onComplete through a ref so a mid-combat
// auth flip ("loading" → "authenticated") doesn't leave Phaser holding a
// stale closure that skips saveNow()/submitScore(). Re-instantiating
// Phaser on auth changes would be wasteful (and would tear down the
// active game), so the ref pattern is the correct fix here.
//
// Returns `error` so the consumer can surface a "couldn't start combat"
// overlay when the dynamic import or Phaser init throws. Without this the
// async IIFE would swallow the rejection and the player would see a blank
// canvas with no signal that anything went wrong.
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
}): { error: string | null } {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setError(null);
      return;
    }
    const parent = parentRef.current;
    if (!parent || !missionId) return;

    let disposed = false;
    let game: import("phaser").Game | null = null;
    setError(null);

    void (async () => {
      for (let attempt = 1; attempt <= MAX_INIT_ATTEMPTS; attempt++) {
        try {
          const { createPhaserGame } = await import("@/game/phaser");
          if (disposed || !parentRef.current) return;
          const created = await createPhaserGame(parentRef.current, {
            missionId,
            onComplete: (summary) => onComplete(summary)
          });
          // If the effect cleanup ran while createPhaserGame was awaiting,
          // the outer-scope cleanup already ran with game === null. The
          // newly-created Phaser.Game would leak its WebGL context +
          // tickers forever. Destroy it here and exit before assigning
          // the ref.
          if (disposed) {
            created.destroy(true);
            return;
          }
          game = created;
          return;
        } catch (err) {
          console.error(
            `usePhaserGame: attempt ${attempt}/${MAX_INIT_ATTEMPTS} failed`,
            err
          );
          if (disposed) return;
          if (attempt < MAX_INIT_ATTEMPTS) {
            // Hold the loading state; don't surface the error yet. The
            // fade-to-black overlay from handleLaunch is still visible
            // for the first ~300ms anyway, so a quiet retry typically
            // recovers without the player ever seeing anything.
            await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
            if (disposed) return;
          } else {
            setError("Failed to start combat. Refresh the page.");
          }
        }
      }
    })();

    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, [enabled, parentRef, missionId, onComplete]);

  return { error };
}
