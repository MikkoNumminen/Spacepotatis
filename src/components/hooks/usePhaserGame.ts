"use client";

import { useEffect, useState, type RefObject } from "react";
import type { CombatSummary } from "@/game/phaser";
import type { MissionId } from "@/types";
import { retryWithBackoff } from "./retryWithBackoff";

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
      const result = await retryWithBackoff<import("phaser").Game>(
        async () => {
          const { createPhaserGame } = await import("@/game/phaser");
          const parent = parentRef.current;
          if (!parent) throw new Error("usePhaserGame: parent ref detached");
          let created: import("phaser").Game | null = null;
          try {
            created = await createPhaserGame(parent, {
              missionId,
              onComplete: (summary) => onComplete(summary)
            });
            return created;
          } catch (err) {
            // Partial init may leave a half-constructed Phaser.Game
            // holding a WebGL context + tickers. Destroy before letting
            // the retry loop see the throw so attempts can't accumulate
            // dead contexts. destroy() may also throw; swallow.
            if (created) {
              try {
                created.destroy(true);
              } catch {
                /* best-effort */
              }
            }
            throw err;
          }
        },
        {
          maxAttempts: MAX_INIT_ATTEMPTS,
          delayMs: RETRY_DELAY_MS,
          isCancelled: () => disposed,
          onAttemptFailed: (err, attempt) =>
            console.error(
              `usePhaserGame: attempt ${attempt}/${MAX_INIT_ATTEMPTS} failed`,
              err
            )
        }
      );

      if (result.kind === "cancelled") return;
      if (result.kind === "failed") {
        setError("Failed to start combat. Refresh the page.");
        return;
      }

      if (disposed) {
        // Cleanup raced us between attempt success and now. Destroy the
        // live Phaser.Game so its WebGL context + tickers don't leak.
        result.value.destroy(true);
        return;
      }
      game = result.value;
    })();

    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, [enabled, parentRef, missionId, onComplete]);

  return { error };
}
