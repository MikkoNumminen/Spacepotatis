// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.

// Inline-stat presentation copy. The actual numeric behaviour for each
// stat is computed at render time from `WeaponDefinition` +
// `WeaponInstance` + installed augments — this module is a thin
// presentation registry: id → display label + icon + body copy for the
// StatDetailsModal, plus an id-to-voice-file convention for the
// matching audio cue.
//
// Body copy is short (2-3 lines) — a single Grandma-flavour beat
// followed by the formula factors. The voice file is the longer rant;
// the visible text is the spec the player can scan at a glance.
//
// Voice path: `/audio/stats/<id>-voice.mp3`. Missing files fail silently.
//
// `StatId` lives in `src/types/game.ts` next to `WeaponId` / `AugmentId` /
// `UpgradeId` so non-content modules can depend on it without pulling
// the data registry. Re-exported here for callers that already import
// from `data/stats`.

import type { StatId } from "@/types";

export type { StatId };

/**
 * One-row presentation entry for an inline weapon-card stat. `body`
 * paragraphs are kept short — one Grandma-flavour beat plus the
 * formula factors. The matching voice file is the longer rant;
 * visible text is the spec sheet.
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
      "What this gun actually puts out — the number you'd read on a stopwatch, not the brochure.",
      "Folds in: base damage × Mark multiplier × augment damage multiplier × projectile count × (1000 / fire rate ms)."
    ]
  },
  energy: {
    id: "energy",
    name: "Energy Per Shot",
    icon: "⚡",
    body: [
      "Reactor charge spent per trigger pull. The reactor refills on its own — hungry guns just drain it faster.",
      "Folds in: base energy cost × augment energy multiplier, rounded, minimum 1."
    ]
  },
  "augment-slots": {
    id: "augment-slots",
    name: "Augment Slots",
    icon: "🧩",
    body: [
      "Two slots per weapon. Once an augment is bolted in, it's permanent — welded, soldered, fused.",
      "Augments cannot be removed, swapped, or refunded individually. Selling the weapon refunds 100% of base + every upgrade + every installed augment."
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
