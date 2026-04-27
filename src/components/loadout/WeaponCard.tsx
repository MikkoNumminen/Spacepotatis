import {
  buyWeaponUpgrade,
  getSellPrice,
  sellWeapon
} from "@/game/state/GameState";
import { MAX_LEVEL, weaponUpgradeCost } from "@/game/state/ShipConfig";
import { MAX_AUGMENTS_PER_WEAPON, getAugment } from "@/game/data/augments";
import { WeaponStats } from "@/components/WeaponStats";
import type { AugmentId, WeaponDefinition } from "@/types/game";
import { AugmentDot, WeaponDot } from "./dots";

export function WeaponCard({
  weapon,
  level,
  credits,
  showSellButton,
  showUpgradeButton,
  showInstallButton,
  installedAugments,
  augmentInventory,
  onOpenInstaller,
  slotBadge
}: {
  weapon: WeaponDefinition;
  level: number;
  credits: number;
  showSellButton: boolean;
  showUpgradeButton: boolean;
  showInstallButton: boolean;
  installedAugments: readonly AugmentId[];
  augmentInventory: readonly AugmentId[];
  onOpenInstaller: () => void;
  slotBadge?: string;
}) {
  const sellPrice = getSellPrice(weapon);
  const sellable = showSellButton && sellPrice > 0;
  const atMaxLevel = level >= MAX_LEVEL;
  const upgradeCost = atMaxLevel ? null : weaponUpgradeCost(level);
  const canAffordUpgrade = upgradeCost !== null && credits >= upgradeCost;

  const slotsFree = MAX_AUGMENTS_PER_WEAPON - installedAugments.length;
  const eligibleInventory = augmentInventory.filter((id) => !installedAugments.includes(id));
  const canInstall = showInstallButton && slotsFree > 0 && eligibleInventory.length > 0;

  return (
    <li className="rounded border border-space-border p-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <WeaponDot tint={weapon.tint} />
          <span className="font-display tracking-wider">{weapon.name}</span>
          {slotBadge && (
            <span className="text-[10px] uppercase tracking-widest text-hud-green/50">
              {slotBadge}
            </span>
          )}
        </div>
        <MarkBadge level={level} />
      </div>
      <WeaponStats weapon={weapon} level={level} augmentIds={installedAugments} />
      <p className="mt-2 text-[11px] text-hud-green/70">{weapon.description}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <AugmentChips installed={installedAugments} />
        <div className="flex items-center gap-2">
          {canInstall && (
            <button
              type="button"
              onClick={onOpenInstaller}
              className="rounded border border-hud-green/60 px-3 py-1 text-xs text-hud-green hover:bg-hud-green/10"
            >
              INSTALL
            </button>
          )}
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
      </div>
    </li>
  );
}

function AugmentChips({ installed }: { installed: readonly AugmentId[] }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[10px] text-hud-green/50">
        {installed.length}/{MAX_AUGMENTS_PER_WEAPON}
      </span>
      <div className="flex items-center gap-1">
        {installed.map((id, idx) => {
          const aug = getAugment(id);
          return <AugmentDot key={`${id}-${idx}`} tint={aug.tint} title={aug.name} />;
        })}
        {installed.length === 0 && (
          <span className="font-mono text-[10px] text-hud-green/40">no augments</span>
        )}
      </div>
    </div>
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
