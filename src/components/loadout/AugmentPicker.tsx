import { MAX_AUGMENTS_PER_WEAPON, getAugment } from "@/game/data/augments";
import type { WeaponPosition } from "@/game/state/ShipConfig";
import type { AugmentId, WeaponDefinition } from "@/types/game";
import { AugmentDot } from "./dots";

export function AugmentPicker({
  position: _position,
  weapon,
  installed,
  augmentInventory,
  onPick,
  onClose
}: {
  position: WeaponPosition;
  weapon: WeaponDefinition;
  installed: readonly AugmentId[];
  augmentInventory: readonly AugmentId[];
  onPick: (augmentId: AugmentId) => void;
  onClose: () => void;
}) {
  // Only offer augments the instance doesn't already hold. Duplicates of the
  // same augment id can sit in inventory if the player bought multiple copies;
  // those are filtered out once that augment is installed on this instance.
  void _position;
  const eligible = augmentInventory
    .map((id, idx) => ({ id, idx }))
    .filter(({ id }) => !installed.includes(id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded border border-space-border bg-space-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-baseline justify-between">
          <h3 className="font-display tracking-widest text-hud-green">
            INSTALL · {weapon.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-hud-green/60 hover:text-hud-green"
          >
            close
          </button>
        </header>

        <p className="mb-3 text-[11px] text-hud-green/60">
          {installed.length}/{MAX_AUGMENTS_PER_WEAPON} slots used. Augments are permanent
          once installed.
        </p>

        {eligible.length === 0 ? (
          <p className="text-[11px] text-hud-green/60">
            No eligible augments in your inventory. Visit the shop to buy more.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {eligible.map(({ id, idx }) => {
              const aug = getAugment(id);
              return (
                <li key={`${id}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => onPick(id)}
                    className="flex w-full flex-col gap-1 rounded border border-space-border px-3 py-2 text-left text-xs hover:border-hud-amber/60"
                  >
                    <span className="flex items-baseline gap-2">
                      <AugmentDot tint={aug.tint} />
                      <span className="font-display tracking-wider text-hud-green">
                        {aug.name}
                      </span>
                    </span>
                    <span className="text-[11px] text-hud-green/70">{aug.description}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
