import {
  isWeaponEquipped,
  isWeaponUnlocked,
  type ShipConfig
} from "@/game/state/ShipConfig";
import { getAllWeapons, getWeapon } from "@/game/data/weapons";
import { slotLabel } from "./SlotGrid";
import type { WeaponListEntry } from "./WeaponList";

export function getOwnedWeapons(ship: ShipConfig) {
  return getAllWeapons().filter((w) => isWeaponUnlocked(ship, w.id));
}

export function getEquippedEntries(ship: ShipConfig): WeaponListEntry[] {
  return ship.slots
    .map((wid, slot): WeaponListEntry | null => {
      if (!wid) return null;
      const weapon = getWeapon(wid);
      return { weapon, key: `equipped-${slot}-${weapon.id}`, slotBadge: slotLabel(slot) };
    })
    .filter((e): e is WeaponListEntry => e !== null);
}

export function getInventoryEntries(ship: ShipConfig): WeaponListEntry[] {
  return getOwnedWeapons(ship)
    .filter((w) => !isWeaponEquipped(ship, w.id))
    .map((weapon) => ({ weapon, key: weapon.id }));
}
