"use client";

import { getSellPrice, selectWeapon, sellWeapon } from "@/game/state/GameState";
import { isWeaponUnlocked } from "@/game/state/ShipConfig";
import { getAllWeapons, weaponDps, weaponRps } from "@/game/phaser/data/weapons";
import { useGameState } from "@/game/state/useGameState";
import type { WeaponDefinition } from "@/types/game";

interface Props {
  // "market" enables Sell buttons on owned, non-equipped, non-starter weapons.
  // "equip" hides them — used in the galaxy-view loadout modal.
  mode: "equip" | "market";
}

export default function LoadoutMenu({ mode }: Props) {
  const credits = useGameState((s) => s.credits);
  const ship = useGameState((s) => s.ship);

  const owned = getAllWeapons().filter((w) => isWeaponUnlocked(ship, w.id));

  return (
    <section className="rounded border border-space-border bg-space-panel/70 p-5">
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display tracking-widest text-hud-green">SHIP LOADOUT</h2>
        <span className="font-mono text-xs text-hud-amber">¢ {credits}</span>
      </header>

      <ul className="flex flex-col gap-3">
        {owned.map((weapon) => {
          const equipped = ship.primaryWeapon === weapon.id;
          const sellPrice = getSellPrice(weapon);
          const sellable = mode === "market" && !equipped && sellPrice > 0;

          return (
            <li
              key={weapon.id}
              className={`rounded border p-3 ${
                equipped ? "border-hud-green/60 bg-hud-green/5" : "border-space-border"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                  <WeaponDot tint={weapon.tint} />
                  <span className="font-display tracking-wider">{weapon.name}</span>
                </div>
              </div>
              <WeaponStats weapon={weapon} />
              <p className="mt-2 text-[11px] text-hud-green/70">{weapon.description}</p>
              <div className="mt-2 flex items-center justify-end gap-2">
                {sellable && (
                  <button
                    type="button"
                    onClick={() => void sellWeapon(weapon.id)}
                    className="rounded border border-hud-red/60 px-3 py-1 text-xs text-hud-red hover:bg-hud-red/10"
                  >
                    SELL · ¢ {sellPrice}
                  </button>
                )}
                <button
                  type="button"
                  disabled={equipped}
                  onClick={() => void selectWeapon(weapon.id)}
                  className="rounded border border-hud-green/60 px-3 py-1 text-xs enabled:hover:bg-hud-green/10 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
                >
                  {equipped ? "EQUIPPED" : "EQUIP"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WeaponDot({ tint }: { tint: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: tint, boxShadow: `0 0 6px ${tint}` }}
    />
  );
}

// Two-column "spec sheet". Designed to make the per-bullet vs total picture
// obvious so players see WHY one weapon outclasses another.
export function WeaponStats({ weapon }: { weapon: WeaponDefinition }) {
  const isMulti = weapon.projectileCount > 1;
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px]">
      <Stat
        label="damage"
        value={`${weapon.damage}${isMulti ? ` × ${weapon.projectileCount}` : ""}`}
      />
      <Stat label="dps" value={String(weaponDps(weapon))} />
      <Stat label="fire rate" value={`${weaponRps(weapon)} rps`} />
      {isMulti ? (
        <Stat label="spread" value={`${weapon.spreadDegrees}°`} />
      ) : (
        <Stat label="bullet speed" value={String(weapon.bulletSpeed)} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-hud-green/60">{label}</span>
      <span className="text-hud-amber">{value}</span>
    </div>
  );
}
