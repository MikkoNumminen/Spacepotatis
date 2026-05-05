// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.

// Inline-stat flavour copy. The actual numeric behaviour for each stat
// is computed at render time from `WeaponDefinition` + `WeaponInstance` +
// installed augments — this module is a thin presentation registry:
// id → display label + icon + body copy for the StatDetailsModal, and an
// id-to-voice-file convention for Grandma.
//
// Voice path: `/audio/stats/<id>-voice.mp3`. Missing files fail silently
// (HTMLAudioElement doesn't throw on 404), matching weapons / augments /
// upgrades.
//
// `StatId` lives in `src/types/game.ts` next to `WeaponId` / `AugmentId` /
// `UpgradeId` so non-content modules can depend on it without pulling
// the data registry. Re-exported here for callers that already import
// from `data/stats`.

import type { StatId } from "@/types/game";

export type { StatId };

/**
 * One-row presentation entry for an inline weapon-card stat. `body`
 * paragraphs are what Grandma reads aloud and are also rendered as text
 * in the modal — kept in sync so a player who has muted audio still
 * gets the full description.
 *
 * @stable Part of `content` public API.
 */
export interface StatDefinition {
  readonly id: StatId;
  readonly name: string;
  readonly icon: string;
  readonly body: readonly string[];
}

const REGISTRY: Readonly<Record<StatId, StatDefinition>> = {
  dps: {
    id: "dps",
    name: "Damage Per Second",
    icon: "💥",
    body: [
      "Damage per second — how much hurt this gun puts out if you hold the trigger and nothing moves.",
      "It's not just the raw bullet damage. We fold in the fire rate, how many projectiles you spit per shot, your Mark level, and every augment you've bolted on. The number on the row is the gun you're actually firing today, captain — not the brochure number.",
      "Compare DPS across slots when you're picking a loadout. The one with the higher number is doing more work."
    ]
  },
  energy: {
    id: "energy",
    name: "Energy Per Shot",
    icon: "⚡",
    body: [
      "How much reactor charge each pull of the trigger costs. Your reactor refills on its own; bigger guns just empty it faster.",
      "Stack two thirsty weapons in your slots and you'll find the trigger goes quiet mid-fight while you wait for charge. A cheap gun and a hungry gun on the same ship is often a better mix than two hungry ones."
    ]
  },
  "augment-slots": {
    id: "augment-slots",
    name: "Augment Slots",
    icon: "🧩",
    body: [
      "Every weapon has two augment slots. The chip shows how many you've used and how many are free.",
      "Once you bolt an augment in, it's permanent. Welded, soldered, fused — pick your favourite verb. You can't pull it back out, you can't shuffle it to another gun. Selling the weapon takes the augments with it (you do get the credits back at full refund, while we're being kind about that).",
      "Pick augments that match how you actually fight. A damage booster on a fast little potato cannon is fine. A damage booster AND an extra-projectile module on the same gun? Now we're talking."
    ]
  }
} as const;

/**
 * Resolves a stat id to its full entry.
 *
 * @throws Error if `id` is not a known stat id.
 *
 * @stable Part of `content` public API.
 */
export function getStat(id: StatId): StatDefinition {
  const entry = REGISTRY[id];
  if (!entry) throw new Error(`Unknown stat id: ${id}`);
  return entry;
}

/**
 * Every stat in declaration order. Mainly useful for tests and any
 * future "stat catalog" UI.
 *
 * @stable Part of `content` public API.
 */
export const STATS: readonly StatDefinition[] = [
  REGISTRY.dps,
  REGISTRY.energy,
  REGISTRY["augment-slots"]
];
