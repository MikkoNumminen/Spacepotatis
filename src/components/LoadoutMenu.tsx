"use client";

import { useState } from "react";
import {
  buyWeaponUpgrade,
  equipWeapon,
  getSellPrice,
  sellWeapon
} from "@/game/state/GameState";
import {
  MAX_LEVEL,
  getWeaponLevel,
  isWeaponEquipped,
  isWeaponUnlocked,
  slotKindFor,
  weaponUpgradeCost,
  type SlotName
} from "@/game/state/ShipConfig";
import { getAllWeapons, getWeapon } from "@/game/phaser/data/weapons";
import { useGameState } from "@/game/state/useGameState";
import { WeaponStats } from "@/components/WeaponStats";
import type { WeaponDefinition } from "@/types/game";

interface Props {
  // "market" enables Sell + Upgrade buttons on owned weapons. "equip" hides
  // both — used in the galaxy-view loadout modal where the player is just
  // shuffling, not spending credits.
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
  const equippedList: { slot: SlotName; weapon: WeaponDefinition }[] = (
    Object.keys(ship.slots) as SlotName[]
  )
    .map((slot) => {
      const wid = ship.slots[slot];
      return wid ? { slot, weapon: getWeapon(wid) } : null;
    })
    .filter((x): x is { slot: SlotName; weapon: WeaponDefinition } => x !== null);
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

      <SlotGrid slots={ship.slots} weaponLevels={ship.weaponLevels} onPick={(slot) => setPicker(slot)} />

      {/* In market mode, surface the equipped weapons too so the player can
          upgrade them without unequipping. The inventory section below covers
          owned-but-unequipped weapons. */}
      {mode === "market" && equippedList.length > 0 && (
        <>
          <h3 className="mt-6 mb-2 font-display text-xs tracking-widest text-hud-green/70">
            EQUIPPED
          </h3>
          <ul className="flex flex-col gap-3">
            {equippedList.map(({ slot, weapon }) => {
              const level = getWeaponLevel(ship, weapon.id);
              return (
                <WeaponCard
                  key={`equipped-${slot}-${weapon.id}`}
                  weapon={weapon}
                  level={level}
                  credits={credits}
                  showSellButton={false}
                  showUpgradeButton={true}
                  slotBadge={SLOT_LABEL[slot]}
                />
              );
            })}
          </ul>
        </>
      )}

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
            const level = getWeaponLevel(ship, weapon.id);
            return (
              <WeaponCard
                key={weapon.id}
                weapon={weapon}
                level={level}
                credits={credits}
                showSellButton={mode === "market"}
                showUpgradeButton={mode === "market"}
              />
            );
          })}
        </ul>
      )}

      {picker && (
        <SlotPicker
          slot={picker}
          owned={owned}
          weaponLevels={ship.weaponLevels}
          equippedInThisSlot={ship.slots[picker]}
          onPick={(id) => onPickerSelect(picker, id)}
          onClose={closePicker}
        />
      )}
    </section>
  );
}

function WeaponCard({
  weapon,
  level,
  credits,
  showSellButton,
  showUpgradeButton,
  slotBadge
}: {
  weapon: WeaponDefinition;
  level: number;
  credits: number;
  showSellButton: boolean;
  showUpgradeButton: boolean;
  slotBadge?: string;
}) {
  const sellPrice = getSellPrice(weapon);
  const sellable = showSellButton && sellPrice > 0;
  const atMaxLevel = level >= MAX_LEVEL;
  const upgradeCost = atMaxLevel ? null : weaponUpgradeCost(level);
  const canAffordUpgrade = upgradeCost !== null && credits >= upgradeCost;

  return (
    <li className="rounded border border-space-border p-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <WeaponDot tint={weapon.tint} />
          <span className="font-display tracking-wider">{weapon.name}</span>
          <span className="text-[10px] uppercase tracking-widest text-hud-green/50">
            {slotBadge ?? weapon.slot}
          </span>
        </div>
        <MarkBadge level={level} />
      </div>
      <WeaponStats weapon={weapon} level={level} />
      <p className="mt-2 text-[11px] text-hud-green/70">{weapon.description}</p>
      <div className="mt-2 flex items-center justify-end gap-2">
        {showUpgradeButton &&
          (atMaxLevel ? (
            <span className="font-mono text-[10px] text-hud-green/50">Mk {MAX_LEVEL} maxed</span>
          ) : (
            <button
              type="button"
              disabled={!canAffordUpgrade}
              onClick={() => void buyWeaponUpgrade(weapon.id)}
              className="rounded border border-hud-amber/60 px-3 py-1 text-xs text-hud-amber enabled:hover:bg-hud-amber/10 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
            >
              UPGRADE Mk{level + 1} · ¢ {upgradeCost}
            </button>
          ))}
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
}

function MarkBadge({ level }: { level: number }) {
  if (level <= 1) return null;
  return (
    <span className="rounded border border-hud-green/40 px-1.5 py-0.5 font-mono text-[10px] text-hud-green/80">
      Mk {level}
    </span>
  );
}

function SlotGrid({
  slots,
  weaponLevels,
  onPick
}: {
  slots: {
    front: WeaponDefinition["id"] | null;
    rear: WeaponDefinition["id"] | null;
    sidekickLeft: WeaponDefinition["id"] | null;
    sidekickRight: WeaponDefinition["id"] | null;
  };
  weaponLevels: Readonly<Partial<Record<WeaponDefinition["id"], number>>>;
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
  weaponLevels: Readonly<Partial<Record<WeaponDefinition["id"], number>>>;
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

function SlotPicker({
  slot,
  owned,
  weaponLevels,
  equippedInThisSlot,
  onPick,
  onClose
}: {
  slot: SlotName;
  owned: readonly WeaponDefinition[];
  weaponLevels: Readonly<Partial<Record<WeaponDefinition["id"], number>>>;
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

function WeaponDot({ tint }: { tint: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: tint, boxShadow: `0 0 6px ${tint}` }}
    />
  );
}
