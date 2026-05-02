// Pure data accessor for missions.json. Mirrors the
// weapons.ts/enemies.ts/waves.ts/solarSystems.ts pattern so callers don't
// repeat `missionsData.missions as readonly MissionDefinition[]` casts and
// inline `kind === "mission"` filters at every site.
//
// JSON shape is validated by `MissionsFileSchema` in [src/lib/schemas/missions.ts]
// — the runtime parse runs in CI via [src/game/data/__tests__/jsonSchemaValidation.test.ts],
// not at module load. Keeping Zod out of this file's import graph saves
// ~98 kB on every route's first-load JS (every page touches game data via
// useGameState/MenuMusic). Tests run on every push and gate merges, so a
// drifted JSON edit fails CI before it reaches users.
import missionsData from "./missions.json";
import type { MissionDefinition, MissionId } from "@/types/game";
import {
  buildLiveIntegrityData,
  runDataIntegrityCheck
} from "./integrityCheck";

const ALL_MISSIONS: readonly MissionDefinition[] =
  (missionsData as { missions: readonly MissionDefinition[] }).missions;

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
