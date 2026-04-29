import { getWeapon } from "@/game/data/weapons";
import type { WeaponSlots } from "@/game/state/ShipConfig";
import { WeaponDot } from "./dots";

// Friendly label for an array index: slot 0 is "MAIN", subsequent slots
// are "SLOT 2", "SLOT 3", … so the player can talk about them naturally.
export function slotLabel(slotIndex: number): string {
  return slotIndex === 0 ? "MAIN" : `SLOT ${slotIndex + 1}`;
}

export function SlotGrid({
  slots,
  onPick
}: {
  slots: WeaponSlots;
  onPick: (slotIndex: number) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {slots.map((instance, i) => (
        <SlotCard key={i} slotIndex={i} instance={instance} onPick={onPick} />
      ))}
    </div>
  );
}

function SlotCard({
  slotIndex,
  instance,
  onPick
}: {
  slotIndex: number;
  instance: WeaponSlots[number];
  onPick: (slotIndex: number) => void;
}) {
  const weapon = instance ? getWeapon(instance.id) : null;
  const level = instance ? instance.level : 1;
  return (
    <button
      type="button"
      onClick={() => onPick(slotIndex)}
      className={`touch-manipulation select-none rounded border p-3 text-left transition ${
        weapon
          ? "border-hud-green/60 bg-hud-green/5 hover:border-hud-green active:bg-hud-green/10"
          : "border-dashed border-space-border hover:border-hud-amber/60 active:bg-hud-amber/5"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-hud-green/50">
          {slotLabel(slotIndex)}
        </span>
        {weapon && level > 1 && (
          <span className="font-mono text-[10px] text-hud-green/80">Mk {level}</span>
        )}
      </div>
      {weapon ? (
        <div className="mt-1 flex items-baseline gap-2">
          <WeaponDot tint={weapon.tint} />
          <span className="font-display text-sm tracking-wider">{weapon.name}</span>
        </div>
      ) : (
        <div className="mt-1 font-mono text-xs text-hud-green/40">empty</div>
      )}
      <div className="mt-2 text-[10px] text-hud-amber/80">change</div>
    </button>
  );
}
