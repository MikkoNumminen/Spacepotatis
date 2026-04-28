// Mission first-clear rewards. Replays still pay out kill credits as
// usual, but only the FIRST completion of a given mission rolls a bonus
// from the system's loot pool (see src/game/data/lootPools.ts).
//
// Rolls are bounded to items the game already provides through the shop
// economy — no bespoke loot. The pool gates by solar system so warping
// forward keeps offering meaningful drops.

import type {
  AugmentId,
  SolarSystemId,
  WeaponId
} from "@/types/game";
import { getAugment } from "@/game/data/augments";
import { getLootPool, type UpgradeField } from "@/game/data/lootPools";
import { getWeapon } from "@/game/data/weapons";
import { addCredits } from "./stateCore";
import { MAX_LEVEL, ownsAnyOfType, type ShipConfig } from "./ShipConfig";
import {
  grantArmorUpgrade,
  grantAugment,
  grantReactorCapacityUpgrade,
  grantReactorRechargeUpgrade,
  grantShieldUpgrade,
  grantWeapon
} from "./shipMutators";

export type MissionReward =
  | { readonly kind: "weapon"; readonly id: WeaponId }
  | { readonly kind: "augment"; readonly id: AugmentId }
  | { readonly kind: "upgrade"; readonly field: UpgradeField }
  | { readonly kind: "credits"; readonly amount: number };

export function rollMissionReward(
  systemId: SolarSystemId,
  ship: ShipConfig,
  rng: () => number = Math.random
): MissionReward {
  const pool = getLootPool(systemId);
  const candidates: MissionReward[] = [];

  const unowned = pool.weapons.filter((id) => !ownsAnyOfType(ship, id));
  if (unowned.length > 0) {
    candidates.push({ kind: "weapon", id: pickRandom(unowned, rng) });
  }

  if (pool.augments.length > 0) {
    candidates.push({ kind: "augment", id: pickRandom(pool.augments, rng) });
  }

  const availableUpgrades = pool.upgrades.filter((field) => !isUpgradeMaxed(ship, field));
  if (availableUpgrades.length > 0) {
    candidates.push({ kind: "upgrade", field: pickRandom(availableUpgrades, rng) });
  }

  // Credits fallback is always present so the candidate list is never empty —
  // the player at least gets something even if every other category is full.
  const span = pool.credits.max - pool.credits.min + 1;
  candidates.push({
    kind: "credits",
    amount: pool.credits.min + Math.floor(rng() * span)
  });

  return candidates[Math.floor(rng() * candidates.length)] as MissionReward;
}

export function applyMissionReward(reward: MissionReward): void {
  switch (reward.kind) {
    case "weapon":
      grantWeapon(reward.id);
      return;
    case "augment":
      grantAugment(reward.id);
      return;
    case "upgrade":
      applyUpgrade(reward.field);
      return;
    case "credits":
      addCredits(reward.amount);
      return;
  }
}

export function describeMissionReward(reward: MissionReward): string {
  switch (reward.kind) {
    case "weapon":
      return `New weapon · ${getWeapon(reward.id).name}`;
    case "augment":
      return `New augment · ${getAugment(reward.id).name}`;
    case "upgrade":
      return `${UPGRADE_LABELS[reward.field]} +1`;
    case "credits":
      return `Bonus ¢ ${reward.amount}`;
  }
}

function pickRandom<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

function isUpgradeMaxed(ship: ShipConfig, field: UpgradeField): boolean {
  switch (field) {
    case "shield":
      return ship.shieldLevel >= MAX_LEVEL;
    case "armor":
      return ship.armorLevel >= MAX_LEVEL;
    case "reactor-capacity":
      return ship.reactor.capacityLevel >= MAX_LEVEL;
    case "reactor-recharge":
      return ship.reactor.rechargeLevel >= MAX_LEVEL;
  }
}

function applyUpgrade(field: UpgradeField): void {
  switch (field) {
    case "shield":
      grantShieldUpgrade();
      return;
    case "armor":
      grantArmorUpgrade();
      return;
    case "reactor-capacity":
      grantReactorCapacityUpgrade();
      return;
    case "reactor-recharge":
      grantReactorRechargeUpgrade();
      return;
  }
}

const UPGRADE_LABELS: Record<UpgradeField, string> = {
  shield: "Shield",
  armor: "Armor",
  "reactor-capacity": "Reactor capacity",
  "reactor-recharge": "Reactor recharge"
};
