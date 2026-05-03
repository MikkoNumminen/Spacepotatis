// Pure data accessors for weapons.json. Separated from WeaponSystem so the
// React shop can read weapon metadata without pulling Phaser into an SSG
// bundle (Phaser touches `window` at import time).
//
// JSON shape is validated by `WeaponsFileSchema` in [src/lib/schemas/weapons.ts]
// via the CI test in [src/game/data/__tests__/jsonSchemaValidation.test.ts] —
// not at module load. Keeps Zod out of this file's import graph (~98 kB
// per-route bundle saving).
import weaponsData from "./weapons.json";
import type { WeaponDefinition, WeaponId } from "@/types/game";

const ALL_WEAPONS: readonly WeaponDefinition[] =
  (weaponsData as { weapons: readonly WeaponDefinition[] }).weapons;

// Canonical ID list. Lives next to the data so callers needing membership
// checks (persistence helpers, etc.) can import a Zod-free const — the
// equivalent in src/lib/schemas/save.ts is `WEAPON_IDS` used to build the
// `z.enum`. Keep the two lists in lockstep; the save-schema test enforces
// structural equality.
export const WEAPON_IDS = [
  "rapid-fire",
  "spread-shot",
  "heavy-cannon",
  "corsair-missile",
  "grapeshot-cannon",
  "boarding-snare"
] as const satisfies readonly WeaponId[];

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
