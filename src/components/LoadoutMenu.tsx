"use client";

import { buyWeaponSlot } from "@/game/state/GameState";
import {
  MAX_WEAPON_SLOTS,
  getInstanceAt,
  slotPurchaseCost
} from "@/game/state/ShipConfig";
import { useGameState } from "@/game/state/useGameState";
import { SlotGrid } from "@/components/loadout/SlotGrid";
import { SlotPicker } from "@/components/loadout/SlotPicker";
import { AugmentPicker } from "@/components/loadout/AugmentPicker";
import { AugmentInventoryList } from "@/components/loadout/AugmentInventoryList";
import { WeaponList } from "@/components/loadout/WeaponList";
import { useLoadoutSelection } from "@/components/loadout/useLoadoutSelection";
import {
  getEquippedEntries,
  getInventoryEntries
} from "@/components/loadout/selectors";
import { getWeapon } from "@/game/data/weapons";

// `mode` is retained for the shop page call site but no longer branches —
// LoadoutMenu is mounted only by the shop now (the galaxy-view loadout
// modal was removed). Sell + upgrade + install are always available.
interface Props {
  mode?: "equip" | "market";
}

export default function LoadoutMenu(_props: Props) {
  void _props;
  const credits = useGameState((s) => s.credits);
  const ship = useGameState((s) => s.ship);
  const sel = useLoadoutSelection();

  const equippedEntries = getEquippedEntries(ship);
  const inventoryEntries = getInventoryEntries(ship);

  const slotCount = ship.slots.length;
  const canBuySlot = slotCount < MAX_WEAPON_SLOTS;
  const nextSlotCost = canBuySlot ? slotPurchaseCost(slotCount) : null;
  const canAffordSlot = nextSlotCost !== null && credits >= nextSlotCost;

  const augPickerInstance =
    sel.augPickerPos !== null ? getInstanceAt(ship, sel.augPickerPos) : null;
  const augPickerWeapon = augPickerInstance ? getWeapon(augPickerInstance.id) : null;

  return (
    <section className="rounded border border-space-border bg-space-panel/70 p-5">
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display tracking-widest text-hud-green">SHIP LOADOUT</h2>
        <span className="font-mono text-xs text-hud-amber">¢ {credits}</span>
      </header>

      <SlotGrid slots={ship.slots} onPick={sel.openPicker} />

      <div className="mt-3 flex items-center justify-between rounded border border-dashed border-space-border p-3">
        <div>
          <div className="font-display text-sm tracking-widest text-hud-green/80">
            ADD WEAPON SLOT
          </div>
          <div className="text-[11px] text-hud-green/60">
            {slotCount}/{MAX_WEAPON_SLOTS} mounted · expansions append at the right
          </div>
        </div>
        {canBuySlot ? (
          <button
            type="button"
            disabled={!canAffordSlot}
            onClick={() => void buyWeaponSlot()}
            className="rounded border border-hud-amber/60 px-3 py-1 text-xs text-hud-amber enabled:hover:bg-hud-amber/10 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
          >
            BUY · ¢ {nextSlotCost}
          </button>
        ) : (
          <span className="font-mono text-[11px] text-hud-green/50">slots maxed</span>
        )}
      </div>

      {/* Surface equipped weapons so the player can upgrade / install
          augments without unequipping. INVENTORY below covers
          owned-but-unequipped instances. */}
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
          showSellButton={true}
          showUpgradeButton={true}
          showInstallButton={true}
          onOpenInstaller={sel.openAugPicker}
        />
      )}

      <AugmentInventoryList inventory={ship.augmentInventory} />

      {sel.picker !== null && (
        <SlotPicker
          slotIndex={sel.picker}
          inventoryEntries={inventoryEntries}
          equippedInThisSlot={ship.slots[sel.picker] ?? null}
          onPick={sel.selectForPicker}
          onClose={sel.closePicker}
        />
      )}

      {sel.augPickerPos !== null && augPickerInstance && augPickerWeapon && (
        <AugmentPicker
          position={sel.augPickerPos}
          weapon={augPickerWeapon}
          installed={augPickerInstance.augments}
          augmentInventory={ship.augmentInventory}
          onPick={sel.installForAugPicker}
          onClose={sel.closeAugPicker}
        />
      )}
    </section>
  );
}
