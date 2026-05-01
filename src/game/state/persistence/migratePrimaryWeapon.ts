import { assignSlotsFromPool } from "./legacyShared";
import type { LegacyShipSnapshot, SlotsAndInventory } from "./types";

// Pre-loadout primary-weapon shape: oldest, just a `primaryWeapon` field.
// Treat slots as `[primaryWeapon]`; otherwise as legacy id-array.
export function migratePrimaryWeapon(raw: LegacyShipSnapshot): SlotsAndInventory {
  const slotIds: (string | null)[] = [
    typeof raw.primaryWeapon === "string" ? raw.primaryWeapon : null
  ];
  return assignSlotsFromPool(slotIds, raw);
}
