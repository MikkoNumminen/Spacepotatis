"use client";

import type { MissionId, SolarSystemId } from "@/types/game";
import { getAllMissions } from "@/game/data";
import { playUiCue } from "./uiCues";

// Cleared-state Grandma cues. Two one-shot voice clips that fire when a
// mission victory flips the player's progress to a cleared boundary:
//
//   ui_system_cleared.mp3      — every mission in the CURRENT solar system done
//   ui_everything_cleared.mp3  — every mission in every UNLOCKED system done
//
// The two are mutually exclusive: when "everything cleared" fires it
// suppresses the system-cleared cue, so the player never hears two voices
// stacked on top of each other.
//
// Persistence for the once-per-device "everything cleared" semantics lives
// in localStorage rather than on StateSnapshot. The cue is a player-feel
// signal, not gameplay state — losing it across devices is acceptable, and
// the localStorage approach avoids a save-roundtrip-audit + DB migration
// for one boolean. If the player later completes a mission while NOT in
// the all-cleared state, the flag re-arms so the cue fires again when
// they next reach all-cleared (post-new-content scenario).
//
// Distinct from the looping `on-system-cleared-idle` storyTrigger overlay
// (handled in useStoryTriggers.ts) — that loop plays a longer narration
// every ~30s while idling in a cleared system. These cues fire ONCE at
// the moment of clearing.

const EVERYTHING_CLEARED_KEY = "spacepotatis:ui_everything_cleared_fired_v1";

interface Input {
  readonly justCompletedMissionId: MissionId;
  readonly completedMissions: readonly MissionId[];
  readonly currentSolarSystemId: SolarSystemId;
  readonly unlockedSolarSystems: readonly SolarSystemId[];
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readFiredFlag(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return storage.getItem(EVERYTHING_CLEARED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeFiredFlag(value: boolean): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (value) storage.setItem(EVERYTHING_CLEARED_KEY, "1");
    else storage.removeItem(EVERYTHING_CLEARED_KEY);
  } catch {
    // Quota / private-mode: silently drop. Worst case the cue plays an extra
    // time on the next visit, which is an acceptable degradation.
  }
}

/**
 * Decide whether to play `systemCleared` or `everythingCleared` after a
 * mission victory. At most one cue fires per call.
 *
 * Re-arming: if the player's post-victory state is NOT all-cleared but the
 * "everything cleared" flag is set, drop the flag so a future return to
 * all-cleared (e.g. after new content ships) plays the cue again.
 */
export function maybePlayClearedCue(input: Input): void {
  const {
    justCompletedMissionId,
    completedMissions,
    currentSolarSystemId,
    unlockedSolarSystems
  } = input;

  const nextCompleted = new Set<MissionId>([...completedMissions, justCompletedMissionId]);
  const allMissions = getAllMissions().filter((m) => m.kind === "mission");

  const systemMissions = allMissions.filter((m) => m.solarSystemId === currentSolarSystemId);
  const systemNowCleared =
    systemMissions.length > 0 && systemMissions.every((m) => nextCompleted.has(m.id));

  // "Available content" = missions in unlocked systems. Locked systems'
  // missions can't be cleared yet anyway, so this matches the wording
  // "they're cooking up more, have a sit".
  const unlockedSet = new Set<SolarSystemId>(unlockedSolarSystems);
  const availableMissions = allMissions.filter((m) => unlockedSet.has(m.solarSystemId));
  const everythingNowCleared =
    availableMissions.length > 0 && availableMissions.every((m) => nextCompleted.has(m.id));

  const alreadyFired = readFiredFlag();

  if (everythingNowCleared && !alreadyFired) {
    playUiCue("everythingCleared");
    writeFiredFlag(true);
    return;
  }

  // Re-arm: if we're back below all-cleared (e.g. new content shipped),
  // drop the flag so the next return to all-cleared plays the cue.
  if (!everythingNowCleared && alreadyFired) {
    writeFiredFlag(false);
  }

  // System-cleared fires ONLY when everything-cleared didn't. Voice-
  // stacking on the same victory would be confusing — the bigger event
  // wins. If everything was already cleared and the flag was set, the
  // current victory isn't the moment that flipped it, so neither cue
  // fires (no-op).
  if (systemNowCleared && !everythingNowCleared) {
    playUiCue("systemCleared");
  }
}
