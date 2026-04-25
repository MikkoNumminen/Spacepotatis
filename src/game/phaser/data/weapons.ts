// Pure data accessors for weapons.json. Separated from WeaponSystem so the
// React shop can read weapon metadata without pulling Phaser into an SSG
// bundle (Phaser touches `window` at import time).
import weaponsData from "./weapons.json";
import type { WeaponDefinition, WeaponId } from "@/types/game";

const WEAPONS: ReadonlyMap<WeaponId, WeaponDefinition> = new Map(
  (weaponsData.weapons as readonly WeaponDefinition[]).map((w) => [w.id, w])
);

export function getWeapon(id: WeaponId): WeaponDefinition {
  const w = WEAPONS.get(id);
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}

export function getAllWeapons(): readonly WeaponDefinition[] {
  return weaponsData.weapons as readonly WeaponDefinition[];
}
