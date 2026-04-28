import type { ShipConfig, WeaponInstance, WeaponPosition } from "@/game/state/ShipConfig";
import type { WeaponDefinition } from "@/types/game";
import { getWeapon } from "@/game/data/weapons";
import { slotLabel } from "./SlotGrid";

export interface EquippedEntry {
  readonly position: { readonly kind: "slot"; readonly index: number };
  readonly instance: WeaponInstance;
  readonly weapon: WeaponDefinition;
  readonly key: string;
  readonly slotBadge: string;
}

export interface InventoryEntry {
  readonly position: { readonly kind: "inventory"; readonly index: number };
  readonly instance: WeaponInstance;
  readonly weapon: WeaponDefinition;
  readonly key: string;
}

export type WeaponEntry = EquippedEntry | InventoryEntry;

export function entryPosition(entry: WeaponEntry): WeaponPosition {
  return entry.position;
}

export function getEquippedEntries(ship: ShipConfig): EquippedEntry[] {
  const out: EquippedEntry[] = [];
  for (let i = 0; i < ship.slots.length; i++) {
    const instance = ship.slots[i];
    if (!instance) continue;
    const weapon = getWeapon(instance.id);
    out.push({
      position: { kind: "slot", index: i },
      instance,
      weapon,
      key: `equipped-${i}-${instance.id}-${instance.level}`,
      slotBadge: slotLabel(i)
    });
  }
  return out;
}

export function getInventoryEntries(ship: ShipConfig): InventoryEntry[] {
  return ship.inventory.map((instance, i) => ({
    position: { kind: "inventory", index: i },
    instance,
    weapon: getWeapon(instance.id),
    key: `inv-${i}-${instance.id}-${instance.level}`
  }));
}
