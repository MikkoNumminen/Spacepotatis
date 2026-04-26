// Pure data accessor for missions.json. Mirrors the
// weapons.ts/enemies.ts/waves.ts/solarSystems.ts pattern so callers don't
// repeat `missionsData.missions as readonly MissionDefinition[]` casts and
// inline `kind === "mission"` filters at every site.
import missionsData from "./missions.json";
import type { MissionDefinition, MissionId } from "@/types/game";

const ALL_MISSIONS: readonly MissionDefinition[] =
  missionsData.missions as readonly MissionDefinition[];

const MISSIONS: ReadonlyMap<MissionId, MissionDefinition> = new Map(
  ALL_MISSIONS.map((m) => [m.id, m])
);

const COMBAT_MISSIONS: readonly MissionDefinition[] = ALL_MISSIONS.filter(
  (m) => m.kind === "mission"
);

export function getAllMissions(): readonly MissionDefinition[] {
  return ALL_MISSIONS;
}

export function getMission(id: MissionId): MissionDefinition {
  const m = MISSIONS.get(id);
  if (!m) throw new Error(`Unknown mission: ${id}`);
  return m;
}

// Combat-only subset. Used wherever the UI lists missions the player can
// actually launch (mission picker, leaderboard) — excludes shop/hub planets.
export function getCombatMissions(): readonly MissionDefinition[] {
  return COMBAT_MISSIONS;
}
