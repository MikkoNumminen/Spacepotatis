import { slotKindFor, type SlotName } from "@/game/state/ShipConfig";
import type { WeaponDefinition } from "@/types/game";
import { SLOT_LABEL, type WeaponLevels } from "./SlotGrid";
import { WeaponDot } from "./dots";

export function SlotPicker({
  slot,
  owned,
  weaponLevels,
  equippedInThisSlot,
  onPick,
  onClose
}: {
  slot: SlotName;
  owned: readonly WeaponDefinition[];
  weaponLevels: WeaponLevels;
  equippedInThisSlot: WeaponDefinition["id"] | null;
  onPick: (id: WeaponDefinition["id"] | null) => void;
  onClose: () => void;
}) {
  const candidates = owned.filter((w) => w.slot === slotKindFor(slot));
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
            EQUIP · {SLOT_LABEL[slot]}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-hud-green/60 hover:text-hud-green"
          >
            close
          </button>
        </header>

        {candidates.length === 0 ? (
          <p className="text-[11px] text-hud-green/60">
            No owned weapons fit this slot. Buy one in the shop.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {equippedInThisSlot !== null && (
              <li>
                <button
                  type="button"
                  onClick={() => onPick(null)}
                  className="w-full rounded border border-hud-red/40 px-3 py-2 text-left text-xs text-hud-red hover:bg-hud-red/10"
                >
                  UNEQUIP
                </button>
              </li>
            )}
            {candidates.map((w) => {
              const isHere = w.id === equippedInThisSlot;
              const lvl = weaponLevels[w.id] ?? 1;
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    disabled={isHere}
                    onClick={() => onPick(w.id)}
                    className={`flex w-full items-center justify-between rounded border px-3 py-2 text-left text-xs ${
                      isHere
                        ? "cursor-default border-hud-green/60 bg-hud-green/5 text-hud-green"
                        : "border-space-border hover:border-hud-amber/60"
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <WeaponDot tint={w.tint} />
                      {w.name}
                      {lvl > 1 && (
                        <span className="font-mono text-[10px] text-hud-green/60">Mk {lvl}</span>
                      )}
                    </span>
                    <span className="font-mono text-[10px] text-hud-amber">
                      ⚡ {w.energyCost}
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
