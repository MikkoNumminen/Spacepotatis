// Pure data accessor for solarSystems.json. Mirrors weapons.ts/enemies.ts.
// Lives next to the JSON so non-Three callers (tests, React HUD) can read
// solar-system metadata without dragging Three.js into their bundle.
//
// solarSystems.json is parsed through SolarSystemsFileSchema at module load
// so a drifted entry (missing field, wrong type, empty galaxyMusicTrack)
// throws here with a Zod path rather than silently releasing the music slot
// when the audio engine sees an empty string.
import solarSystemsData from "./solarSystems.json";
import type { SolarSystemDefinition, SolarSystemId } from "@/types/game";
import { SolarSystemsFileSchema } from "@/lib/schemas/solarSystems";

const PARSED = SolarSystemsFileSchema.parse(solarSystemsData);
const ALL_SYSTEMS: readonly SolarSystemDefinition[] = PARSED.systems;

const SYSTEMS: ReadonlyMap<SolarSystemId, SolarSystemDefinition> = new Map(
  ALL_SYSTEMS.map((s) => [s.id, s])
);

export function getSolarSystem(id: SolarSystemId): SolarSystemDefinition {
  const sys = SYSTEMS.get(id);
  if (!sys) throw new Error(`Unknown solar system: ${id}`);
  return sys;
}

export function getAllSolarSystems(): readonly SolarSystemDefinition[] {
  return ALL_SYSTEMS;
}
