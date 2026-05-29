"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CombatSummary } from "@/game/phaser";
import type { MissionId, SolarSystemId } from "@/types";
import { menuMusic, maybePlayClearedCue } from "@/game/audio";
import {
  drainScoreQueue,
  flushSaveQueue,
  saveNow,
  enqueueScore,
  QUEUED_MESSAGE
} from "@/game/state";
import type { VictorySyncStatus } from "@/components/galaxy/VictoryModal";

// Owns the post-combat state machine that drives the VictoryModal:
//   - the lastSummary slot the modal reads
//   - the syncStatus state machine reflecting save + score-post outcomes
//   - the missionSeq race guard so a slow score-post from mission N can't
//     overwrite the modal status of mission N+1
//   - the save + score queue drain triggers (mount / auth transition /
//     visibility / online) that self-heal pending writes from prior
//     sessions
//
// The hook returns `handleMissionComplete` which is wired to Phaser's
// onComplete via a ref on the caller's side (so a mid-combat auth flip
// doesn't leave Phaser holding a stale closure).
//
// On a successful save+post the flow ends by calling out via
// `onCombatExit` — that's the seam where GameCanvas runs its fade and
// flips mode back to "galaxy".

export interface UseVictoryFlowOptions {
  readonly authStatus: "loading" | "authenticated" | "unauthenticated";
  readonly currentSolarSystemId: SolarSystemId;
  readonly completedMissions: readonly MissionId[];
  readonly unlockedSolarSystems: readonly SolarSystemId[];
  readonly fadeOverlay: (toOpacity: number) => Promise<void>;
  readonly onCombatExit: () => void;
}

export interface UseVictoryFlowResult {
  readonly lastSummary: CombatSummary | null;
  readonly setLastSummary: (s: CombatSummary | null) => void;
  readonly syncStatus: VictorySyncStatus;
  readonly handleMissionComplete: (summary: CombatSummary) => Promise<void>;
}

export function useVictoryFlow({
  authStatus,
  currentSolarSystemId,
  completedMissions,
  unlockedSolarSystems,
  fadeOverlay,
  onCombatExit
}: UseVictoryFlowOptions): UseVictoryFlowResult {
  const [lastSummary, setLastSummary] = useState<CombatSummary | null>(null);
  // Sync status for the Victory modal — surfaces save / score-post outcomes
  // so a 422 (cheat-guard rejection) or unauthenticated session doesn't lead
  // to "I won, where's my leaderboard entry?" silent confusion.
  const [syncStatus, setSyncStatus] = useState<VictorySyncStatus>({ kind: "idle" });

  // Sequence counter so a slow submitScore from a prior mission can't
  // overwrite the syncStatus of a newer one. Bumped on every mission
  // complete; the async resolver short-circuits if the seq has moved.
  const missionSeqRef = useRef(0);

  const handleMissionComplete = useCallback(
    async (summary: CombatSummary): Promise<void> => {
      const seq = ++missionSeqRef.current;
      setLastSummary(summary);

      // Cleared-state Grandma cues. Fires at most one of two voice clips
      // when this victory flips the player's progress to "current system
      // cleared" or "every unlocked system cleared". No-op on losses.
      // Persistence for the once-per-device "everything cleared" semantics
      // lives in localStorage inside the helper; nothing on StateSnapshot.
      if (summary.victory) {
        maybePlayClearedCue({
          justCompletedMissionId: summary.missionId,
          completedMissions,
          currentSolarSystemId,
          unlockedSolarSystems
        });
      }

      // Every victory is enqueued FIRST, before any network I/O. The queue
      // is the source of truth for "this score must reach the leaderboard
      // eventually" — if the player closes the tab right now, the next
      // mount drains it. Anonymous wins enqueue too: when the player signs
      // in later, the drain replays them. The leaderboard never silently
      // forgets a win.
      if (summary.victory) {
        enqueueScore({
          missionId: summary.missionId,
          score: summary.score,
          timeSeconds: summary.timeSeconds
        });
      }

      // Anonymous: queue captured the score (if any). Post-mount drain
      // replays once the player signs in. No save POST while anonymous.
      if (authStatus !== "authenticated") {
        setSyncStatus(summary.victory ? { kind: "unauthenticated" } : { kind: "idle" });
        await fadeOverlay(1);
        onCombatExit();
        menuMusic.unduck();
        requestAnimationFrame(() => void fadeOverlay(0));
        return;
      }

      // Authenticated: save first (the leaderboard guard requires the new
      // mission visible in completed_missions). saveNow now goes through
      // the durable save queue — its return reflects three outcomes:
      //   - "ok": server accepted; proceed to score post.
      //   - "queued": POST didn't land (network / 5xx / 401), but the
      //     snapshot is durable in localStorage and will retry on mount /
      //     visibility / online / sign-in. Modal surfaces the queued banner.
      //   - "failed": permanent rejection (400 / 422 cheat-guard); snapshot
      //     was dropped. Modal surfaces the red error banner.
      // The queue drain after saveNow handles the score POST. Drain is
      // non-blocking on the fade so the mode switch isn't gated on
      // score-post latency.
      setSyncStatus({ kind: "pending" });
      const saveResult = await saveNow();
      if (missionSeqRef.current !== seq) return;

      if (saveResult.kind === "failed") {
        setSyncStatus({
          kind: "save_failed",
          status: saveResult.status,
          message: saveResult.message
        });
      } else if (saveResult.kind === "queued") {
        setSyncStatus({ kind: "save_queued", message: saveResult.message });
      } else if (!summary.victory) {
        // Loss: save committed, nothing to post. Modal goes back to idle.
        setSyncStatus({ kind: "idle" });
      } else {
        // Victory: drive the queue. drainScoreQueue picks up THIS mission's
        // entry (and any older queued entries that didn't post yet), POSTs
        // each, drops on success, retries transients next drain. We update
        // the modal status from the drain outcome.
        // SEC-026: await the drain so the save POST always commits before the
        // leaderboard POST — eliminates the 422 mission_not_completed retry
        // storm that fires when the score races ahead of the save.
        const drainResult = await drainScoreQueue();
        if (missionSeqRef.current !== seq) return;
        if (drainResult.remaining === 0) {
          setSyncStatus({ kind: "ok" });
        } else if (drainResult.succeeded > 0) {
          // Some entries posted, others still queued. From this player's
          // POV their latest win went through — show "ok" but the queue
          // will still retry the others on the next drain trigger.
          setSyncStatus({ kind: "ok" });
        } else {
          // Nothing posted this drain. Could be transient; the next
          // drain (mount / visibility / auth-change) will retry.
          setSyncStatus({ kind: "queued", message: QUEUED_MESSAGE });
        }
      }

      await fadeOverlay(1);
      onCombatExit();
      // Combat ducked menuMusic; restore volume on return. With the
      // keep-alive menu engine, this is a pure volume fade — no play()
      // call, no autoplay risk.
      menuMusic.unduck();
      requestAnimationFrame(() => void fadeOverlay(0));
    },
    [
      authStatus,
      completedMissions,
      currentSolarSystemId,
      unlockedSolarSystems,
      fadeOverlay,
      onCombatExit
    ]
  );

  // Drive both the save queue AND the score queue on three triggers so a
  // pending save / missing leaderboard entry self-heals without user action:
  //   1. Mount + every transition to authenticated (offline saves and
  //      anonymous wins from a prior session catch up the moment the
  //      player signs in).
  //   2. Tab returns to foreground (covers "closed the tab mid-flight" —
  //      the next visit reposts).
  //   3. Network-online events (mobile out-of-coverage → coverage).
  // Save flush runs BEFORE score drain so the leaderboard's mission-graph
  // guard sees the freshest completed_missions in the same trigger pass.
  // Both are no-ops when their queue is empty, so spamming triggers is
  // cheap.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    const drainBoth = async (): Promise<void> => {
      await flushSaveQueue();
      await drainScoreQueue();
    };
    void drainBoth();
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") void drainBoth();
    };
    const onOnline = (): void => {
      void drainBoth();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [authStatus]);

  return {
    lastSummary,
    setLastSummary,
    syncStatus,
    handleMissionComplete
  };
}
