// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.

// Ship-upgrade flavour copy. Unlike weapons / augments, the actual numeric
// behaviour of these upgrades lives in `src/game/state/ShipConfig.ts`
// (BASE_SHIELD, REACTOR_CAPACITY_PER_LEVEL, the cost curves, etc.). This
// module is a thin presentation registry: id → display name + body copy
// for the DETAILS modal, and an id-to-voice-file convention for Grandma.
//
// Voice path: `/audio/upgrades/<id>-voice.mp3`. Missing files fail silently
// (HTMLAudioElement doesn't throw on 404), matching weapons / augments.
//
// `UpgradeId` lives in `src/types/game.ts` next to `WeaponId` / `AugmentId`
// so non-content modules (state, schemas, future cheat-guards) can depend
// on it without pulling the data registry. Re-exported here for
// callers that already import from `data/upgrades`.

import type { UpgradeId } from "@/types/game";

export type { UpgradeId };

/**
 * One-row presentation entry for an upgrade. `body` paragraphs are what
 * Grandma reads aloud and are also rendered as text in the modal — kept in
 * sync so a player who has muted audio still gets the full description.
 *
 * @stable Part of `content` public API.
 */
export interface UpgradeDefinition {
  readonly id: UpgradeId;
  readonly name: string;
  readonly body: readonly string[];
}

const REGISTRY: Readonly<Record<UpgradeId, UpgradeDefinition>> = {
  shield: {
    id: "shield",
    name: "Shield Capacity",
    body: [
      "Your hull's bubble of energetic potato-skin. It catches hits before the tuber underneath has to.",
      "Recharges on its own once nothing's gnawing at it. The bigger the bubble, the longer you can wade into a swarm before the bugs taste root."
    ]
  },
  armor: {
    id: "armor",
    name: "Armor Plating",
    body: [
      "Layered hull sheets — some grown, some welded on after the Tubernovae salvage runs.",
      "When the shield drops, this is what stands between you and an open mash. Doesn't recharge. Once it's chewed through, it's chewed through."
    ]
  },
  "reactor-capacity": {
    id: "reactor-capacity",
    name: "Reactor Capacity",
    body: [
      "How much energy your reactor can hold at once. A bigger battery means longer salvos before the gun coughs and asks for a moment.",
      "Also: a more dramatic explosion, captain, if it ever fails. Worth it."
    ]
  },
  "reactor-recharge": {
    id: "reactor-recharge",
    name: "Reactor Recharge",
    body: [
      "How fast the reactor refills after you've drained it.",
      "Recharge is the difference between a single beautiful volley and a steady, terrifying stream of fire. The bugs prefer the volley. They like the pauses."
    ]
  }
} as const;

/**
 * Resolves an upgrade id to its full entry.
 *
 * @throws Error if `id` is not a known upgrade id.
 *
 * @stable Part of `content` public API.
 */
export function getUpgrade(id: UpgradeId): UpgradeDefinition {
  const entry = REGISTRY[id];
  if (!entry) throw new Error(`Unknown upgrade id: ${id}`);
  return entry;
}

/**
 * Every upgrade in declaration order. Mainly useful for tests and any
 * future "upgrade catalog" UI.
 *
 * @stable Part of `content` public API.
 */
export const UPGRADES: readonly UpgradeDefinition[] = [
  REGISTRY.shield,
  REGISTRY.armor,
  REGISTRY["reactor-capacity"],
  REGISTRY["reactor-recharge"]
];
