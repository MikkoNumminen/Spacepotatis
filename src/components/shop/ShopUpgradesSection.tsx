"use client";

import {
  MAX_LEVEL,
  getMaxArmor,
  getMaxShield,
  getReactorCapacity,
  getReactorRecharge
} from "@/game/state";
import type { ShipConfig } from "@/game/state";
import {
  armorUpgradeCost,
  reactorCapacityCost,
  reactorRechargeCost,
  shieldUpgradeCost,
  type UpgradeId
} from "@/game/data";
import { CatalogSection } from "@/components/ui/CatalogSection";

// Hull/reactor upgrade row. Mirrors the weapon-row upgrade button shape so
// the player learns one visual pattern across all upgrade surfaces:
//   not maxed: amber "UPGRADE TO Mk{N+1} · ¢{cost}" pill (price folded
//              into the button so the eye lands on one control, not three).
//   maxed:    "Mk {maxLevel} maxed" span (no button — there's nothing to do).
//
// `cost === null` is the single source of truth for "maxed" — derives
// from the parent's `cost={maxed ? null : actualCost}` shape and lets
// TS narrow `cost` to `number` inside the not-maxed branch. The previous
// `level >= maxLevel` derivation didn't narrow, so the button could
// silently render `¢ null` if a future caller passed cost: null while
// not maxed.
function Row({
  label,
  detail,
  level,
  maxLevel,
  cost,
  disabled,
  onClick,
  onDetails
}: {
  label: string;
  detail: string;
  level: number;
  maxLevel: number;
  cost: number | null;
  disabled: boolean;
  onClick: () => void;
  // When provided, renders a "DETAILS" pill before the upgrade control
  // that opens the per-upgrade modal (with Grandma voiceover).
  onDetails?: () => void;
}) {
  const maxed = cost === null;
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded border border-space-border p-3">
      <div className="min-w-0">
        <div className="font-display tracking-wider">{label}</div>
        <div className="text-xs text-hud-green/70">{detail}</div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {onDetails && (
          <button
            type="button"
            onClick={onDetails}
            className="touch-manipulation select-none rounded border border-hud-green/40 px-2 py-0.5 font-mono text-[11px] text-hud-green/80 hover:bg-hud-green/10 active:bg-hud-green/20"
          >
            DETAILS
          </button>
        )}
        {maxed ? (
          <span className="font-mono text-[11px] text-hud-green/50">
            Mk {maxLevel} maxed
          </span>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="touch-manipulation select-none rounded border border-hud-amber/60 px-2 py-0.5 font-mono text-[11px] text-hud-amber enabled:hover:bg-hud-amber/10 enabled:active:bg-hud-amber/20 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
          >
            UPGRADE TO Mk{level + 1} · ¢{cost}
          </button>
        )}
      </div>
    </div>
  );
}

export function ShopUpgradesSection({
  ship,
  credits,
  onBuyShield,
  onBuyArmor,
  onBuyReactorCapacity,
  onBuyReactorRecharge,
  onShowUpgradeDetails
}: {
  ship: ShipConfig;
  credits: number;
  onBuyShield: () => void;
  onBuyArmor: () => void;
  onBuyReactorCapacity: () => void;
  onBuyReactorRecharge: () => void;
  onShowUpgradeDetails: (id: UpgradeId) => void;
}) {
  const shieldCost = shieldUpgradeCost(ship.shieldLevel);
  const armorCost = armorUpgradeCost(ship.armorLevel);
  const reactorCapCost = reactorCapacityCost(ship.reactor.capacityLevel);
  const reactorRechCost = reactorRechargeCost(ship.reactor.rechargeLevel);
  const shieldMaxed = ship.shieldLevel >= MAX_LEVEL;
  const armorMaxed = ship.armorLevel >= MAX_LEVEL;
  const reactorCapMaxed = ship.reactor.capacityLevel >= MAX_LEVEL;
  const reactorRechMaxed = ship.reactor.rechargeLevel >= MAX_LEVEL;

  return (
    <CatalogSection title="HULL & SHIELD">
      <Row
        label="Shield capacity"
        detail={`level ${ship.shieldLevel}/${MAX_LEVEL} · max ${getMaxShield(ship)}`}
        level={ship.shieldLevel}
        maxLevel={MAX_LEVEL}
        cost={shieldMaxed ? null : shieldCost}
        disabled={shieldMaxed || credits < shieldCost}
        onClick={onBuyShield}
        onDetails={() => onShowUpgradeDetails("shield")}
      />
      <Row
        label="Armor plating"
        detail={`level ${ship.armorLevel}/${MAX_LEVEL} · max HP ${getMaxArmor(ship)}`}
        level={ship.armorLevel}
        maxLevel={MAX_LEVEL}
        cost={armorMaxed ? null : armorCost}
        disabled={armorMaxed || credits < armorCost}
        onClick={onBuyArmor}
        onDetails={() => onShowUpgradeDetails("armor")}
      />

      <h3 className="mt-5 mb-2 font-display text-xs tracking-widest text-hud-amber">REACTOR</h3>
      <Row
        label="Reactor capacity"
        detail={`level ${ship.reactor.capacityLevel}/${MAX_LEVEL} · max ⚡ ${getReactorCapacity(ship)}`}
        level={ship.reactor.capacityLevel}
        maxLevel={MAX_LEVEL}
        cost={reactorCapMaxed ? null : reactorCapCost}
        disabled={reactorCapMaxed || credits < reactorCapCost}
        onClick={onBuyReactorCapacity}
        onDetails={() => onShowUpgradeDetails("reactor-capacity")}
      />
      <Row
        label="Reactor recharge"
        detail={`level ${ship.reactor.rechargeLevel}/${MAX_LEVEL} · ⚡/s ${getReactorRecharge(ship)}`}
        level={ship.reactor.rechargeLevel}
        maxLevel={MAX_LEVEL}
        cost={reactorRechMaxed ? null : reactorRechCost}
        disabled={reactorRechMaxed || credits < reactorRechCost}
        onClick={onBuyReactorRecharge}
        onDetails={() => onShowUpgradeDetails("reactor-recharge")}
      />
    </CatalogSection>
  );
}
