"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buyArmorUpgrade,
  buyAugment,
  buyReactorCapacityUpgrade,
  buyReactorRechargeUpgrade,
  buyShieldUpgrade,
  buyWeapon,
  markStorySeen,
  saveNow,
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
import { STORY_ENTRIES } from "@/game/data";
import { itemSfx, menuMusic, shopMusic, storyAudio } from "@/game/audio";
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
  const seenStoryEntries = useGameState((s) => s.seenStoryEntries);
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

  // Plays the on-shop-open briefing every time the player docks (any shop
  // → /shop). The seen-set is consulted only to decide whether to mark
  // seen + save (first dock) — the audio plays unconditionally so a
  // returning player still gets the welcome line on every visit.
  // Empty dep array intentionally: fire once on mount, cleanup stops
  // the voice if the player navigates away mid-playback.
  useEffect(() => {
    const entry = STORY_ENTRIES.find((e) => e.autoTrigger?.kind === "on-shop-open");
    if (!entry) return;
    storyAudio.play({
      musicSrc: entry.musicTrack,
      voiceSrc: entry.voiceTrack,
      voiceDelayMs: entry.voiceDelayMs
    });
    if (!seenStoryEntries.includes(entry.id)) {
      markStorySeen(entry.id);
      void saveNow();
    }
    return () => {
      storyAudio.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shop bed: ducks the menu/galaxy bed and plays /audio/music/shop.ogg
  // for the duration of the visit. Per-shop music is a future change —
  // when it lands, swap the hard-coded path for a per-mission lookup.
  useEffect(() => {
    menuMusic.duck();
    shopMusic.loadTrack("/audio/music/shop.ogg");
    return () => {
      shopMusic.stop();
      menuMusic.unduck();
    };
  }, []);

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
