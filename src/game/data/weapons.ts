// Pure data accessors for weapons.json. Separated from WeaponSystem so the
// React shop can read weapon metadata without pulling Phaser into an SSG
// bundle (Phaser touches `window` at import time).
//
// weapons.json is parsed through WeaponsFileSchema at module load so a
// drifted entry (missing field, wrong type, unknown enum) throws here with a
// helpful Zod path rather than feeding a NaN/undefined into the firing math
// at runtime. Mirrors the missions.ts / enemies.ts / waves.ts /
// solarSystems.ts boot-parse pattern.
import weaponsData from "./weapons.json";
import type { WeaponDefinition, WeaponId } from "@/types/game";
import { WeaponsFileSchema } from "@/lib/schemas/weapons";

const PARSED = WeaponsFileSchema.parse(weaponsData);
const ALL_WEAPONS: readonly WeaponDefinition[] = PARSED.weapons;

const WEAPONS: ReadonlyMap<WeaponId, WeaponDefinition> = new Map(
  ALL_WEAPONS.map((w) => [w.id, w])
);

export function getWeapon(id: WeaponId): WeaponDefinition {
  const w = WEAPONS.get(id);
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}

export function getAllWeapons(): readonly WeaponDefinition[] {
  return ALL_WEAPONS;
}

// Pure stat derivations — kept here so UI never recomputes them inline.
export function weaponDps(w: WeaponDefinition): number {
  return Math.round(w.damage * w.projectileCount * (1000 / w.fireRateMs));
}

export function weaponRps(w: WeaponDefinition): number {
  return Math.round((1000 / w.fireRateMs) * 10) / 10;
}
