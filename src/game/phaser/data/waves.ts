// Pure data accessor for waves.json. Lives next to the JSON so non-Phaser
// callers (tests, future tooling) can read wave definitions without dragging
// `phaser` into their bundle.
import wavesData from "./waves.json";
import type { MissionId, MissionWaves, WaveDefinition } from "@/types/game";

const WAVES: ReadonlyMap<MissionId, MissionWaves> = new Map(
  (wavesData.missions as readonly MissionWaves[]).map((m) => [m.missionId, m])
);

export function getWavesForMission(missionId: MissionId): readonly WaveDefinition[] {
  return WAVES.get(missionId)?.waves ?? [];
}

export function getAllMissionWaves(): readonly MissionWaves[] {
  return wavesData.missions as readonly MissionWaves[];
}
