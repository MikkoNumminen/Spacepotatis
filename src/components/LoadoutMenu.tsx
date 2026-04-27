"use client";

import { useState } from "react";
import {
  equipWeapon,
  installAugment
} from "@/game/state/GameState";
import {
  getInstalledAugments,
  getWeaponLevel,
  isWeaponEquipped,
  isWeaponUnlocked,
  slotKindFor,
  type SlotName
} from "@/game/state/ShipConfig";
import { getAllWeapons, getWeapon } from "@/game/data/weapons";
import {
  MAX_AUGMENTS_PER_WEAPON,
  getAugment
} from "@/game/data/augments";
import { useGameState } from "@/game/state/useGameState";
import { SLOT_LABEL, SlotGrid } from "@/components/loadout/SlotGrid";
import { AugmentDot, WeaponDot } from "@/components/loadout/dots";
import { WeaponCard } from "@/components/loadout/WeaponCard";
import type { AugmentId, WeaponDefinition, WeaponId } from "@/types/game";

interface Props {
  // "market" enables Sell + Upgrade buttons on owned weapons. "equip" hides
  // both — used in the galaxy-view loadout modal where the player is just
  // shuffling, not spending credits.
  mode: "equip" | "market";
}

export default function LoadoutMenu({ mode }: Props) {
  const credits = useGameState((s) => s.credits);
  const ship = useGameState((s) => s.ship);
  const [picker, setPicker] = useState<SlotName | null>(null);
  const [augPickerWeapon, setAugPickerWeapon] = useState<WeaponId | null>(null);

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

  const closeAugPicker = () => setAugPickerWeapon(null);
  const onAugPick = (weaponId: WeaponId, augmentId: AugmentId) => {
    installAugment(weaponId, augmentId);
    closeAugPicker();
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
              const installed = getInstalledAugments(ship, weapon.id);
              return (
                <WeaponCard
                  key={`equipped-${slot}-${weapon.id}`}
                  weapon={weapon}
                  level={level}
                  credits={credits}
                  showSellButton={false}
                  showUpgradeButton={true}
                  showInstallButton={mode === "market"}
                  installedAugments={installed}
                  augmentInventory={ship.augmentInventory}
                  onOpenInstaller={() => setAugPickerWeapon(weapon.id)}
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
            const installed = getInstalledAugments(ship, weapon.id);
            return (
              <WeaponCard
                key={weapon.id}
                weapon={weapon}
                level={level}
                credits={credits}
                showSellButton={mode === "market"}
                showUpgradeButton={mode === "market"}
                showInstallButton={mode === "market"}
                installedAugments={installed}
                augmentInventory={ship.augmentInventory}
                onOpenInstaller={() => setAugPickerWeapon(weapon.id)}
              />
            );
          })}
        </ul>
      )}

      {mode === "market" && ship.augmentInventory.length > 0 && (
        <>
          <h3 className="mt-6 mb-2 font-display text-xs tracking-widest text-hud-green/70">
            AUGMENT INVENTORY
          </h3>
          <ul className="flex flex-col gap-2">
            {ship.augmentInventory.map((id, idx) => {
              const aug = getAugment(id);
              return (
                <li
                  key={`${id}-${idx}`}
                  className="rounded border border-space-border p-3"
                >
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

      {augPickerWeapon && (
        <AugmentPicker
          weaponId={augPickerWeapon}
          installed={getInstalledAugments(ship, augPickerWeapon)}
          augmentInventory={ship.augmentInventory}
          onPick={(augId) => onAugPick(augPickerWeapon, augId)}
          onClose={closeAugPicker}
        />
      )}
    </section>
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

function AugmentPicker({
  weaponId,
  installed,
  augmentInventory,
  onPick,
  onClose
}: {
  weaponId: WeaponId;
  installed: readonly AugmentId[];
  augmentInventory: readonly AugmentId[];
  onPick: (augmentId: AugmentId) => void;
  onClose: () => void;
}) {
  const weapon = getWeapon(weaponId);
  // Only offer augments the weapon doesn't already hold. Duplicates of the
  // same augment id can sit in inventory if the player bought multiple
  // copies — show all such entries so the count adds up, but disable the
  // duplicates of an already-installed augment.
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

