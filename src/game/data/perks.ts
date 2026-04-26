// Mission-only buffs. Independent random pool from the permanent powerups
// (credit / shield / weapon). Reset every time CombatScene starts.

export type PerkId = "overdrive" | "hardened" | "emp";
export type PerkType = "passive" | "active";

export interface PerkDef {
  readonly id: PerkId;
  readonly name: string;
  readonly type: PerkType;
  readonly textureKey: string;
  readonly tint: number;            // accent color for HUD chips and notifications
  readonly hint: string;            // short blurb for the pickup popup
}

export const PERKS: Readonly<Record<PerkId, PerkDef>> = {
  overdrive: {
    id: "overdrive",
    name: "Overdrive",
    type: "passive",
    textureKey: "perk-overdrive",
    tint: 0xffaa33,
    hint: "+50% fire rate"
  },
  hardened: {
    id: "hardened",
    name: "Hardened Hull",
    type: "passive",
    textureKey: "perk-hardened",
    tint: 0x66aaff,
    hint: "-30% damage taken"
  },
  emp: {
    id: "emp",
    name: "EMP Pulse",
    type: "active",
    textureKey: "perk-emp",
    tint: 0xff66cc,
    hint: "CTRL: clear all enemy bullets"
  }
};

export const PERK_IDS: readonly PerkId[] = Object.keys(PERKS) as PerkId[];

export function randomPerkId(): PerkId {
  const i = Math.floor(Math.random() * PERK_IDS.length);
  return PERK_IDS[i] ?? "overdrive";
}
