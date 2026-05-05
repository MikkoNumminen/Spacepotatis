// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.

// Inline-stat presentation copy. The actual numeric behaviour for each
// stat is computed at render time from `WeaponDefinition` +
// `WeaponInstance` + installed augments — this module is a thin
// presentation registry: id → display label + icon + body copy for the
// StatDetailsModal, and an id-to-voice-file convention for the
// matching audio cue.
//
// IMPORTANT: unlike weapons / augments / upgrades (where `body` is the
// transcript Grandma reads), the stat-chip `body` is intentionally
// dry UI documentation — formula factors, units, and update rules.
// This is the "spec" view; the voice file is independent flavour
// commentary that does NOT need to match word-for-word.
//
// Voice path: `/audio/stats/<id>-voice.mp3`. Missing files fail silently
// (HTMLAudioElement doesn't throw on 404).
//
// `StatId` lives in `src/types/game.ts` next to `WeaponId` / `AugmentId` /
// `UpgradeId` so non-content modules can depend on it without pulling
// the data registry. Re-exported here for callers that already import
// from `data/stats`.

import type { StatId } from "@/types/game";

export type { StatId };

/**
 * One-row presentation entry for an inline weapon-card stat. `body`
 * paragraphs are dry UI documentation rendered as text in the modal —
 * formula factors, units, and update rules. Independent of the
 * matching voice file (which is flavour commentary, not a transcript).
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
      "Effective damage per second of this weapon at its current configuration.",
      "Formula: base damage × Mark multiplier × augment damage multiplier × projectile count × (1000 / fire rate in ms).",
      "Updates live when the weapon is upgraded (Mark) or an augment is installed that affects damage, fire rate, or projectile count."
    ]
  },
  energy: {
    id: "energy",
    name: "Energy Per Shot",
    icon: "⚡",
    body: [
      "Reactor energy consumed per fire event (per trigger pull, not per bullet).",
      "Formula: base energy cost × augment energy multiplier, rounded, minimum 1.",
      "The reactor recharges over time. Lower energy cost = more shots before the reactor empties; higher cost = longer pauses while it refills."
    ]
  },
  "augment-slots": {
    id: "augment-slots",
    name: "Augment Slots",
    icon: "🧩",
    body: [
      "Augments installed on this weapon, out of the maximum allowed.",
      "Maximum: 2 per weapon. Once installed, augments are permanent — they cannot be removed, swapped to another weapon, or refunded individually.",
      "Selling the weapon refunds 100% of its base cost + every upgrade paid + every installed augment's cost."
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
