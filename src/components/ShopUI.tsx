"use client";

import { useCallback } from "react";
import {
  buyArmorUpgrade,
  buyAugment,
  buyReactorCapacityUpgrade,
  buyReactorRechargeUpgrade,
  buyShieldUpgrade,
  buyWeapon
} from "@/game/state/GameState";
import {
  MAX_LEVEL,
  armorUpgradeCost,
  getMaxArmor,
  getMaxShield,
  getReactorCapacity,
  getReactorRecharge,
  reactorCapacityCost,
  reactorRechargeCost,
  shieldUpgradeCost
} from "@/game/state/ShipConfig";
import { getAllWeapons } from "@/game/data/weapons";
import { getAllAugments } from "@/game/data/augments";
import { useGameState } from "@/game/state/useGameState";
import { WeaponStats } from "@/components/WeaponStats";

export default function ShopUI() {
  const credits = useGameState((s) => s.credits);
  const ship = useGameState((s) => s.ship);

  const shieldCost = shieldUpgradeCost(ship.shieldLevel);
  const armorCost = armorUpgradeCost(ship.armorLevel);
  const reactorCapCost = reactorCapacityCost(ship.reactor.capacityLevel);
  const reactorRechCost = reactorRechargeCost(ship.reactor.rechargeLevel);
  const shieldMaxed = ship.shieldLevel >= MAX_LEVEL;
  const armorMaxed = ship.armorLevel >= MAX_LEVEL;
  const reactorCapMaxed = ship.reactor.capacityLevel >= MAX_LEVEL;
  const reactorRechMaxed = ship.reactor.rechargeLevel >= MAX_LEVEL;

  const handleBuyShield = useCallback(() => void buyShieldUpgrade(), []);
  const handleBuyArmor = useCallback(() => void buyArmorUpgrade(), []);
  const handleBuyReactorCap = useCallback(() => void buyReactorCapacityUpgrade(), []);
  const handleBuyReactorRech = useCallback(() => void buyReactorRechargeUpgrade(), []);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
      <section className="rounded border border-space-border bg-space-panel/70 p-5">
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display tracking-widest text-hud-green">HULL & SHIELD</h2>
          <span className="font-mono text-xs text-hud-amber">¢ {credits}</span>
        </header>

        <Row
          label="Shield capacity"
          detail={`level ${ship.shieldLevel}/${MAX_LEVEL} · max ${getMaxShield(ship)}`}
          cost={shieldMaxed ? null : shieldCost}
          disabled={shieldMaxed || credits < shieldCost}
          onClick={handleBuyShield}
          cta={shieldMaxed ? "maxed" : "UPGRADE"}
        />
        <Row
          label="Armor plating"
          detail={`level ${ship.armorLevel}/${MAX_LEVEL} · max HP ${getMaxArmor(ship)}`}
          cost={armorMaxed ? null : armorCost}
          disabled={armorMaxed || credits < armorCost}
          onClick={handleBuyArmor}
          cta={armorMaxed ? "maxed" : "UPGRADE"}
        />

        <h3 className="mt-5 mb-2 font-display text-xs tracking-widest text-hud-amber">REACTOR</h3>
        <Row
          label="Reactor capacity"
          detail={`level ${ship.reactor.capacityLevel}/${MAX_LEVEL} · max ⚡ ${getReactorCapacity(ship)}`}
          cost={reactorCapMaxed ? null : reactorCapCost}
          disabled={reactorCapMaxed || credits < reactorCapCost}
          onClick={handleBuyReactorCap}
          cta={reactorCapMaxed ? "maxed" : "UPGRADE"}
        />
        <Row
          label="Reactor recharge"
          detail={`level ${ship.reactor.rechargeLevel}/${MAX_LEVEL} · ⚡/s ${getReactorRecharge(ship)}`}
          cost={reactorRechMaxed ? null : reactorRechCost}
          disabled={reactorRechMaxed || credits < reactorRechCost}
          onClick={handleBuyReactorRech}
          cta={reactorRechMaxed ? "maxed" : "UPGRADE"}
        />
      </section>

      <section className="rounded border border-space-border bg-space-panel/70 p-5">
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display tracking-widest text-hud-green">NEW WEAPONS</h2>
          <span className="font-mono text-xs text-hud-amber">¢ {credits}</span>
        </header>

        <ul className="flex flex-col gap-3">
          {getAllWeapons().map((weapon) => (
            <li key={weapon.id} className="rounded border border-space-border p-3">
              <div className="font-display tracking-wider">{weapon.name}</div>
              <WeaponStats weapon={weapon} />
              <p className="mt-2 text-[11px] text-hud-green/70">{weapon.description}</p>
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={credits < weapon.cost}
                  onClick={() => void buyWeapon(weapon.id)}
                  className="rounded border border-hud-amber/60 px-3 py-1 text-xs text-hud-amber enabled:hover:bg-hud-amber/10 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
                >
                  BUY · ¢ {weapon.cost}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded border border-space-border bg-space-panel/70 p-5 md:col-span-2">
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display tracking-widest text-hud-green">AUGMENTS</h2>
          <span className="font-mono text-xs text-hud-amber">¢ {credits}</span>
        </header>

        <p className="mb-3 text-[11px] text-hud-green/60">
          Permanent weapon modifiers. Once installed they cannot be moved or sold —
          choose carefully. You may stock multiple copies in inventory.
        </p>

        <ul className="flex flex-col gap-3">
          {getAllAugments()
            .filter((a) => a.cost > 0)
            .map((aug) => (
              <li
                key={aug.id}
                className="flex items-start justify-between gap-3 rounded border border-space-border p-3"
              >
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <AugmentDot tint={aug.tint} />
                    <span className="font-display tracking-wider">{aug.name}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-hud-green/70">{aug.description}</p>
                </div>
                <button
                  type="button"
                  disabled={credits < aug.cost}
                  onClick={() => void buyAugment(aug.id)}
                  className="shrink-0 rounded border border-hud-amber/60 px-3 py-1 text-xs text-hud-amber enabled:hover:bg-hud-amber/10 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
                >
                  BUY · ¢ {aug.cost}
                </button>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

function AugmentDot({ tint }: { tint: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: tint, boxShadow: `0 0 4px ${tint}` }}
    />
  );
}

function Row({
  label,
  detail,
  cost,
  disabled,
  onClick,
  cta
}: {
  label: string;
  detail: string;
  cost: number | null;
  disabled: boolean;
  onClick: () => void;
  cta: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between rounded border border-space-border p-3">
      <div>
        <div className="font-display tracking-wider">{label}</div>
        <div className="text-[11px] text-hud-green/70">{detail}</div>
      </div>
      <div className="flex items-center gap-3">
        {cost !== null && <span className="text-xs text-hud-amber">¢ {cost}</span>}
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className="rounded border border-hud-green/60 px-3 py-1 text-xs enabled:hover:bg-hud-green/10 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
        >
          {cta}
        </button>
      </div>
    </div>
  );
}
