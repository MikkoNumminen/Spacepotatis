import { getAugment } from "@/game/data/augments";
import type { AugmentId } from "@/types/game";
import { AugmentDot } from "./dots";

export function AugmentInventoryList({ inventory }: { inventory: readonly AugmentId[] }) {
  if (inventory.length === 0) return null;
  return (
    <>
      <h3 className="mt-6 mb-2 font-display text-xs tracking-widest text-hud-green/70">
        AUGMENT INVENTORY
      </h3>
      <ul className="flex flex-col gap-2">
        {inventory.map((id, idx) => {
          const aug = getAugment(id);
          return (
            <li key={`${id}-${idx}`} className="rounded border border-space-border p-3">
              <div className="flex items-baseline gap-2">
                <AugmentDot tint={aug.tint} />
                <span className="font-display tracking-wider">{aug.name}</span>
              </div>
              <p className="mt-1 text-[11px] text-hud-green/70">{aug.description}</p>
              <p className="mt-1 text-[10px] text-hud-amber/70">
                → install via the buttons above
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
