import { weaponDps, weaponRps } from "@/game/phaser/data/weapons";
import { weaponDamageMultiplier } from "@/game/state/ShipConfig";
import type { WeaponDefinition } from "@/types/game";

// Two-column "spec sheet". Designed to make the per-bullet vs total picture
// obvious so players see WHY one weapon outclasses another. Optional `level`
// scales damage + dps by the weapon-mark multiplier; defaults to 1 (base) so
// shop "NEW WEAPONS" listings show the as-purchased numbers.
export function WeaponStats({
  weapon,
  level = 1
}: {
  weapon: WeaponDefinition;
  level?: number;
}) {
  const isMulti = weapon.projectileCount > 1;
  const mul = weaponDamageMultiplier(level);
  const damage = Math.round(weapon.damage * mul);
  const dps = Math.round(weaponDps(weapon) * mul);
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px]">
      <Stat
        label="damage"
        value={`${damage}${isMulti ? ` × ${weapon.projectileCount}` : ""}`}
      />
      <Stat label="dps" value={String(dps)} />
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
