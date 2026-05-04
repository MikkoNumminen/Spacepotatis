// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.

import type { MissionId, SolarSystemId } from "@/types/game";
import { STORY_ENTRIES, type StoryEntry, type StoryId } from "@/game/data/story";
import { getAllMissions } from "@/game/data/missions";

// Pure trigger-selection helpers. The useStoryTriggers hook calls these
// inside its useEffects; tests call them directly. Keeping the logic here
// (no React, no side effects) means every "should this entry fire?"
// decision is testable without rendering anything, and adding a new
// trigger kind = add one helper + its tests.

/**
 * Picks the unique `kind: "first-time"` entry, IFF the player hasn't
 * seen it (server-persisted set) AND it hasn't already been auto-fired
 * this session. Gates the very first cold-load cinematic.
 *
 * @stable Part of `content` public API.
 */
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

/**
 * Picks an `on-system-enter` entry whose target system matches `systemId`.
 *
 * Two gating modes:
 * - Default (no `repeatable` flag): fires once ever, gated by the saved
 *   seen-set.
 * - `repeatable: true`: fires on every transition into the system,
 *   bypassing the seen-set. The hook is responsible for clearing
 *   `autoFired` on system-leave so the next entry re-arms.
 *
 * @stable Part of `content` public API.
 */
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

/**
 * Picks the `on-mission-select` entry tied to a specific mission, if any.
 * Fires every time the mission's quest card is opened — there is no
 * seen-set gate here; the entry is short briefing audio that benefits
 * from being repeatable.
 *
 * @stable Part of `content` public API.
 */
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

/**
 * Returns the `on-system-cleared-idle` entries whose target system is
 * `systemId` AND every combat mission in that system has been completed.
 * The hook then loops through them with the configured `initialDelayMs`
 * + `intervalMs`, playing one at a time while the player idles in the
 * cleared system.
 *
 * @stable Part of `content` public API.
 */
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

/**
 * Returns the `on-all-cleared-idle` entries IFF every combat mission
 * across every solar system has been completed — the "you've caught up
 * to the live content" cue.
 *
 * The hook prefers this over the per-system cleared-idle helpers when
 * both are ready, so the player doesn't get a stacked
 * `tubernovae-cluster-cleared` + `all-content-cleared` chorus.
 *
 * @stable Part of `content` public API.
 */
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
