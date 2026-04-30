"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MissionId } from "@/types/game";
import type { SolarSystemId } from "@/types/game";
import { type StoryId } from "@/game/data/story";
import {
  selectFirstTimeEntry,
  selectOnMissionSelectEntry,
  selectOnSystemEnterEntry,
  selectReadyClearedIdleEntries
} from "@/game/data/storyTriggers";
import { storyAudio } from "@/game/audio/story";
import { storyLogAudio } from "@/game/audio/storyLogAudio";
import { markStorySeen } from "@/game/state/GameState";
import { saveNow } from "@/game/state/sync";

// Owns the entire galaxy-view story-trigger surface so adding a new
// auto-trigger kind doesn't reach into GameCanvas.
//
// Why this hook exists, audio-side: the engine in `@/game/audio/story` is a
// single shared instance. When multiple effects each called `storyAudio.stop`
// in their cleanups, a cleanup firing because of an unrelated dep change
// (e.g. activeStory flipping to a cinematic) could silence audio that
// another effect had just started. Centralising the lifecycle here lets
// each scheduler claim ownership locally and only stop audio it actually
// started.
//
// `on-shop-open` lives in ShopUI.tsx — it's not a galaxy-view concern.

export type ActiveStory = {
  readonly id: StoryId;
  readonly firstSeen: boolean;
  readonly fromLog: boolean;
};

const SELECT_DELAY_MS = 2000;

export interface UseStoryTriggersParams {
  readonly enabled: boolean;
  readonly saveLoaded: boolean;
  readonly currentSolarSystemId: SolarSystemId;
  readonly unlockedPlanets: readonly MissionId[];
  readonly completedMissions: readonly MissionId[];
  readonly seenStoryEntries: readonly StoryId[];
}

export interface UseStoryTriggersResult {
  readonly activeStory: ActiveStory | null;
  readonly setActiveStory: (story: ActiveStory | null) => void;
  readonly storyListOpen: boolean;
  readonly setStoryListOpen: (open: boolean) => void;
  readonly handleMissionSelect: (missionId: MissionId) => void;
  readonly handleMarkStorySeen: () => void;
  readonly handleReplayStory: (id: StoryId) => void;
  readonly cancelPendingBriefing: () => void;
}

export function useStoryTriggers({
  enabled,
  saveLoaded,
  currentSolarSystemId,
  unlockedPlanets,
  completedMissions,
  seenStoryEntries
}: UseStoryTriggersParams): UseStoryTriggersResult {
  const [activeStory, setActiveStory] = useState<ActiveStory | null>(null);
  const [storyListOpen, setStoryListOpen] = useState(false);

  // In-session fire-once guard: even if seenStoryEntries lags via a stale
  // selector read (e.g. cloud sync racing local mark-seen), an entry never
  // fires twice in the same component lifetime.
  const autoFiredRef = useRef<Set<StoryId>>(new Set());

  // Read seenStoryEntries via ref so the cleared-idle effect's first-fire
  // mark-seen doesn't bounce its own dep array and reset the initial-delay
  // timer.
  const seenStoryEntriesRef = useRef(seenStoryEntries);
  seenStoryEntriesRef.current = seenStoryEntries;

  // first-time auto-fire — the canonical opener. Once the cloud save loads
  // we pop the first unseen `first-time` entry. Gated on !activeStory so
  // we never overlap a popup mid-combat or mid-cinematic.
  useEffect(() => {
    if (!saveLoaded || !enabled || activeStory) return;
    const next = selectFirstTimeEntry(new Set(seenStoryEntries), autoFiredRef.current);
    if (next) {
      autoFiredRef.current.add(next.id);
      setActiveStory({ id: next.id, firstSeen: true, fromLog: false });
    }
  }, [saveLoaded, enabled, seenStoryEntries, activeStory]);

  // on-system-enter auto-fire — fires the chapter cinematic the first time
  // the player's currentSolarSystemId becomes the entry's systemId. Modal
  // entries route through setActiveStory; overlay entries play voice
  // directly over the menu bed (parity with cleared-idle).
  useEffect(() => {
    if (!enabled || !saveLoaded || activeStory || storyListOpen) return;
    const next = selectOnSystemEnterEntry(
      currentSolarSystemId,
      new Set(seenStoryEntries),
      autoFiredRef.current
    );
    if (!next) return;
    autoFiredRef.current.add(next.id);
    if (next.mode === "modal") {
      setActiveStory({ id: next.id, firstSeen: true, fromLog: false });
    } else {
      storyAudio.play({
        musicSrc: next.musicTrack,
        voiceSrc: next.voiceTrack,
        voiceDelayMs: next.voiceDelayMs
      });
      markStorySeen(next.id);
      void saveNow();
    }
  }, [enabled, saveLoaded, activeStory, storyListOpen, currentSolarSystemId, seenStoryEntries]);

  const handleMarkStorySeen = useCallback(() => {
    if (!activeStory) return;
    markStorySeen(activeStory.id);
    void saveNow();
  }, [activeStory]);

  const handleReplayStory = useCallback((id: StoryId) => {
    setStoryListOpen(false);
    setActiveStory({ id, firstSeen: false, fromLog: true });
  }, []);

  // Story-log music context: while browsing the Story log OR replaying
  // any entry from it, the dedicated bed plays continuously. Opening a
  // replay does NOT restart the music.
  const inStoryLogContext = storyListOpen || (activeStory?.fromLog ?? false);
  useEffect(() => {
    if (inStoryLogContext) {
      storyLogAudio.play();
    } else {
      storyLogAudio.stop();
    }
  }, [inStoryLogContext]);

  // on-mission-select overlay briefings. SELECT_DELAY_MS lets the player
  // shuffle through cards without firing audio they don't want. Each new
  // selection cancels the previous pending or playing voice.
  const pendingPlayTimer = useRef<number | null>(null);
  const cancelPendingBriefing = useCallback(() => {
    if (pendingPlayTimer.current !== null) {
      clearTimeout(pendingPlayTimer.current);
      pendingPlayTimer.current = null;
    }
    storyAudio.stop();
  }, []);

  const handleMissionSelect = useCallback(
    (missionId: MissionId) => {
      if (!saveLoaded || !enabled) return;
      cancelPendingBriefing();
      if (!unlockedPlanets.includes(missionId)) return;
      const entry = selectOnMissionSelectEntry(missionId);
      if (!entry) return;

      if (entry.mode === "overlay") {
        pendingPlayTimer.current = window.setTimeout(() => {
          pendingPlayTimer.current = null;
          storyAudio.play({
            musicSrc: entry.musicTrack,
            voiceSrc: entry.voiceTrack,
            voiceDelayMs: 0
          });
          if (!seenStoryEntriesRef.current.includes(entry.id)) {
            markStorySeen(entry.id);
            void saveNow();
          }
        }, SELECT_DELAY_MS);
      } else if (
        !seenStoryEntries.includes(entry.id) &&
        !autoFiredRef.current.has(entry.id)
      ) {
        autoFiredRef.current.add(entry.id);
        setActiveStory({ id: entry.id, firstSeen: true, fromLog: false });
      }
    },
    [saveLoaded, enabled, seenStoryEntries, unlockedPlanets, cancelPendingBriefing]
  );

  // on-system-cleared-idle voice — fires repeatedly while the player idles
  // in a fully-cleared system. The bi-phase ref pattern (initial delay then
  // steady cadence) is preserved. The local `weStartedAudio` flag is the
  // critical fix: cleanup only stops storyAudio if THIS effect run actually
  // started a fire. Without it, a cleanup firing because activeStory flipped
  // truthy (e.g. a chapter cinematic just opened) would silence the
  // cinematic's audio mid-fade-in.
  useEffect(() => {
    if (!enabled || !saveLoaded || storyListOpen || activeStory) return;
    const ready = selectReadyClearedIdleEntries(
      currentSolarSystemId,
      new Set(completedMissions)
    );
    if (ready.length === 0) return;

    let weStartedAudio = false;
    const fire = (entry: (typeof ready)[number]) => {
      storyAudio.play({
        musicSrc: entry.musicTrack,
        voiceSrc: entry.voiceTrack,
        voiceDelayMs: 0
      });
      weStartedAudio = true;
      if (!seenStoryEntriesRef.current.includes(entry.id)) {
        markStorySeen(entry.id);
        void saveNow();
      }
    };

    const timeoutIds: number[] = [];
    const intervalIds: number[] = [];
    for (const entry of ready) {
      const trigger = entry.autoTrigger;
      if (trigger?.kind !== "on-system-cleared-idle") continue;
      const initialId = window.setTimeout(() => {
        fire(entry);
        const repeatId = window.setInterval(() => fire(entry), trigger.intervalMs);
        intervalIds.push(repeatId);
      }, trigger.initialDelayMs);
      timeoutIds.push(initialId);
    }

    return () => {
      for (const id of timeoutIds) clearTimeout(id);
      for (const id of intervalIds) clearInterval(id);
      if (weStartedAudio) storyAudio.stop();
    };
  }, [enabled, saveLoaded, storyListOpen, activeStory, currentSolarSystemId, completedMissions]);

  // Final cleanup so a navigation away cancels any briefing in flight.
  useEffect(() => {
    return () => {
      cancelPendingBriefing();
    };
  }, [cancelPendingBriefing]);

  return {
    activeStory,
    setActiveStory,
    storyListOpen,
    setStoryListOpen,
    handleMissionSelect,
    handleMarkStorySeen,
    handleReplayStory,
    cancelPendingBriefing
  };
}
