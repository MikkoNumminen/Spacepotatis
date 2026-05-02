// Pure data accessor for solarSystems.json. Mirrors weapons.ts/enemies.ts.
// Lives next to the JSON so non-Three callers (tests, React HUD) can read
// solar-system metadata without dragging Three.js into their bundle.
//
// JSON shape is validated by `SolarSystemsFileSchema` in
// [src/lib/schemas/solarSystems.ts] via the CI test in
// [src/game/data/__tests__/jsonSchemaValidation.test.ts] — not at module load.
// Keeps Zod out of this file's import graph (~98 kB per-route bundle saving).
import solarSystemsData from "./solarSystems.json";
import type { SolarSystemDefinition, SolarSystemId } from "@/types/game";

const ALL_SYSTEMS: readonly SolarSystemDefinition[] =
  (solarSystemsData as { systems: readonly SolarSystemDefinition[] }).systems;

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
