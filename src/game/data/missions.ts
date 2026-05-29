// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.
//
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
import type { MissionDefinition, MissionId } from "@/types";
import {
  buildLiveIntegrityData,
  runDataIntegrityCheck
} from "./integrityCheck";

// AI-NOTE: deliberate `as` cast — soundness enforced by jsonSchemaValidation.test.ts.
// Re-adding Zod.parse at module load cost ~98 kB first-load JS (PR history).
// `as unknown as` because tsc widens fixed-tuple JSON literals
// (`planetStyle.featureColor: [r, g, b]`, `craterSizeRange: [min, max]`) to
// `number[]`, and a direct cast to the tuple-typed interface no longer
// satisfies the overlap heuristic. Soundness check stays in the CI drift
// gate via MissionsFileSchema.
const ALL_MISSIONS: readonly MissionDefinition[] =
  (missionsData as unknown as { missions: readonly MissionDefinition[] }).missions;

const MISSIONS: ReadonlyMap<MissionId, MissionDefinition> = new Map(
  ALL_MISSIONS.map((m) => [m.id, m])
);

const COMBAT_MISSIONS: readonly MissionDefinition[] = ALL_MISSIONS.filter(
  (m) => m.kind === "mission"
);

/**
 * Returns every mission definition in catalog order — both combat missions
 * AND shop/hub planets. Use {@link getCombatMissions} when you need only
 * launchable missions.
 *
 * @stable Part of `content` public API.
 */
export function getAllMissions(): readonly MissionDefinition[] {
  return ALL_MISSIONS;
}

/**
 * Resolves a mission id to its full definition.
 *
 * @param id - One of the kebab-case mission ids from `missions.json`.
 * @returns The matching {@link MissionDefinition}.
 * @throws Error if `id` is not in the loaded catalog. Saves carrying a
 *   removed mission id are sanitized by the persistence layer (see
 *   `src/game/state/persistence/`).
 *
 * @stable Part of `content` public API.
 */
export function getMission(id: MissionId): MissionDefinition {
  const m = MISSIONS.get(id);
  if (!m) throw new Error(`Unknown mission: ${id}`);
  return m;
}

/**
 * Combat-only subset. Used wherever the UI lists missions the player can
 * actually launch (mission picker, leaderboard) — excludes shop/hub
 * planets (`kind !== "mission"`).
 *
 * @stable Part of `content` public API.
 */
export function getCombatMissions(): readonly MissionDefinition[] {
  return COMBAT_MISSIONS;
}

// INVARIANT: integrityCheck fires at module load via missions.ts. Do not
// lazy-load this without updating saveValidation.ts — without the boot
// trigger, dangling cross-references only surface at runtime via the
// silent try/catch in saveValidation.ts:108.
//
// missions.ts is the most universally-imported data accessor (12+ call
// sites today), so wiring the check here means every consumer of any
// mission/wave/loot data triggers it before they read. The check is
// parameterized — we pass our already-parsed missions list to avoid a
// load-time cycle through ./missions. Throws on the first dangling
// cross-ref with a useful path.
runDataIntegrityCheck(buildLiveIntegrityData(ALL_MISSIONS));
