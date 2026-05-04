// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.
//
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

// AI-NOTE: deliberate `as` cast — soundness enforced by jsonSchemaValidation.test.ts.
// Re-adding Zod.parse at module load cost ~98 kB first-load JS (PR history).
const ALL_SYSTEMS: readonly SolarSystemDefinition[] =
  (solarSystemsData as { systems: readonly SolarSystemDefinition[] }).systems;

const SYSTEMS: ReadonlyMap<SolarSystemId, SolarSystemDefinition> = new Map(
  ALL_SYSTEMS.map((s) => [s.id, s])
);

/**
 * Resolves a solar-system id to its full definition.
 *
 * @param id - One of the kebab-case system ids from `solarSystems.json`.
 * @returns The matching {@link SolarSystemDefinition}.
 * @throws Error if `id` is not in the loaded catalog. The integrity check
 *   covers known cross-references at boot, so this throw should only fire
 *   for a stray id passed by a fresh caller.
 *
 * @stable Part of `content` public API.
 */
export function getSolarSystem(id: SolarSystemId): SolarSystemDefinition {
  const sys = SYSTEMS.get(id);
  if (!sys) throw new Error(`Unknown solar system: ${id}`);
  return sys;
}

/**
 * Returns every solar-system definition in catalog order.
 *
 * @stable Part of `content` public API.
 */
export function getAllSolarSystems(): readonly SolarSystemDefinition[] {
  return ALL_SYSTEMS;
}
