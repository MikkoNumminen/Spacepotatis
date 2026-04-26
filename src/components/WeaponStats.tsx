import { weaponDps, weaponRps } from "@/game/phaser/data/weapons";
import type { WeaponDefinition } from "@/types/game";

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
      <Stat label="energy" value={`⚡ ${weapon.energyCost}`} />
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
