import type { AugmentId, WeaponId } from "@/types/game";
import type {
  ShipConfig,
  WeaponInstance,
  WeaponInventory,
  WeaponSlots
} from "../ShipConfig";
import type { LegacyWeaponInstanceLike } from "./helpers";

// Loose snapshot accepted by migrateShip. Covers every historical ship shape
// the persistence layer may see in a save row. Every field is optional and
// permissive (string / number rather than the union types) because untrusted
// jsonb may carry partial or garbled data — the strict cleanup happens inside
// migrateShip, not at the type boundary.
//
// Supported shapes:
//   - new instance shape: { slots: (WeaponInstance | null)[], inventory: WeaponInstance[], ... }
//   - legacy id-string slots: { slots: (WeaponId | null)[], unlockedWeapons, weaponLevels, weaponAugments, ... }
//   - four-named-slot object: { slots: { front, rear, sidekickLeft, sidekickRight }, ... }
//   - pre-loadout primaryWeapon: { primaryWeapon, ... }
export interface LegacyShipSnapshot {
  primaryWeapon?: WeaponId | string;
  slots?:
    | readonly (WeaponInstance | WeaponId | string | null | LegacyWeaponInstanceLike)[]
    | LegacyNamedSlots;
  inventory?: readonly (WeaponInstance | LegacyWeaponInstanceLike)[];
  unlockedWeapons?: readonly (WeaponId | string)[];
  weaponLevels?: Readonly<Record<string, number>>;
  weaponAugments?: Readonly<Record<string, readonly (AugmentId | string)[]>>;
  augmentInventory?: readonly (AugmentId | string)[];
  shieldLevel?: number;
  armorLevel?: number;
  reactor?: Partial<ShipConfig["reactor"]>;
}

export interface LegacyNamedSlots {
  front?: WeaponId | string | null;
  rear?: WeaponId | string | null;
  sidekickLeft?: WeaponId | string | null;
  sidekickRight?: WeaponId | string | null;
}

export interface SlotsAndInventory {
  slots: WeaponSlots;
  inventory: WeaponInventory;
}
