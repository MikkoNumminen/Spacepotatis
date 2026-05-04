import type { MissionId, SolarSystemId } from "@/types/game";
import { STORY_ENTRIES, type StoryEntry, type StoryId } from "@/game/data/story";
import { getAllMissions } from "@/game/data/missions";

// Pure trigger-selection helpers. The useStoryTriggers hook calls these
// inside its useEffects; tests call them directly. Keeping the logic here
// (no React, no side effects) means every "should this entry fire?"
// decision is testable without rendering anything, and adding a new
// trigger kind = add one helper + its tests.

export function selectFirstTimeEntry(
  seen: ReadonlySet<StoryId>,
  autoFired: ReadonlySet<StoryId>
): StoryEntry | null {
  return (
    STORY_ENTRIES.find(
      (e) =>
        e.autoTrigger?.kind === "first-time" &&
        !seen.has(e.id) &&
        !autoFired.has(e.id)
    ) ?? null
  );
}

export function selectOnSystemEnterEntry(
  systemId: SolarSystemId,
  seen: ReadonlySet<StoryId>,
  autoFired: ReadonlySet<StoryId>
): StoryEntry | null {
  return (
    STORY_ENTRIES.find((e) => {
      const t = e.autoTrigger;
      if (t?.kind !== "on-system-enter") return false;
      if (t.systemId !== systemId) return false;
      if (autoFired.has(e.id)) return false;
      // Repeatable entries fire on every transition, so they bypass the
      // saved seen-set. The autoFired ref above still prevents double-fire
      // within the same residency in the system; the hook is responsible
      // for clearing the entry from autoFired when the player leaves and
      // re-enters.
      if (t.repeatable) return true;
      return !seen.has(e.id);
    }) ?? null
  );
}

export function selectOnMissionSelectEntry(
  missionId: MissionId
): StoryEntry | null {
  return (
    STORY_ENTRIES.find(
      (e) =>
        e.autoTrigger?.kind === "on-mission-select" &&
        e.autoTrigger.missionId === missionId
    ) ?? null
  );
}

export function selectReadyClearedIdleEntries(
  systemId: SolarSystemId,
  completed: ReadonlySet<MissionId>
): readonly StoryEntry[] {
  return STORY_ENTRIES.filter((e) => {
    const trigger = e.autoTrigger;
    if (trigger?.kind !== "on-system-cleared-idle") return false;
    if (trigger.systemId !== systemId) return false;
    const systemMissions = getAllMissions().filter(
      (m) => m.solarSystemId === trigger.systemId && m.kind === "mission"
    );
    return (
      systemMissions.length > 0 &&
      systemMissions.every((m) => completed.has(m.id))
    );
  });
}

// Fires when EVERY mission across EVERY system has been completed — the
// "you've caught up to the live content" cue. The hook prefers this over
// the per-system cleared-idle helpers when both are ready, so the player
// doesn't get a stacked "tubernovae-cluster-cleared" + "all-content-cleared"
// chorus.
export function selectReadyAllClearedIdleEntries(
  completed: ReadonlySet<MissionId>
): readonly StoryEntry[] {
  const allMissions = getAllMissions().filter((m) => m.kind === "mission");
  if (allMissions.length === 0) return [];
  const everythingDone = allMissions.every((m) => completed.has(m.id));
  if (!everythingDone) return [];
  return STORY_ENTRIES.filter(
    (e) => e.autoTrigger?.kind === "on-all-cleared-idle"
  );
}
