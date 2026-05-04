import { useState } from "react";
import {
  buyWeaponUpgrade,
  getSellPrice,
  sellWeapon
} from "@/game/state/GameState";
import {
  MAX_LEVEL,
  weaponDamageMultiplier,
  weaponUpgradeCost,
  type WeaponInstance,
  type WeaponPosition
} from "@/game/state/ShipConfig";
import {
  MAX_AUGMENTS_PER_WEAPON,
  foldAugmentEffects,
  getAugment
} from "@/game/data/augments";
import type { AugmentId, WeaponDefinition } from "@/types/game";
import { AugmentDot, WeaponDot } from "./dots";
import { WeaponDetailsModal } from "./WeaponDetailsModal";

// Compact loadout/inventory row. The full spec sheet + flavour description
// live behind the DETAILS modal so the list scans at a glance.
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
  const [detailsOpen, setDetailsOpen] = useState(false);
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

  // One-line summary that surfaces the numbers a player compares at a
  // glance — DPS, energy cost, augment fill. Folds in mark + augments to
  // mirror what the weapon actually fires like.
  const markMul = weaponDamageMultiplier(level);
  const effects = foldAugmentEffects(installedAugments);
  const projectileTotal = weapon.projectileCount + effects.projectileBonus;
  const fireRateMs = weapon.fireRateMs * effects.fireRateMul;
  const dps = Math.round(weapon.damage * markMul * effects.damageMul * projectileTotal * (1000 / fireRateMs));
  const energy = Math.max(1, Math.round(weapon.energyCost * effects.energyMul));

  return (
    <>
      <li className="rounded border border-space-border px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-2 min-w-0">
            <WeaponDot tint={weapon.tint} />
            <span className="font-display text-sm tracking-wider truncate">{weapon.name}</span>
            <TierBadge tier={weapon.tier} />
            {slotBadge && (
              <span className="text-[10px] uppercase tracking-widest text-hud-green/50">
                {slotBadge}
              </span>
            )}
            {level > 1 && (
              <span className="rounded border border-hud-green/40 px-1 py-0.5 font-mono text-[9px] text-hud-green/80">
                Mk {level}
              </span>
            )}
          </div>
          <AugmentSummary installed={installedAugments} />
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="font-mono text-[11px] text-hud-green/70">
            <span className="text-hud-amber">DPS {dps}</span>
            <span className="mx-1.5 text-hud-green/30">·</span>
            <span>⚡ {energy}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="touch-manipulation select-none rounded border border-hud-green/40 px-2 py-0.5 font-mono text-[11px] text-hud-green/80 hover:bg-hud-green/10 active:bg-hud-green/20"
            >
              DETAILS
            </button>
            {canInstall && (
              <button
                type="button"
                onClick={onOpenInstaller}
                className="touch-manipulation select-none rounded border border-hud-green/60 px-2 py-0.5 font-mono text-[11px] text-hud-green hover:bg-hud-green/10 active:bg-hud-green/20"
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
                  className="touch-manipulation select-none rounded border border-hud-amber/60 px-2 py-0.5 font-mono text-[11px] text-hud-amber enabled:hover:bg-hud-amber/10 enabled:active:bg-hud-amber/20 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
                >
                  UPG Mk{level + 1} · ¢{upgradeCost}
                </button>
              ))}
            {sellable && position.kind === "inventory" && (
              <button
                type="button"
                onClick={() => void sellWeapon(position.index)}
                className="touch-manipulation select-none rounded border border-hud-red/60 px-2 py-0.5 font-mono text-[11px] text-hud-red hover:bg-hud-red/10 active:bg-hud-red/20"
              >
                SELL · ¢{sellPrice}
              </button>
            )}
          </div>
        </div>
      </li>
      {detailsOpen && (
        <WeaponDetailsModal
          weapon={weapon}
          level={level}
          augmentIds={installedAugments}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </>
  );
}

function AugmentSummary({ installed }: { installed: readonly AugmentId[] }) {
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
      </div>
      {installed.length > 0 && (
        <span className="font-mono text-[10px] text-hud-amber/70 truncate">
          {installed.map((id) => getAugment(id).name).join(" · ")}
        </span>
      )}
    </div>
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
      className={`rounded border px-1 py-0.5 font-mono text-[9px] uppercase tracking-widest ${cls}`}
    >
      T{tier}
    </span>
  );
}
