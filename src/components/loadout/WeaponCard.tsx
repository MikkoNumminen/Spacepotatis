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
  // getSellPrice now folds in the instance's level-history + installed
  // augments so an upgraded free-starter (e.g. Mk3 Potato Cannon) refunds
  // the upgrade investment instead of resolving to 0 and hiding the SELL
  // button.
  const sellPrice = getSellPrice(instance, weapon);
  const sellable = showSellButton && sellPrice > 0;
  const atMaxLevel = level >= MAX_LEVEL;
  const upgradeCost = atMaxLevel ? null : weaponUpgradeCost(level);
  const canAffordUpgrade = upgradeCost !== null && credits >= upgradeCost;

  const slotsFree = MAX_AUGMENTS_PER_WEAPON - installedAugments.length;
  const eligibleInventory = augmentInventory.filter((id) => !installedAugments.includes(id));
  const canInstall = showInstallButton && slotsFree > 0 && eligibleInventory.length > 0;

  // Folds in mark + augments to mirror what the weapon actually fires like —
  // the player compares DPS / energy at a glance from this row.
  const markMul = weaponDamageMultiplier(level);
  const effects = foldAugmentEffects(installedAugments);
  const projectileTotal = weapon.projectileCount + effects.projectileBonus;
  const fireRateMs = weapon.fireRateMs * effects.fireRateMul;
  const dps = Math.round(weapon.damage * markMul * effects.damageMul * projectileTotal * (1000 / fireRateMs));
  const energy = Math.max(1, Math.round(weapon.energyCost * effects.energyMul));

  return (
    <>
      <li className="rounded border border-space-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {/* Row header: chips around the dot+name identity in a deliberate
              reading order — slot (where) → tier (quality class) → name
              (what) → mark (upgrade level). Each chip explicitly names its
              concept (`TIER 2`, `MARK 3`) so the player learns the
              vocabulary; no abbreviated single letters that need a tooltip. */}
          {slotBadge && (
            <span className="shrink-0 rounded border border-hud-green/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-hud-green/80">
              {slotBadge}
            </span>
          )}
          <TierBadge tier={weapon.tier} />
          <WeaponDot tint={weapon.tint} />
          <span className="font-display text-sm tracking-wider truncate">{weapon.name}</span>
          {level > 1 && (
            <span
              className="shrink-0 rounded border border-hud-green/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-hud-green/80"
              title={`Mark ${level} — weapon upgrade level. Each Mark adds damage; max Mark ${MAX_LEVEL}.`}
            >
              MARK {level}
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="font-mono text-[11px] text-hud-green/70">
              <span
                className="text-hud-amber"
                title="Damage per second — folds in projectile count, fire rate, mark level, and installed augments."
              >
                DPS {dps}
              </span>
              <span className="mx-1.5 text-hud-green/30">·</span>
              <span title="Energy cost per shot. Drains the reactor; recharges over time.">
                ⚡ {energy}
              </span>
            </div>
            <AugmentSummary installed={installedAugments} />
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
                INSTALL AUGMENTS
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
                  UPGRADE TO Mk{level + 1} · ¢{upgradeCost}
                </button>
              ))}
            {/* SELL slot — fixed-width wrapper so DETAILS / INSTALL /
                UPGRADE column-align across EQUIPPED and INVENTORY rows
                regardless of whether SELL renders, and regardless of the
                price's character count (¢225 vs ¢4500 vs blank). The
                button itself is right-aligned within the slot via
                `justify-end` on the wrapper. Width sized for "SELL · ¢9999"
                at the 11px monospace font; smaller prices leave trailing
                empty space inside the slot. */}
            <div className="flex w-[6.5rem] justify-end">
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
  const slotsLeft = MAX_AUGMENTS_PER_WEAPON - installed.length;
  const slotsTitle =
    `Augments installed (max ${MAX_AUGMENTS_PER_WEAPON} per weapon). ` +
    `${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} free. ` +
    `Augments are PERMANENT once installed — they can't be removed or moved to another weapon.`;
  const namesTitle = installed.length === 0 ? undefined :
    `Installed augments — permanent, sold with the weapon.`;
  // Count rendered as a chip with the same border/padding/typography as
  // SLOT / TIER / MARK so the right-side augment summary visually rhymes
  // with the left-side row header instead of floating loose at a
  // different baseline height.
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="shrink-0 rounded border border-hud-green/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-hud-green/80"
        title={slotsTitle}
      >
        {installed.length}/{MAX_AUGMENTS_PER_WEAPON}
      </span>
      <div className="flex items-center gap-1">
        {installed.map((id, idx) => {
          const aug = getAugment(id);
          return <AugmentDot key={`${id}-${idx}`} tint={aug.tint} title={aug.name} />;
        })}
      </div>
      {installed.length > 0 && (
        <span
          className="font-mono text-[10px] text-hud-amber/70 truncate"
          title={namesTitle}
        >
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
  const title = tier === 1
    ? "Tier 1 — starter / potato-family weapons. Always sold in tutorial-system shops."
    : "Tier 2 — pirate-haul weapons. Only available in shops past the tutorial system.";
  return (
    <span
      aria-label={`Tier ${tier}`}
      title={title}
      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${cls}`}
    >
      TIER {tier}
    </span>
  );
}
