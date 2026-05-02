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

const ALL_MISSION_WAVES: readonly MissionWaves[] =
  (wavesData as { missions: readonly MissionWaves[] }).missions;

const WAVES: ReadonlyMap<MissionId, MissionWaves> = new Map(
  ALL_MISSION_WAVES.map((m) => [m.missionId, m])
);

export function getWavesForMission(missionId: MissionId): readonly WaveDefinition[] {
  return WAVES.get(missionId)?.waves ?? [];
}

export function getAllMissionWaves(): readonly MissionWaves[] {
  return ALL_MISSION_WAVES;
}
