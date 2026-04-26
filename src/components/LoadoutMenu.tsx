"use client";

import { useState } from "react";
import { equipWeapon, getSellPrice, sellWeapon } from "@/game/state/GameState";
import {
  isWeaponEquipped,
  isWeaponUnlocked,
  slotKindFor,
  type SlotName
} from "@/game/state/ShipConfig";
import { getAllWeapons, getWeapon, weaponDps, weaponRps } from "@/game/phaser/data/weapons";
import { useGameState } from "@/game/state/useGameState";
import type { WeaponDefinition } from "@/types/game";

interface Props {
  // "market" enables Sell buttons on owned, non-equipped, non-starter weapons.
  // "equip" hides them — used in the galaxy-view loadout modal.
  mode: "equip" | "market";
}

const SLOT_LABEL: Record<SlotName, string> = {
  front: "FRONT",
  rear: "REAR",
  sidekickLeft: "SIDEKICK · LEFT",
  sidekickRight: "SIDEKICK · RIGHT"
};

export default function LoadoutMenu({ mode }: Props) {
  const credits = useGameState((s) => s.credits);
  const ship = useGameState((s) => s.ship);
  const [picker, setPicker] = useState<SlotName | null>(null);

  const owned = getAllWeapons().filter((w) => isWeaponUnlocked(ship, w.id));
  const inventory = owned.filter((w) => !isWeaponEquipped(ship, w.id));

  const closePicker = () => setPicker(null);
  const onPickerSelect = (slot: SlotName, id: WeaponDefinition["id"] | null) => {
    equipWeapon(slot, id);
    closePicker();
  };

  return (
    <section className="rounded border border-space-border bg-space-panel/70 p-5">
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display tracking-widest text-hud-green">SHIP LOADOUT</h2>
        <span className="font-mono text-xs text-hud-amber">¢ {credits}</span>
      </header>

      <SlotGrid slots={ship.slots} onPick={(slot) => setPicker(slot)} />

      <h3 className="mt-6 mb-2 font-display text-xs tracking-widest text-hud-green/70">
        INVENTORY
      </h3>
      {inventory.length === 0 ? (
        <p className="text-[11px] text-hud-green/50">
          All owned weapons are equipped. Visit the shop to buy more.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {inventory.map((weapon) => {
            const sellPrice = getSellPrice(weapon);
            const sellable = mode === "market" && sellPrice > 0;
            return (
              <li key={weapon.id} className="rounded border border-space-border p-3">
                <div className="flex items-baseline justify-between">
                  <div className="flex items-baseline gap-2">
                    <WeaponDot tint={weapon.tint} />
                    <span className="font-display tracking-wider">{weapon.name}</span>
                    <span className="text-[10px] uppercase tracking-widest text-hud-green/50">
                      {weapon.slot}
                    </span>
                  </div>
                </div>
                <WeaponStats weapon={weapon} />
                <p className="mt-2 text-[11px] text-hud-green/70">{weapon.description}</p>
                <div className="mt-2 flex items-center justify-end gap-2">
                  {sellable && (
                    <button
                      type="button"
                      onClick={() => void sellWeapon(weapon.id)}
                      className="rounded border border-hud-red/60 px-3 py-1 text-xs text-hud-red hover:bg-hud-red/10"
                    >
                      SELL · ¢ {sellPrice}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {picker && (
        <SlotPicker
          slot={picker}
          owned={owned}
          equippedInThisSlot={ship.slots[picker]}
          onPick={(id) => onPickerSelect(picker, id)}
          onClose={closePicker}
        />
      )}
    </section>
  );
}

function SlotGrid({
  slots,
  onPick
}: {
  slots: {
    front: WeaponDefinition["id"] | null;
    rear: WeaponDefinition["id"] | null;
    sidekickLeft: WeaponDefinition["id"] | null;
    sidekickRight: WeaponDefinition["id"] | null;
  };
  onPick: (slot: SlotName) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div />
      <SlotCard slot="front" weaponId={slots.front} onPick={onPick} />
      <div />

      <SlotCard slot="sidekickLeft" weaponId={slots.sidekickLeft} onPick={onPick} />
      <div className="rounded border border-dashed border-space-border/40 p-3 text-center text-[10px] text-hud-green/40">
        SHIP
      </div>
      <SlotCard slot="sidekickRight" weaponId={slots.sidekickRight} onPick={onPick} />

      <div />
      <SlotCard slot="rear" weaponId={slots.rear} onPick={onPick} />
      <div />
    </div>
  );
}

function SlotCard({
  slot,
  weaponId,
  onPick
}: {
  slot: SlotName;
  weaponId: WeaponDefinition["id"] | null;
  onPick: (slot: SlotName) => void;
}) {
  const weapon = weaponId ? getWeapon(weaponId) : null;
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
      <div className="text-[10px] uppercase tracking-widest text-hud-green/50">
        {SLOT_LABEL[slot]}
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

function SlotPicker({
  slot,
  owned,
  equippedInThisSlot,
  onPick,
  onClose
}: {
  slot: SlotName;
  owned: readonly WeaponDefinition[];
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

function WeaponDot({ tint }: { tint: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: tint, boxShadow: `0 0 6px ${tint}` }}
    />
  );
}

// Two-column "spec sheet". Designed to make the per-bullet vs total picture
// obvious so players see WHY one weapon outclasses another.
export function WeaponStats({ weapon }: { weapon: WeaponDefinition }) {
  const isMulti = weapon.projectileCount > 1;
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px]">
      <Stat
        label="damage"
        value={`${weapon.damage}${isMulti ? ` × ${weapon.projectileCount}` : ""}`}
      />
      <Stat label="dps" value={String(weaponDps(weapon))} />
      <Stat label="fire rate" value={`${weaponRps(weapon)} rps`} />
      <Stat label="energy" value={`⚡ ${weapon.energyCost}`} />
      {isMulti ? (
        <Stat label="spread" value={`${weapon.spreadDegrees}°`} />
      ) : (
        <Stat label="bullet speed" value={String(weapon.bulletSpeed)} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-hud-green/60">{label}</span>
      <span className="text-hud-amber">{value}</span>
    </div>
  );
}
