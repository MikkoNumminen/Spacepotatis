"use client";

import { playUiCue } from "@/game/audio";
import { getAugment } from "@/game/data";
import { sellAugment, getAugmentSellPrice } from "@/game/state";
import type { AugmentId } from "@/types";
import { AugmentDot } from "./dots";
import { SectionHeading } from "./SectionHeading";

// Augment inventory row. Each augment in the player's free-floating
// inventory (not yet bound to a weapon) renders as a card with name,
// description, an "install via the buttons above" hint, and a SELL
// button. Once an augment is installed on a weapon it's permanent —
// refunds for installed augments come through the host weapon's sell
// price instead.
export function AugmentInventoryList({ inventory }: { inventory: readonly AugmentId[] }) {
  if (inventory.length === 0) return null;
  return (
    <>
      <SectionHeading>AUGMENT INVENTORY</SectionHeading>
      <ul className="flex flex-col gap-2">
        {inventory.map((id, idx) => {
          const aug = getAugment(id);
          const sellPrice = getAugmentSellPrice(id);
          return (
            <li key={`${id}-${idx}`} className="rounded border border-space-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <AugmentDot tint={aug.tint} />
                    <span className="font-display tracking-wider">{aug.name}</span>
                  </div>
                  <p className="mt-1 text-xs text-hud-green/70">{aug.description}</p>
                  <p className="mt-1 text-[10px] text-hud-amber/70">
                    → install via the buttons above
                  </p>
                </div>
                {sellPrice > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (sellAugment(idx)) playUiCue("sellAugment");
                    }}
                    className="shrink-0 touch-manipulation select-none rounded border border-hud-red/60 px-2 py-0.5 font-mono text-[11px] text-hud-red hover:bg-hud-red/10 active:bg-hud-red/20"
                  >
                    SELL · ¢{sellPrice}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
