import { getWeapon } from "@/game/data/weapons";
import type { WeaponDefinition, WeaponId } from "@/types/game";
import { WeaponDot } from "./dots";

// Friendly label for an array index: slot 0 is "MAIN", subsequent slots
// are "SLOT 2", "SLOT 3", … so the player can talk about them naturally.
export function slotLabel(slotIndex: number): string {
  return slotIndex === 0 ? "MAIN" : `SLOT ${slotIndex + 1}`;
}

export type WeaponLevels = Readonly<Partial<Record<WeaponId, number>>>;

export function SlotGrid({
  slots,
  weaponLevels,
  onPick
}: {
  slots: readonly (WeaponId | null)[];
  weaponLevels: WeaponLevels;
  onPick: (slotIndex: number) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {slots.map((wid, i) => (
        <SlotCard
          key={i}
          slotIndex={i}
          weaponId={wid}
          weaponLevels={weaponLevels}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

function SlotCard({
  slotIndex,
  weaponId,
  weaponLevels,
  onPick
}: {
  slotIndex: number;
  weaponId: WeaponDefinition["id"] | null;
  weaponLevels: WeaponLevels;
  onPick: (slotIndex: number) => void;
}) {
  const weapon = weaponId ? getWeapon(weaponId) : null;
  const level = weaponId ? weaponLevels[weaponId] ?? 1 : 1;
  return (
    <button
      type="button"
      onClick={() => onPick(slotIndex)}
      className={`rounded border p-3 text-left transition ${
        weapon
          ? "border-hud-green/60 bg-hud-green/5 hover:border-hud-green"
          : "border-dashed border-space-border hover:border-hud-amber/60"
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
        <div className="mt-1 font-mono text-[11px] text-hud-green/40">empty</div>
      )}
      <div className="mt-2 text-[10px] text-hud-amber/80">change</div>
    </button>
  );
}
