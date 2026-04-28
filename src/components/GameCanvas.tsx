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
import { useGameState } from "@/game/state/useGameState";
import { markStorySeen, setSolarSystem } from "@/game/state/GameState";
import { getAllMissions, getMission } from "@/game/data/missions";
import { getAllSolarSystems } from "@/game/data/solarSystems";
import { STORY_ENTRIES, getStoryEntry, type StoryId } from "@/game/data/story";
import { storyAudio } from "@/game/audio/story";
import { saveNow, submitScore } from "@/game/state/sync";
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
  const [warpOpen, setWarpOpen] = useState(false);
  const [storyListOpen, setStoryListOpen] = useState(false);
  const [activeStory, setActiveStory] = useState<{ id: StoryId; firstSeen: boolean } | null>(null);
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

  // First-time auto-fire: once the cloud save is loaded and the player
  // is on the galaxy view, find the first story entry tagged
  // `autoTrigger.kind === "first-time"` that they haven't seen yet and
  // open it. The check is gated on `mode === "galaxy"` so we don't
  // surface a story popup mid-combat.
  //
  // `autoFiredRef` is the in-session fire-once guard: once we've shown an
  // entry this session, never re-show it even if the seenStoryEntries
  // selector briefly returns a stale value (e.g. a later cloud sync that
  // races with the local mark-seen). Combined with the localStorage backup
  // in markStorySeen + the union read in hydrate, the popup can't appear
  // a second time on the same device.
  const autoFiredRef = useRef<Set<StoryId>>(new Set());
  useEffect(() => {
    if (!saveLoaded || mode !== "galaxy" || activeStory) return;
    const seen = new Set(seenStoryEntries);
    const next = STORY_ENTRIES.find(
      (e) =>
        e.autoTrigger?.kind === "first-time" &&
        !seen.has(e.id) &&
        !autoFiredRef.current.has(e.id)
    );
    if (next) {
      autoFiredRef.current.add(next.id);
      setActiveStory({ id: next.id, firstSeen: true });
    }
  }, [saveLoaded, mode, seenStoryEntries, activeStory]);

  const handleMarkStorySeen = useCallback(() => {
    if (!activeStory) return;
    markStorySeen(activeStory.id);
    void saveNow();
  }, [activeStory]);

  const handleReplayStory = useCallback((id: StoryId) => {
    setStoryListOpen(false);
    setActiveStory({ id, firstSeen: false });
  }, []);

  // Mission-select trigger: when a quest card opens, fire any unseen story
  // tagged `{ kind: "on-mission-select", missionId: id }`. Overlay-mode
  // entries play voice over the menu bed without opening the modal;
  // modal-mode entries open the popup instead.
  //
  // Gated on `unlockedPlanets` — locked missions show as "?" and their
  // briefing must not leak. Without this gate, opening the locked card
  // (which IS expandable in QuestPanel) would auto-play the briefing
  // and burn the once-only fire.
  const handleMissionSelect = useCallback(
    (missionId: MissionId) => {
      if (!saveLoaded || mode !== "galaxy") return;
      if (!unlockedPlanets.includes(missionId)) return;
      const seen = new Set(seenStoryEntries);
      const entry = STORY_ENTRIES.find(
        (e) =>
          e.autoTrigger?.kind === "on-mission-select" &&
          e.autoTrigger.missionId === missionId &&
          !seen.has(e.id) &&
          !autoFiredRef.current.has(e.id)
      );
      if (!entry) return;
      autoFiredRef.current.add(entry.id);
      if (entry.mode === "overlay") {
        storyAudio.play({
          musicSrc: entry.musicTrack,
          voiceSrc: entry.voiceTrack,
          voiceDelayMs: entry.voiceDelayMs
        });
        markStorySeen(entry.id);
        void saveNow();
      } else {
        setActiveStory({ id: entry.id, firstSeen: true });
      }
    },
    [saveLoaded, mode, seenStoryEntries, unlockedPlanets]
  );

  // Single source of truth for which bed plays: combat owns audio in combat
  // mode, menu owns it everywhere else. Hard-stopping combat music on every
  // non-combat transition is what prevents the two beds from layering on
  // top of each other during the fade-cross. The combat scene also calls
  // combatMusic.loadTrack on its own create(), so this effect is the
  // teardown half of the contract.
  useEffect(() => {
    if (mode === "combat") {
      menuMusic.duck();
    } else {
      combatMusic.stop();
      menuMusic.unduck();
    }
    return () => {
      combatMusic.stop();
      menuMusic.unduck();
    };
  }, [mode]);

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

  const handleMissionComplete = useCallback(
    async (summary: CombatSummary) => {
      setLastSummary(summary);
      if (authStatus === "authenticated") {
        // Order matters: saveNow() must commit before submitScore() so the
        // /api/leaderboard mission-completion guard sees the new mission in
        // the player's save row. Both are best-effort and never throw, so
        // awaiting saveNow doesn't risk blocking the UI on a network hang.
        await saveNow();
        void submitScore(summary);
      }
      await fadeOverlay(1);
      setLaunching(null);
      setMode("galaxy");
      requestAnimationFrame(() => void fadeOverlay(0));
    },
    [fadeOverlay, authStatus]
  );

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
    <div className="relative h-screen w-screen overflow-hidden bg-space-bg">
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
              firstSeen={activeStory.firstSeen}
              onClose={() => setActiveStory(null)}
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
