import { newWeaponInstance } from "../ShipConfig";
import type { SlotsAndInventory } from "./types";

// Empty / unparseable safety net: if no slot is filled and there's nothing
// in inventory, the player would be weaponless. Drop in the starter so the
// player isn't stranded with no weapons at all.
export function seedStarterIfEmpty(result: SlotsAndInventory): SlotsAndInventory {
  if (result.slots.every((s) => s === null) && result.inventory.length === 0) {
    return {
      slots: [newWeaponInstance("rapid-fire")],
      inventory: []
    };
  }
  return result;
}
