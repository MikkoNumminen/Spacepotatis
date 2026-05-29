"use client";

import type { ShipConfig } from "@/game/state";
import type { AugmentId } from "@/types";
import type { AugmentDefinition } from "@/game/data";
import { AugmentDot } from "@/components/loadout/dots";

// Total copies of an augment id, INCLUDING ones already installed on weapons
// (those can't be uninstalled, but the player still "has" the augment id).
// Free-to-install copies live in augmentInventory.
function countOwnedAugment(ship: ShipConfig, id: AugmentId): {
  total: number;
  free: number;
} {
  const free = ship.augmentInventory.filter((a) => a === id).length;
  let installed = 0;
  for (const slot of ship.slots) if (slot) installed += slot.augments.filter((a) => a === id).length;
  for (const inst of ship.inventory) installed += inst.augments.filter((a) => a === id).length;
  return { total: free + installed, free };
}

export function ShopAugmentsSection({
  ship,
  credits,
  augments,
  onBuyAugment,
  onShowAugmentDetails
}: {
  ship: ShipConfig;
  credits: number;
  augments: readonly AugmentDefinition[];
  onBuyAugment: (aug: AugmentDefinition) => void;
  onShowAugmentDetails: (aug: AugmentDefinition) => void;
}) {
  return (
    <section className="rounded border border-space-border bg-space-panel/70 p-4 md:col-span-2 sm:p-5">
      <h2 className="mb-4 font-display tracking-widest text-hud-green">AUGMENTS</h2>

      <p className="mb-3 text-xs text-hud-green/60">
        Permanent weapon modifiers. One-way install. Open DETAILS for the full description.
      </p>

      <ul className="flex flex-col gap-1.5">
        {augments.map((aug) => {
          const { total, free } = countOwnedAugment(ship, aug.id);
          return (
            <li
              key={aug.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded border border-space-border px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AugmentDot tint={aug.tint} />
                <span className="font-display text-sm tracking-wider truncate">
                  {aug.name}
                </span>
                {total > 0 && (
                  <span
                    className="shrink-0 rounded border border-hud-green/40 bg-hud-green/5 px-1.5 py-0.5 font-mono text-[10px] text-hud-green/80"
                    title={`You own ${total} cop${total === 1 ? "y" : "ies"} of this augment in total. ${free} free in inventory ready to install. ${total - free} already installed on a weapon (one-way install — can't be removed).`}
                  >
                    ×{total}
                    {free !== total ? ` (free ${free})` : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onShowAugmentDetails(aug)}
                  className="touch-manipulation select-none rounded border border-hud-green/40 px-2 py-0.5 font-mono text-[11px] text-hud-green/80 hover:bg-hud-green/10 active:bg-hud-green/20"
                >
                  DETAILS
                </button>
                <button
                  type="button"
                  disabled={credits < aug.cost}
                  onClick={() => onBuyAugment(aug)}
                  className="touch-manipulation select-none rounded border border-hud-amber/60 px-2 py-0.5 font-mono text-[11px] text-hud-amber enabled:hover:bg-hud-amber/10 enabled:active:bg-hud-amber/20 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
                >
                  BUY · ¢{aug.cost}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
