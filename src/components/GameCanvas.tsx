"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { CombatSummary } from "@/game/phaser/config";
import type { MissionDefinition, MissionId } from "@/types/game";
import { combatMusic, menuMusic } from "@/game/audio/music";
import HudFrame from "@/components/galaxy/HudFrame";
import QuestPanel from "@/components/galaxy/QuestPanel";
import VictoryModal from "@/components/galaxy/VictoryModal";
import WarpPicker from "@/components/galaxy/WarpPicker";
import StoryModal from "@/components/story/StoryModal";
import StoryListModal from "@/components/story/StoryListModal";
import Splash, { type SplashStep } from "@/components/Splash";
import SplashGate from "@/components/SplashGate";
import { useCloudSaveSync } from "@/components/hooks/useCloudSaveSync";
import { useGalaxyScene } from "@/components/hooks/useGalaxyScene";
import { usePhaserGame } from "@/components/hooks/usePhaserGame";
import { useStoryTriggers } from "@/components/hooks/useStoryTriggers";
import { useGameState } from "@/game/state/useGameState";
import { setSolarSystem } from "@/game/state/GameState";
import { getAllMissions, getMission } from "@/game/data/missions";
import { getAllSolarSystems } from "@/game/data/solarSystems";
import { getStoryEntry } from "@/game/data/story";
import { drainScoreQueue, saveNow } from "@/game/state/sync";
import { enqueueScore, QUEUED_MESSAGE } from "@/game/state/scoreQueue";
import type { VictorySyncStatus } from "@/components/galaxy/VictoryModal";
import { ROUTES } from "@/lib/routes";
import { useOptimisticAuth } from "@/lib/useOptimisticAuth";

type Mode = "galaxy" | "combat";

export default function GameCanvas() {
  const galaxyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const combatParentRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const router = useRouter();
  const { status: authStatus } = useSession();
  const { isVerified } = useOptimisticAuth();
  const [mode, setMode] = useState<Mode>("galaxy");
  const [hovered, setHovered] = useState<MissionDefinition | null>(null);
  const [focusedPlanetId, setFocusedPlanetId] = useState<MissionId | null>(null);
  const [launching, setLaunching] = useState<MissionDefinition | null>(null);
  const [lastSummary, setLastSummary] = useState<CombatSummary | null>(null);
  // Sync status for the Victory modal — surfaces save / score-post outcomes
  // so a 422 (cheat-guard rejection) or unauthenticated session doesn't lead
  // to "I won, where's my leaderboard entry?" silent confusion.
  const [syncStatus, setSyncStatus] = useState<VictorySyncStatus>({ kind: "idle" });
  const [warpOpen, setWarpOpen] = useState(false);
  const currentSolarSystemId = useGameState((s) => s.currentSolarSystemId);
  const unlockedSolarSystems = useGameState((s) => s.unlockedSolarSystems);
  const completedMissions = useGameState((s) => s.completedMissions);
  const unlockedPlanets = useGameState((s) => s.unlockedPlanets);
  const seenStoryEntries = useGameState((s) => s.seenStoryEntries);

  const handleWarpToNextSystem = useCallback(() => {
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

  const { loaded: saveLoaded } = useCloudSaveSync();

  const {
    activeStory,
    setActiveStory,
    storyListOpen,
    setStoryListOpen,
    handleMissionSelect,
    handleMarkStorySeen,
    handleReplayStory,
    cancelPendingBriefing
  } = useStoryTriggers({
    enabled: mode === "galaxy",
    saveLoaded,
    currentSolarSystemId,
    unlockedPlanets,
    completedMissions,
    seenStoryEntries
  });

  // Single source of truth for which bed plays: combat owns audio in combat
  // mode, menu owns it everywhere else. Hard-stopping combat music on every
  // non-combat transition is what prevents the two beds from layering on
  // top of each other during the fade-cross. The combat scene also calls
  // combatMusic.loadTrack on its own create(), so this effect is the
  // teardown half of the contract.
  useEffect(() => {
    if (mode === "combat") {
      menuMusic.duck();
      // A mission briefing playing under combat would step on the combat
      // bed — kill any pending or running overlay before combat takes over.
      cancelPendingBriefing();
    } else {
      combatMusic.stop();
      menuMusic.unduck();
    }
    return () => {
      combatMusic.stop();
      menuMusic.unduck();
    };
  }, [mode, cancelPendingBriefing]);

  // Planet click in the 3D scene flows into QuestPanel as a focus signal so
  // the matching entry expands inline. Clearing on null lets a click on
  // empty space collapse-back through the panel's own toggle.
  const handleSceneSelect = useCallback((mission: MissionDefinition | null) => {
    setFocusedPlanetId(mission?.id ?? null);
  }, []);

  const { ready: sceneReady } = useGalaxyScene({
    enabled: mode === "galaxy",
    canvasRef: galaxyCanvasRef,
    currentSolarSystemId,
    completedMissions,
    unlockedPlanets,
    onHover: setHovered,
    onSelect: handleSceneSelect
  });

  const fadeOverlay = useCallback(async (toOpacity: number) => {
    const el = overlayRef.current;
    if (!el) return;
    const { fade } = await import("@/game/three/TransitionManager");
    await fade(el, toOpacity, 0.35).promise;
  }, []);

  const handleLaunch = useCallback(
    async (mission: MissionDefinition) => {
      // Defensive: scenery bodies have no action and shouldn't reach here
      // (QuestPanel and the raycaster filter them out), but if a click
      // sneaks through, do nothing rather than launching a no-op combat.
      if (mission.kind === "scenery") return;
      if (mission.kind === "shop") {
        // Client-side nav preserves in-memory GameState (credits etc.).
        router.push(ROUTES.page.shop);
        return;
      }
      setFocusedPlanetId(null);
      // Start fetching + playing the mission bed BEFORE the fade-to-black so
      // the audio is up by the time the combat scene appears. CombatScene's
      // own loadTrack call later is a no-op when the src already matches.
      if (mission.musicTrack) {
        combatMusic.loadTrack(mission.musicTrack);
      }
      await fadeOverlay(1);
      setLaunching(mission);
      setMode("combat");
      requestAnimationFrame(() => void fadeOverlay(0));
    },
    [fadeOverlay, router]
  );

  // Sequence counter so a slow submitScore from a prior mission can't
  // overwrite the syncStatus of a newer one. Bumped on every mission
  // complete; the async resolver short-circuits if the seq has moved.
  const missionSeqRef = useRef(0);

  const handleMissionComplete = useCallback(
    async (summary: CombatSummary) => {
      const seq = ++missionSeqRef.current;
      setLastSummary(summary);

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
        setLaunching(null);
        setMode("galaxy");
        menuMusic.unduck();
        requestAnimationFrame(() => void fadeOverlay(0));
        return;
      }

      // Authenticated: save first (the leaderboard guard requires the new
      // mission visible in completed_missions). The queue drain after
      // saveNow handles the score POST — including a retry if the immediate
      // submit hit a transient failure. Drain is non-blocking on the fade,
      // so the mode switch isn't gated on score-post latency.
      setSyncStatus({ kind: "pending" });
      const saveResult = await saveNow();
      if (missionSeqRef.current !== seq) return;

      if (!saveResult.ok) {
        setSyncStatus({
          kind: "save_failed",
          status: saveResult.status,
          message: saveResult.message
        });
      } else if (!summary.victory) {
        // Loss: save committed, nothing to post. Modal goes back to idle.
        setSyncStatus({ kind: "idle" });
      } else {
        // Victory: drive the queue. drainScoreQueue picks up THIS mission's
        // entry (and any older queued entries that didn't post yet), POSTs
        // each, drops on success, retries transients next drain. We update
        // the modal status from the drain outcome.
        void drainScoreQueue().then((drainResult) => {
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
        });
      }

      await fadeOverlay(1);
      setLaunching(null);
      setMode("galaxy");
      // Combat ducked menuMusic; restore volume on return. With the
      // keep-alive menu engine, this is a pure volume fade — no play()
      // call, no autoplay risk.
      menuMusic.unduck();
      requestAnimationFrame(() => void fadeOverlay(0));
    },
    [fadeOverlay, authStatus]
  );

  // Drain the score queue on three triggers so a missing leaderboard entry
  // self-heals without user action:
  //   1. Mount + every transition to authenticated (anonymous wins from a
  //      prior session catch up the moment the player signs in).
  //   2. Tab returns to foreground (covers the "I closed the tab while the
  //      submit was in flight" case — the next visit reposts).
  //   3. Network-online events (mobile out-of-coverage → coverage).
  // Drain is a no-op when the queue is empty, so spamming the trigger is
  // cheap.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    void drainScoreQueue();
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") void drainScoreQueue();
    };
    const onOnline = (): void => {
      void drainScoreQueue();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [authStatus]);

  // Route Phaser's onComplete through a ref so a mid-combat auth flip
  // ("loading" → "authenticated") doesn't leave Phaser holding a stale
  // closure that skips saveNow()/submitScore(). Re-instantiating Phaser
  // on auth changes would be wasteful (and would tear down the active
  // game), so the ref pattern is the correct fix here.
  const completeRef = useRef<(summary: CombatSummary) => void | Promise<void>>(() => undefined);
  completeRef.current = handleMissionComplete;
  const stableComplete = useCallback(
    (summary: CombatSummary) => completeRef.current(summary),
    []
  );

  usePhaserGame({
    enabled: mode === "combat",
    parentRef: combatParentRef,
    missionId: launching?.id ?? null,
    onComplete: stableComplete
  });

  const splashSteps = useMemo<readonly SplashStep[]>(
    () => [
      { label: "verify pilot session", done: isVerified },
      { label: "load saved progress", done: saveLoaded },
      { label: "spin up galaxy", done: sceneReady }
    ],
    [isVerified, saveLoaded, sceneReady]
  );
  const ready = isVerified && saveLoaded && sceneReady;

  return (
    <SplashGate ready={ready} splash={<Splash steps={splashSteps} />}>
    <div className="relative h-dvh w-dvw overflow-hidden bg-space-bg">
      {mode === "galaxy" && <canvas ref={galaxyCanvasRef} className="block h-full w-full" />}
      {mode === "combat" && <div ref={combatParentRef} className="h-full w-full" />}

      {mode === "galaxy" && ready && (
        <div className="pointer-events-none absolute inset-0">
          <HudFrame
            hovered={hovered}
            onBackToMenu={() => router.push(ROUTES.page.home)}
            onOpenWarp={() => setWarpOpen(true)}
            warpAvailable={unlockedSolarSystems.length > 1}
            onOpenStoryList={() => setStoryListOpen(true)}
          />
          <QuestPanel
            currentSolarSystemId={currentSolarSystemId}
            focusedPlanetId={focusedPlanetId}
            onLaunch={handleLaunch}
            onWarpToNext={handleWarpToNextSystem}
            onMissionSelect={handleMissionSelect}
          />
          {warpOpen && (
            <WarpPicker
              currentSystemId={currentSolarSystemId}
              unlockedSystemIds={unlockedSolarSystems}
              onClose={() => setWarpOpen(false)}
              onSelect={(id) => {
                setSolarSystem(id);
                setWarpOpen(false);
              }}
            />
          )}
          {lastSummary && (
            <VictoryModal
              summary={lastSummary}
              missionName={getMission(lastSummary.missionId).name}
              syncStatus={syncStatus}
              onClose={() => setLastSummary(null)}
            />
          )}
          {storyListOpen && (
            <StoryListModal
              seenStoryEntries={seenStoryEntries}
              onReplay={handleReplayStory}
              onClose={() => setStoryListOpen(false)}
            />
          )}
          {activeStory && (
            <StoryModal
              entry={getStoryEntry(activeStory.id)}
              mode={activeStory.fromLog ? "replay-from-log" : "first-time"}
              firstSeen={activeStory.firstSeen}
              onClose={() => {
                if (activeStory.fromLog) {
                  // Back from a replay returns to the Story log — keep the
                  // bed running, just swap the visible modal back.
                  setActiveStory(null);
                  setStoryListOpen(true);
                } else {
                  setActiveStory(null);
                }
              }}
              onMarkSeen={handleMarkStorySeen}
            />
          )}
        </div>
      )}

      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: 0 }}
      />
    </div>
    </SplashGate>
  );
}
