import type {
  MissionDefinition,
  SolarSystemId
} from "@/types/game";

export interface QuestBuckets {
  readonly suggested: MissionDefinition | null;
  readonly available: readonly MissionDefinition[];
  readonly locked: readonly MissionDefinition[];
  readonly cleared: readonly MissionDefinition[];
  readonly shop: MissionDefinition | null;
}

// Pure bucketing helper. Suggested = first non-shop mission that's unlocked
// AND not yet cleared. Available = the rest of the unlocked-uncleared set.
// Order within buckets follows the input order, which for missions.json is
// already sorted by intended difficulty/progression.
export function bucketMissions(
  missions: readonly MissionDefinition[],
  systemId: SolarSystemId,
  unlocked: readonly string[],
  completed: readonly string[]
): QuestBuckets {
  // Scenery bodies (e.g. a backdrop planet) never appear in any bucket — they
  // exist only as 3D scene atmosphere and have no docking action.
  const inSystem = missions.filter(
    (m) => m.solarSystemId === systemId && m.kind !== "scenery"
  );
  const shop = inSystem.find((m) => m.kind === "shop") ?? null;
  const combat = inSystem.filter((m) => m.kind === "mission");

  const playable = combat.filter(
    (m) => unlocked.includes(m.id) && !completed.includes(m.id)
  );
  const suggested = playable[0] ?? null;
  const available = playable.slice(1);
  const locked = combat.filter((m) => !unlocked.includes(m.id));
  const cleared = combat.filter((m) => completed.includes(m.id));

  return { suggested, available, locked, cleared, shop };
}
