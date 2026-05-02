// Pure data accessor for waves.json. Lives next to the JSON so non-Phaser
// callers (tests, future tooling) can read wave definitions without dragging
// `phaser` into their bundle.
//
// waves.json is parsed through WavesFileSchema at module load so a drifted
// entry (missing field, wrong type, unknown enemy / mission id, xPercent
// outside [0,1]) throws here with a Zod path rather than crashing the spawn
// loop mid-mission.
import wavesData from "./waves.json";
import type { MissionId, MissionWaves, WaveDefinition } from "@/types/game";
import { WavesFileSchema } from "@/lib/schemas/waves";

const PARSED = WavesFileSchema.parse(wavesData);
const ALL_MISSION_WAVES: readonly MissionWaves[] = PARSED.missions;

const WAVES: ReadonlyMap<MissionId, MissionWaves> = new Map(
  ALL_MISSION_WAVES.map((m) => [m.missionId, m])
);

export function getWavesForMission(missionId: MissionId): readonly WaveDefinition[] {
  return WAVES.get(missionId)?.waves ?? [];
}

export function getAllMissionWaves(): readonly MissionWaves[] {
  return ALL_MISSION_WAVES;
}
