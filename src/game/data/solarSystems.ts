// Pure data accessor for solarSystems.json. Mirrors weapons.ts/enemies.ts.
// Lives next to the JSON so non-Three callers (tests, React HUD) can read
// solar-system metadata without dragging Three.js into their bundle.
import solarSystemsData from "./solarSystems.json";
import type { SolarSystemDefinition, SolarSystemId } from "@/types/game";

const SYSTEMS: ReadonlyMap<SolarSystemId, SolarSystemDefinition> = new Map(
  (solarSystemsData.systems as readonly SolarSystemDefinition[]).map((s) => [s.id, s])
);

export function getSolarSystem(id: SolarSystemId): SolarSystemDefinition {
  const sys = SYSTEMS.get(id);
  if (!sys) throw new Error(`Unknown solar system: ${id}`);
  return sys;
}

export function getAllSolarSystems(): readonly SolarSystemDefinition[] {
  return solarSystemsData.systems as readonly SolarSystemDefinition[];
}
