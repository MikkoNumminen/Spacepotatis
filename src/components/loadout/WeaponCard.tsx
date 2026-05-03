import {
  buyWeaponUpgrade,
  getSellPrice,
  sellWeapon
} from "@/game/state/GameState";
import {
  MAX_LEVEL,
  weaponUpgradeCost,
  type WeaponInstance,
  type WeaponPosition
} from "@/game/state/ShipConfig";
import { MAX_AUGMENTS_PER_WEAPON, getAugment } from "@/game/data/augments";
import { WeaponStats } from "@/components/WeaponStats";
import type { AugmentId, WeaponDefinition } from "@/types/game";
import { AugmentDot, WeaponDot } from "./dots";

export function WeaponCard({
  weapon,
  instance,
  position,
  credits,
  showSellButton,
  showUpgradeButton,
  showInstallButton,
  augmentInventory,
  onOpenInstaller,
  slotBadge
}: {
  weapon: WeaponDefinition;
  instance: WeaponInstance;
  position: WeaponPosition;
  credits: number;
  showSellButton: boolean;
  showUpgradeButton: boolean;
  showInstallButton: boolean;
  augmentInventory: readonly AugmentId[];
  onOpenInstaller: () => void;
  slotBadge?: string;
}) {
  const level = instance.level;
  const installedAugments = instance.augments;
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
          <TierBadge tier={weapon.tier} />
          {slotBadge && (
            <span className="text-[10px] uppercase tracking-widest text-hud-green/50">
              {slotBadge}
            </span>
          )}
        </div>
        <MarkBadge level={level} />
      </div>
      <WeaponStats weapon={weapon} level={level} augmentIds={installedAugments} />
      <p className="mt-2 text-xs text-hud-green/70">{weapon.description}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <AugmentChips installed={installedAugments} />
        <div className="flex flex-wrap items-center gap-2">
          {canInstall && (
            <button
              type="button"
              onClick={onOpenInstaller}
              className="touch-manipulation select-none rounded border border-hud-green/60 px-3 py-1 text-xs text-hud-green hover:bg-hud-green/10 active:bg-hud-green/20"
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
                onClick={() => void buyWeaponUpgrade(position)}
                className="touch-manipulation select-none rounded border border-hud-amber/60 px-3 py-1 text-xs text-hud-amber enabled:hover:bg-hud-amber/10 enabled:active:bg-hud-amber/20 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
              >
                UPGRADE Mk{level + 1} · ¢ {upgradeCost}
              </button>
            ))}
          {sellable && position.kind === "inventory" && (
            <button
              type="button"
              onClick={() => void sellWeapon(position.index)}
              className="touch-manipulation select-none rounded border border-hud-red/60 px-3 py-1 text-xs text-hud-red hover:bg-hud-red/10 active:bg-hud-red/20"
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

function TierBadge({ tier }: { tier: 1 | 2 }) {
  const cls =
    tier === 1
      ? "border-hud-green/40 text-hud-green/70"
      : "border-hud-amber/50 text-hud-amber/80";
  return (
    <span
      aria-label={`Tier ${tier}`}
      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${cls}`}
    >
      T{tier}
    </span>
  );
}
