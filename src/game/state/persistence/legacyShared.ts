import type { WeaponId } from "@/types/game";
import {
  MAX_WEAPON_SLOTS,
  type WeaponInstance
} from "../ShipConfig";
import {
  clampLevel,
  isKnownWeapon,
  sanitizeAugmentList
} from "./helpers";
import type { LegacyShipSnapshot, SlotsAndInventory } from "./types";

// Synthesize one WeaponInstance per unique id in unlockedWeapons, populated
// from weaponLevels / weaponAugments. Dedupes by first occurrence so the
// instance pool reflects "one per unlocked id" — that's the legacy invariant.
function buildLegacyInstancePool(raw: LegacyShipSnapshot): WeaponInstance[] {
  const pool: WeaponInstance[] = [];
  const seen = new Set<WeaponId>();
  if (!Array.isArray(raw.unlockedWeapons)) return pool;
  for (const id of raw.unlockedWeapons) {
    if (!isKnownWeapon(id) || seen.has(id)) continue;
    seen.add(id);
    const level = clampLevel(raw.weaponLevels?.[id]);
    const augments = sanitizeAugmentList(raw.weaponAugments?.[id]);
    pool.push({ id, level, augments });
  }
  return pool;
}

// Assigns slot ids to instances pulled from a pool. The first slot
// referencing an id wins; subsequent slot references resolve to null
// because the legacy data only has one instance per id.
export function assignSlotsFromPool(
  slotIds: readonly (string | null)[],
  raw: LegacyShipSnapshot
): SlotsAndInventory {
  const instancePool = buildLegacyInstancePool(raw);

  const slots: (WeaponInstance | null)[] = [];
  const limit = Math.min(slotIds.length, MAX_WEAPON_SLOTS);
  for (let i = 0; i < limit; i++) {
    const id = slotIds[i];
    if (id && isKnownWeapon(id)) {
      const idx = instancePool.findIndex((inst) => inst.id === id);
      if (idx >= 0) {
        const taken = instancePool[idx];
        instancePool.splice(idx, 1);
        slots.push(taken ?? null);
        continue;
      }
    }
    slots.push(null);
  }

  // Always at least one slot.
  if (slots.length === 0) slots.push(null);

  return { slots, inventory: instancePool };
}
