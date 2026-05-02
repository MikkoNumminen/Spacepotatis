// Pure data accessor for missions.json. Mirrors the
// weapons.ts/enemies.ts/waves.ts/solarSystems.ts pattern so callers don't
// repeat `missionsData.missions as readonly MissionDefinition[]` casts and
// inline `kind === "mission"` filters at every site.
//
// missions.json is parsed through MissionsFileSchema at module load so a
// drifted entry (missing field, wrong type, unknown enum) throws here with a
// helpful Zod path rather than leaking a NaN/undefined into orbit math at
// runtime. The other JSON-backed accessors (weapons / enemies / waves /
// solarSystems) still rely on plain `as` casts; if/when one of those drifts
// in the wild, they should grow the same boot-parse pattern. Today this is
// the only data file singled out by the audit follow-up.
import missionsData from "./missions.json";
import type { MissionDefinition, MissionId } from "@/types/game";
import { MissionsFileSchema } from "@/lib/schemas/missions";
import {
  buildLiveIntegrityData,
  runDataIntegrityCheck
} from "./integrityCheck";

const PARSED = MissionsFileSchema.parse(missionsData);
const ALL_MISSIONS: readonly MissionDefinition[] = PARSED.missions;

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

// Run the cross-reference drift check at boot. missions.ts is the most
// universally-imported data accessor (12+ call sites today), so wiring
// the check here means every consumer of any mission/wave/loot data
// triggers it before they read. The check is parameterized — we pass
// our already-parsed missions list to avoid a load-time cycle through
// ./missions. Throws on the first dangling cross-ref with a useful path.
runDataIntegrityCheck(buildLiveIntegrityData(ALL_MISSIONS));
