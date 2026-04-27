import {
  isWeaponEquipped,
  isWeaponUnlocked,
  type ShipConfig,
  type SlotName
} from "@/game/state/ShipConfig";
import { getAllWeapons, getWeapon } from "@/game/data/weapons";
import { SLOT_LABEL } from "./SlotGrid";
import type { WeaponListEntry } from "./WeaponList";

export function getOwnedWeapons(ship: ShipConfig) {
  return getAllWeapons().filter((w) => isWeaponUnlocked(ship, w.id));
}

export function getEquippedEntries(ship: ShipConfig): WeaponListEntry[] {
  return (Object.keys(ship.slots) as SlotName[])
    .map((slot): WeaponListEntry | null => {
      const wid = ship.slots[slot];
      if (!wid) return null;
      const weapon = getWeapon(wid);
      return { weapon, key: `equipped-${slot}-${weapon.id}`, slotBadge: SLOT_LABEL[slot] };
    })
    .filter((e): e is WeaponListEntry => e !== null);
}

export function getInventoryEntries(ship: ShipConfig): WeaponListEntry[] {
  return getOwnedWeapons(ship)
    .filter((w) => !isWeaponEquipped(ship, w.id))
    .map((weapon) => ({ weapon, key: weapon.id }));
}
