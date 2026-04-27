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
  type SlotName
} from "@/game/state/ShipConfig";
import { getAllWeapons, getWeapon } from "@/game/data/weapons";
import { getAugment } from "@/game/data/augments";
import { useGameState } from "@/game/state/useGameState";
import { SLOT_LABEL, SlotGrid } from "@/components/loadout/SlotGrid";
import { AugmentDot } from "@/components/loadout/dots";
import { WeaponCard } from "@/components/loadout/WeaponCard";
import { SlotPicker } from "@/components/loadout/SlotPicker";
import { AugmentPicker } from "@/components/loadout/AugmentPicker";
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

