"use client";

import { getInstalledAugments } from "@/game/state/ShipConfig";
import { useGameState } from "@/game/state/useGameState";
import { SlotGrid } from "@/components/loadout/SlotGrid";
import { SlotPicker } from "@/components/loadout/SlotPicker";
import { AugmentPicker } from "@/components/loadout/AugmentPicker";
import { AugmentInventoryList } from "@/components/loadout/AugmentInventoryList";
import { WeaponList } from "@/components/loadout/WeaponList";
import { useLoadoutSelection } from "@/components/loadout/useLoadoutSelection";
import { getEquippedEntries, getInventoryEntries, getOwnedWeapons } from "@/components/loadout/selectors";

// "market" enables Sell + Upgrade buttons on owned weapons. "equip" hides both —
// used in the galaxy-view loadout modal where the player is just shuffling.
interface Props {
  mode: "equip" | "market";
}

export default function LoadoutMenu({ mode }: Props) {
  const credits = useGameState((s) => s.credits);
  const ship = useGameState((s) => s.ship);
  const sel = useLoadoutSelection();

  const owned = getOwnedWeapons(ship);
  const equippedEntries = getEquippedEntries(ship);
  const inventoryEntries = getInventoryEntries(ship);

  return (
    <section className="rounded border border-space-border bg-space-panel/70 p-5">
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display tracking-widest text-hud-green">SHIP LOADOUT</h2>
        <span className="font-mono text-xs text-hud-amber">¢ {credits}</span>
      </header>

      <SlotGrid slots={ship.slots} weaponLevels={ship.weaponLevels} onPick={sel.openPicker} />

      {/* In market mode, surface equipped weapons so the player can upgrade
          without unequipping. INVENTORY below covers owned-but-unequipped. */}
      {mode === "market" && (
        <WeaponList
          ship={ship}
          credits={credits}
          entries={equippedEntries}
          heading="EQUIPPED"
          showSellButton={false}
          showUpgradeButton={true}
          showInstallButton={true}
          onOpenInstaller={sel.openAugPicker}
        />
      )}

      {inventoryEntries.length === 0 ? (
        <>
          <h3 className="mt-6 mb-2 font-display text-xs tracking-widest text-hud-green/70">
            INVENTORY
          </h3>
          <p className="text-[11px] text-hud-green/50">
            All owned weapons are equipped. Visit the shop to buy more.
          </p>
        </>
      ) : (
        <WeaponList
          ship={ship}
          credits={credits}
          entries={inventoryEntries}
          heading="INVENTORY"
          showSellButton={mode === "market"}
          showUpgradeButton={mode === "market"}
          showInstallButton={mode === "market"}
          onOpenInstaller={sel.openAugPicker}
        />
      )}

      {mode === "market" && <AugmentInventoryList inventory={ship.augmentInventory} />}

      {sel.picker !== null && (
        <SlotPicker
          slot={sel.picker}
          owned={owned}
          weaponLevels={ship.weaponLevels}
          equippedInThisSlot={ship.slots[sel.picker]}
          onPick={sel.selectForPicker}
          onClose={sel.closePicker}
        />
      )}

      {sel.augPickerWeapon !== null && (
        <AugmentPicker
          weaponId={sel.augPickerWeapon}
          installed={getInstalledAugments(ship, sel.augPickerWeapon)}
          augmentInventory={ship.augmentInventory}
          onPick={sel.installForAugPicker}
          onClose={sel.closeAugPicker}
        />
      )}
    </section>
  );
}
