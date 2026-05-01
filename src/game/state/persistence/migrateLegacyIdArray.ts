import { DEFAULT_SHIP } from "../ShipConfig";
import { assignSlotsFromPool } from "./legacyShared";
import type { LegacyShipSnapshot, SlotsAndInventory } from "./types";

// Legacy id-array shape: slots is an array of WeaponId strings (or null) and
// the per-id state lives in unlockedWeapons + weaponLevels + weaponAugments.
// Synthesize one instance per unique unlocked id, then assign instances
// to slots by removing them from the inventory pool.
export function migrateLegacyIdArray(raw: LegacyShipSnapshot): SlotsAndInventory {
  const slotIds = extractSlotIds(raw);
  return assignSlotsFromPool(slotIds, raw);
}

function extractSlotIds(raw: LegacyShipSnapshot): (string | null)[] {
  if (Array.isArray(raw.slots)) {
    return raw.slots.map((entry) => {
      if (typeof entry === "string") return entry;
      return null;
    });
  }
  // No slots field at all — fall back to default ship layout.
  return [...DEFAULT_SHIP.slots.map((s) => (s ? s.id : null))];
}
