import type { WeaponInstance } from "@/game/state/ShipConfig";
import { slotLabel } from "./SlotGrid";
import { WeaponDot } from "./dots";
import type { InventoryEntry } from "./selectors";

export function SlotPicker({
  slotIndex,
  inventoryEntries,
  equippedInThisSlot,
  onPick,
  onClose
}: {
  slotIndex: number;
  inventoryEntries: readonly InventoryEntry[];
  equippedInThisSlot: WeaponInstance | null;
  onPick: (inventoryIndex: number | null) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded border border-space-border bg-space-panel p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="font-display tracking-widest text-hud-green">
            EQUIP · {slotLabel(slotIndex)}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="touch-manipulation select-none text-xs text-hud-green/60 hover:text-hud-green active:text-hud-green"
          >
            close
          </button>
        </header>

        {inventoryEntries.length === 0 && equippedInThisSlot === null ? (
          <p className="text-xs text-hud-green/60">
            No weapons in inventory. Buy one in the shop.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {equippedInThisSlot !== null && (
              <li>
                <button
                  type="button"
                  onClick={() => onPick(null)}
                  className="w-full touch-manipulation select-none rounded border border-hud-red/40 px-3 py-2 text-left text-xs text-hud-red hover:bg-hud-red/10 active:bg-hud-red/20"
                >
                  UNEQUIP
                </button>
              </li>
            )}
            {inventoryEntries.map((entry) => {
              const lvl = entry.instance.level;
              return (
                <li key={entry.key}>
                  <button
                    type="button"
                    onClick={() => onPick(entry.position.index)}
                    className="flex w-full touch-manipulation select-none items-center justify-between rounded border border-space-border px-3 py-2 text-left text-xs hover:border-hud-amber/60 active:bg-hud-amber/5"
                  >
                    <span className="flex items-baseline gap-2">
                      <WeaponDot tint={entry.weapon.tint} />
                      {entry.weapon.name}
                      {lvl > 1 && (
                        <span className="font-mono text-[10px] text-hud-green/60">Mk {lvl}</span>
                      )}
                    </span>
                    <span className="font-mono text-[10px] text-hud-amber">
                      ⚡ {entry.weapon.energyCost}
                    </span>
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
