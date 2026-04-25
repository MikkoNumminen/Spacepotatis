import type { WeaponId } from "@/types/game";

export interface ShipConfig {
  primaryWeapon: WeaponId;
  unlockedWeapons: readonly WeaponId[];
  shieldLevel: number;
  armorLevel: number;
}

export const MAX_LEVEL = 5;

const BASE_SHIELD = 40;
const BASE_ARMOR = 60;

export const DEFAULT_SHIP: ShipConfig = {
  primaryWeapon: "rapid-fire",
  unlockedWeapons: ["rapid-fire"],
  shieldLevel: 0,
  armorLevel: 0
};

export function getMaxShield(config: ShipConfig): number {
  return Math.round(BASE_SHIELD * (1 + config.shieldLevel * 0.2));
}

export function getMaxArmor(config: ShipConfig): number {
  return BASE_ARMOR + config.armorLevel * 15;
}

export function shieldUpgradeCost(level: number): number {
  return 200 * Math.pow(2, level);
}

export function armorUpgradeCost(level: number): number {
  return 300 * Math.pow(2, level);
}

export function isWeaponUnlocked(config: ShipConfig, id: WeaponId): boolean {
  return config.unlockedWeapons.includes(id);
}
