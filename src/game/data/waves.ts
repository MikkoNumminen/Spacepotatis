// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.
//
// Pure data accessor for waves.json. Lives next to the JSON so non-Phaser
// callers (tests, future tooling) can read wave definitions without dragging
// `phaser` into their bundle.
//
// JSON shape is validated by `WavesFileSchema` in [src/lib/schemas/waves.ts]
// via the CI test in [src/game/data/__tests__/jsonSchemaValidation.test.ts] —
// not at module load. Keeps Zod out of this file's import graph (~98 kB
// per-route bundle saving).
import wavesData from "./waves.json";
import type { MissionId, MissionWaves, WaveDefinition } from "@/types/game";

// AI-NOTE: deliberate `as` cast — soundness enforced by jsonSchemaValidation.test.ts.
// Re-adding Zod.parse at module load cost ~98 kB first-load JS (PR history).
const ALL_MISSION_WAVES: readonly MissionWaves[] =
  (wavesData as { missions: readonly MissionWaves[] }).missions;

const WAVES: ReadonlyMap<MissionId, MissionWaves> = new Map(
  ALL_MISSION_WAVES.map((m) => [m.missionId, m])
);

/**
 * Returns the wave list for a specific mission. Returns the empty list
 * (NOT `undefined`) for unknown missions — combat scenes use this directly
 * and want a benign empty fallback.
 *
 * @stable Part of `content` public API.
 */
export function getWavesForMission(missionId: MissionId): readonly WaveDefinition[] {
  return WAVES.get(missionId)?.waves ?? [];
}

/**
 * Returns every mission's wave list, keyed by missionId. Used by the
 * integrity check and any future content-tooling.
 *
 * @stable Part of `content` public API.
 */
export function getAllMissionWaves(): readonly MissionWaves[] {
  return ALL_MISSION_WAVES;
}
