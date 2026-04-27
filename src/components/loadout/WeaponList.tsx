import {
  getInstalledAugments,
  getWeaponLevel,
  type ShipConfig
} from "@/game/state/ShipConfig";
import type { AugmentId, WeaponDefinition, WeaponId } from "@/types/game";
import { WeaponCard } from "./WeaponCard";

export type WeaponListEntry = {
  weapon: WeaponDefinition;
  key: string;
  slotBadge?: string;
};

export function WeaponList({
  ship,
  credits,
  entries,
  heading,
  showSellButton,
  showUpgradeButton,
  showInstallButton,
  onOpenInstaller
}: {
  ship: ShipConfig;
  credits: number;
  entries: readonly WeaponListEntry[];
  heading?: string;
  showSellButton: boolean;
  showUpgradeButton: boolean;
  showInstallButton: boolean;
  onOpenInstaller: (weaponId: WeaponId) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <>
      {heading && (
        <h3 className="mt-6 mb-2 font-display text-xs tracking-widest text-hud-green/70">
          {heading}
        </h3>
      )}
      <ul className="flex flex-col gap-3">
      {entries.map(({ weapon, key, slotBadge }) => {
        const level = getWeaponLevel(ship, weapon.id);
        const installed: readonly AugmentId[] = getInstalledAugments(ship, weapon.id);
        return (
          <WeaponCard
            key={key}
            weapon={weapon}
            level={level}
            credits={credits}
            showSellButton={showSellButton}
            showUpgradeButton={showUpgradeButton}
            showInstallButton={showInstallButton}
            installedAugments={installed}
            augmentInventory={ship.augmentInventory}
            onOpenInstaller={() => onOpenInstaller(weapon.id)}
            slotBadge={slotBadge}
          />
        );
      })}
      </ul>
    </>
  );
}
