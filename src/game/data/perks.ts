// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.
//
// Mission-only buffs. Independent random pool from the permanent powerups
// (credit / shield / weapon). Reset every time CombatScene starts.

/**
 * Canonical kebab-case identifiers for every mission perk.
 *
 * @stable Part of `content` public API.
 */
export type PerkId = "overdrive" | "hardened" | "emp";

/**
 * Perk activation kind. `"passive"` perks fold into the firing math
 * automatically; `"active"` perks bind to a control input (CTRL today).
 *
 * @stable Part of `content` public API.
 */
export type PerkType = "passive" | "active";

/**
 * Definition of a mission-only perk. The Phaser HUD reads `textureKey` to
 * fetch the BootScene-generated icon, `tint` to color the HUD chip /
 * notification, and `hint` for the pickup-popup blurb.
 *
 * @stable Part of `content` public API.
 */
export interface PerkDef {
  readonly id: PerkId;
  readonly name: string;
  readonly type: PerkType;
  readonly textureKey: string;
  readonly tint: number;            // accent color for HUD chips and notifications
  readonly hint: string;            // short blurb for the pickup popup
}

/**
 * Every perk definition keyed by id. Iterate via {@link PERK_IDS} for a
 * stable order; index by id for direct lookup.
 *
 * @stable Part of `content` public API.
 */
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

/**
 * Canonical, ordered list of perk ids. Drift between this array and the
 * `PerkId` union is impossible because the array is `Object.keys`-derived;
 * the cast is sound because `PERKS` is fully populated for every PerkId.
 *
 * @stable Part of `content` public API.
 */
export const PERK_IDS: readonly PerkId[] = Object.keys(PERKS) as PerkId[];

/**
 * Returns a uniformly-random perk id. Used by `PerkController` when a
 * perk drop spawns. The fallback to `"overdrive"` is a TS narrowing
 * convenience — the index is always in range, but `noUncheckedIndexedAccess`
 * makes the read look fallible.
 *
 * @internal Implementation detail of the perk drop pipeline; not part of
 *   the stable public API.
 */
export function randomPerkId(): PerkId {
  const i = Math.floor(Math.random() * PERK_IDS.length);
  return PERK_IDS[i] ?? "overdrive";
}
