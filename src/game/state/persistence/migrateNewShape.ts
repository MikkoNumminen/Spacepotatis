import {
  MAX_WEAPON_SLOTS,
  newWeaponInstance,
  type WeaponInstance
} from "../ShipConfig";
import {
  buildInstance,
  isKnownWeapon,
  looksLikeInstance
} from "./helpers";
import type { LegacyShipSnapshot, SlotsAndInventory } from "./types";

// New-shape migration: slots is an array of (WeaponInstance | null), inventory
// is an array of WeaponInstance. Validate each instance; drop any with an
// unknown id (slot becomes null, inventory entry is skipped).
export function migrateNewShape(raw: LegacyShipSnapshot): SlotsAndInventory {
  const slotInputs = Array.isArray(raw.slots) ? raw.slots : [];
  const slots: (WeaponInstance | null)[] = [];
  for (let i = 0; i < Math.min(slotInputs.length, MAX_WEAPON_SLOTS); i++) {
    const entry = slotInputs[i];
    if (entry === null || entry === undefined) {
      slots.push(null);
      continue;
    }
    if (looksLikeInstance(entry)) {
      slots.push(buildInstance(entry));
      continue;
    }
    // A bare string in the new shape is treated as "id with default level
    // and no augments" — a permissive nicety so a partially-migrated row
    // doesn't lose its slot.
    if (typeof entry === "string") {
      slots.push(isKnownWeapon(entry) ? newWeaponInstance(entry) : null);
      continue;
    }
    slots.push(null);
  }
  if (slots.length === 0) slots.push(null);

  const inventoryInput = Array.isArray(raw.inventory) ? raw.inventory : [];
  const inventory: WeaponInstance[] = [];
  for (const entry of inventoryInput) {
    if (!looksLikeInstance(entry)) continue;
    const inst = buildInstance(entry);
    if (inst) inventory.push(inst);
  }

  return { slots, inventory };
}

export function looksLikeNewShape(raw: LegacyShipSnapshot): boolean {
  if (Array.isArray(raw.inventory) && raw.inventory.some(looksLikeInstance)) {
    return true;
  }
  if (Array.isArray(raw.slots) && raw.slots.some(looksLikeInstance)) {
    return true;
  }
  return false;
}
