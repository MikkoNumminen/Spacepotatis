"use client";

import { useCallback } from "react";
import { buyArmorUpgrade, buyShieldUpgrade, buyWeapon } from "@/game/state/GameState";
import {
  MAX_LEVEL,
  armorUpgradeCost,
  getMaxArmor,
  getMaxShield,
  isWeaponUnlocked,
  shieldUpgradeCost
} from "@/game/state/ShipConfig";
import { getAllWeapons } from "@/game/phaser/data/weapons";
import { useGameState } from "@/game/state/useGameState";

export default function ShopUI() {
  const credits = useGameState((s) => s.credits);
  const ship = useGameState((s) => s.ship);

  const shieldCost = shieldUpgradeCost(ship.shieldLevel);
  const armorCost = armorUpgradeCost(ship.armorLevel);
  const shieldMaxed = ship.shieldLevel >= MAX_LEVEL;
  const armorMaxed = ship.armorLevel >= MAX_LEVEL;

  const handleBuyShield = useCallback(() => void buyShieldUpgrade(), []);
  const handleBuyArmor = useCallback(() => void buyArmorUpgrade(), []);

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
      </section>

      <section className="rounded border border-space-border bg-space-panel/70 p-5">
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display tracking-widest text-hud-green">NEW WEAPONS</h2>
          <span className="font-mono text-xs text-hud-amber">¢ {credits}</span>
        </header>

        {(() => {
          const forSale = getAllWeapons().filter((w) => !isWeaponUnlocked(ship, w.id));
          if (forSale.length === 0) {
            return (
              <p className="text-[11px] text-hud-green/60">
                All weapons unlocked. Manage them in the loadout above.
              </p>
            );
          }
          return (
            <ul className="flex flex-col gap-3">
              {forSale.map((weapon) => (
                <li key={weapon.id} className="rounded border border-space-border p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-display tracking-wider">{weapon.name}</span>
                    <span className="text-[11px] text-hud-amber">
                      dmg {weapon.damage}
                      {weapon.projectileCount > 1 ? ` × ${weapon.projectileCount}` : ""} ·{" "}
                      {Math.round(1000 / weapon.fireRateMs)} rps
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-hud-green/70">{weapon.description}</p>
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
          );
        })()}
      </section>
    </div>
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
