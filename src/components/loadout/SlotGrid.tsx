import { type SlotName } from "@/game/state/ShipConfig";
import { getWeapon } from "@/game/data/weapons";
import type { WeaponDefinition } from "@/types/game";
import { WeaponDot } from "./dots";

export const SLOT_LABEL: Record<SlotName, string> = {
  front: "FRONT",
  rear: "REAR",
  sidekickLeft: "SIDEKICK · LEFT",
  sidekickRight: "SIDEKICK · RIGHT"
};

export type SlotMap = {
  front: WeaponDefinition["id"] | null;
  rear: WeaponDefinition["id"] | null;
  sidekickLeft: WeaponDefinition["id"] | null;
  sidekickRight: WeaponDefinition["id"] | null;
};

export type WeaponLevels = Readonly<Partial<Record<WeaponDefinition["id"], number>>>;

export function SlotGrid({
  slots,
  weaponLevels,
  onPick
}: {
  slots: SlotMap;
  weaponLevels: WeaponLevels;
  onPick: (slot: SlotName) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div />
      <SlotCard slot="front" weaponId={slots.front} weaponLevels={weaponLevels} onPick={onPick} />
      <div />

      <SlotCard
        slot="sidekickLeft"
        weaponId={slots.sidekickLeft}
        weaponLevels={weaponLevels}
        onPick={onPick}
      />
      <div className="rounded border border-dashed border-space-border/40 p-3 text-center text-[10px] text-hud-green/40">
        SHIP
      </div>
      <SlotCard
        slot="sidekickRight"
        weaponId={slots.sidekickRight}
        weaponLevels={weaponLevels}
        onPick={onPick}
      />

      <div />
      <SlotCard slot="rear" weaponId={slots.rear} weaponLevels={weaponLevels} onPick={onPick} />
      <div />
    </div>
  );
}

function SlotCard({
  slot,
  weaponId,
  weaponLevels,
  onPick
}: {
  slot: SlotName;
  weaponId: WeaponDefinition["id"] | null;
  weaponLevels: WeaponLevels;
  onPick: (slot: SlotName) => void;
}) {
  const weapon = weaponId ? getWeapon(weaponId) : null;
  const level = weaponId ? weaponLevels[weaponId] ?? 1 : 1;
  return (
    <button
      type="button"
      onClick={() => onPick(slot)}
      className={`rounded border p-3 text-left transition ${
        weapon
          ? "border-hud-green/60 bg-hud-green/5 hover:border-hud-green"
          : "border-dashed border-space-border hover:border-hud-amber/60"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-hud-green/50">
          {SLOT_LABEL[slot]}
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
