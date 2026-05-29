"use client";

import { useCallback, useMemo, useState } from "react";
import {
  buyArmorUpgrade,
  buyAugment,
  buyReactorCapacityUpgrade,
  buyReactorRechargeUpgrade,
  buyShieldUpgrade,
  buyWeapon,
  MAX_LEVEL,
  armorUpgradeCost,
  getMaxArmor,
  getMaxShield,
  getReactorCapacity,
  getReactorRecharge,
  reactorCapacityCost,
  reactorRechargeCost,
  shieldUpgradeCost,
  useGameState
} from "@/game/state";
import type { ShipConfig } from "@/game/state";
import { itemSfx } from "@/game/audio";
import { getWeapon, getAllAugments, getBuyableWeaponIds } from "@/game/data";
import type { WeaponDefinition } from "@/types";
import type { AugmentDefinition } from "@/game/data";
import { WeaponDetailsModal } from "@/components/loadout/WeaponDetailsModal";
import { AugmentDetailsModal } from "@/components/loadout/AugmentDetailsModal";
import { UpgradeDetailsModal } from "@/components/loadout/UpgradeDetailsModal";
import { getUpgrade, type UpgradeId } from "@/game/data";
import { ShopUpgradesSection } from "@/components/shop/ShopUpgradesSection";
import { ShopWeaponsSection } from "@/components/shop/ShopWeaponsSection";
import { ShopAugmentsSection } from "@/components/shop/ShopAugmentsSection";

export default function ShopUI() {
  const credits = useGameState((s) => s.credits);
  const ship = useGameState((s) => s.ship);
  const completedMissions = useGameState((s) => s.completedMissions);
  const [weaponDetails, setWeaponDetails] = useState<WeaponDefinition | null>(null);
  const [augmentDetails, setAugmentDetails] = useState<AugmentDefinition | null>(null);
  const [upgradeDetails, setUpgradeDetails] = useState<UpgradeId | null>(null);

  // Per-mission unlock gate: each mission-kind mission unlocks one weapon
  // for purchase. See src/game/data/missionWeaponRewards.ts for the map.
  // LoadoutMenu remains ungated — owned weapons stay usable everywhere.
  const visibleWeapons = useMemo(
    () => getBuyableWeaponIds(new Set(completedMissions)).map((id) => getWeapon(id)),
    [completedMissions]
  );

  const buyableAugments = useMemo(
    () => getAllAugments().filter((a) => a.cost > 0),
    []
  );

  // Audio orchestration (shop bed + dock-arrival voice) lives in
  // `useShopAudio`, mounted at the ShopTabs level — see that hook's
  // header for the contract. ShopUI is now purely the market-tab
  // purchase view.

  // Each handler fires its sfx alongside the mutation. The buttons are
  // disabled when the player can't afford the cost, so reaching the
  // handler implies a successful purchase.
  const handleBuyShield = useCallback(() => {
    buyShieldUpgrade();
    itemSfx.upgrade();
  }, []);
  const handleBuyArmor = useCallback(() => {
    buyArmorUpgrade();
    itemSfx.upgrade();
  }, []);
  const handleBuyReactorCap = useCallback(() => {
    buyReactorCapacityUpgrade();
    itemSfx.upgrade();
  }, []);
  const handleBuyReactorRech = useCallback(() => {
    buyReactorRechargeUpgrade();
    itemSfx.upgrade();
  }, []);
  const handleBuyWeapon = useCallback((weapon: WeaponDefinition) => {
    buyWeapon(weapon.id);
    itemSfx.weapon();
  }, []);
  const handleBuyAugment = useCallback((aug: AugmentDefinition) => {
    buyAugment(aug.id);
    itemSfx.augment();
  }, []);

  return (
    <>
      <div className="grid gap-4 sm:gap-6 md:grid-cols-[1fr_1fr]">
        <ShopUpgradesSection
          ship={ship}
          credits={credits}
          onBuyShield={handleBuyShield}
          onBuyArmor={handleBuyArmor}
          onBuyReactorCapacity={handleBuyReactorCap}
          onBuyReactorRecharge={handleBuyReactorRech}
          onShowUpgradeDetails={setUpgradeDetails}
        />

        <ShopWeaponsSection
          ship={ship}
          credits={credits}
          visibleWeapons={visibleWeapons}
          onBuyWeapon={handleBuyWeapon}
          onShowWeaponDetails={setWeaponDetails}
        />

        <ShopAugmentsSection
          ship={ship}
          credits={credits}
          augments={buyableAugments}
          onBuyAugment={handleBuyAugment}
          onShowAugmentDetails={setAugmentDetails}
        />
      </div>

      {weaponDetails && (
        <WeaponDetailsModal
          weapon={weaponDetails}
          onClose={() => setWeaponDetails(null)}
        />
      )}
      {augmentDetails && (
        <AugmentDetailsModal
          augment={augmentDetails}
          context={null}
          onClose={() => setAugmentDetails(null)}
        />
      )}
      {upgradeDetails && (
        <UpgradeDetailsForId
          id={upgradeDetails}
          ship={ship}
          onClose={() => setUpgradeDetails(null)}
        />
      )}
    </>
  );
}

// Resolves an UpgradeId to the right level / cost / detail props for the
// modal so ShopUI's JSX stays flat. The exhaustive `never` check makes
// adding a 5th UpgradeId a typecheck failure here, not a silent
// "modal renders nothing" surprise.
function UpgradeDetailsForId({
  id,
  ship,
  onClose
}: {
  id: UpgradeId;
  ship: ShipConfig;
  onClose: () => void;
}) {
  const upgrade = getUpgrade(id);
  switch (id) {
    case "shield": {
      const maxed = ship.shieldLevel >= MAX_LEVEL;
      return (
        <UpgradeDetailsModal
          upgrade={upgrade}
          level={ship.shieldLevel}
          maxLevel={MAX_LEVEL}
          cost={maxed ? null : shieldUpgradeCost(ship.shieldLevel)}
          detail={`max shield ${getMaxShield(ship)}`}
          onClose={onClose}
        />
      );
    }
    case "armor": {
      const maxed = ship.armorLevel >= MAX_LEVEL;
      return (
        <UpgradeDetailsModal
          upgrade={upgrade}
          level={ship.armorLevel}
          maxLevel={MAX_LEVEL}
          cost={maxed ? null : armorUpgradeCost(ship.armorLevel)}
          detail={`max HP ${getMaxArmor(ship)}`}
          onClose={onClose}
        />
      );
    }
    case "reactor-capacity": {
      const maxed = ship.reactor.capacityLevel >= MAX_LEVEL;
      return (
        <UpgradeDetailsModal
          upgrade={upgrade}
          level={ship.reactor.capacityLevel}
          maxLevel={MAX_LEVEL}
          cost={maxed ? null : reactorCapacityCost(ship.reactor.capacityLevel)}
          detail={`max ⚡ ${getReactorCapacity(ship)}`}
          onClose={onClose}
        />
      );
    }
    case "reactor-recharge": {
      const maxed = ship.reactor.rechargeLevel >= MAX_LEVEL;
      return (
        <UpgradeDetailsModal
          upgrade={upgrade}
          level={ship.reactor.rechargeLevel}
          maxLevel={MAX_LEVEL}
          cost={maxed ? null : reactorRechargeCost(ship.reactor.rechargeLevel)}
          detail={`⚡/s ${getReactorRecharge(ship)}`}
          onClose={onClose}
        />
      );
    }
    default: {
      // Future UpgradeId additions fail the typecheck here instead of
      // silently rendering nothing. eslint-disable: the assignment is the
      // exhaustiveness check; the variable is intentionally unused.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _exhaustive: never = id;
      return null;
    }
  }
}
