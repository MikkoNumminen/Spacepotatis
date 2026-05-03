import { weaponDamageMultiplier } from "@/game/state/ShipConfig";
import { foldAugmentEffects, getAugment } from "@/game/data/augments";
import type { AugmentId, WeaponDefinition } from "@/types/game";

// Two-column "spec sheet". Designed to make the per-bullet vs total picture
// obvious so players see WHY one weapon outclasses another. Optional `level`
// scales damage + dps by the weapon-mark multiplier; defaults to 1 (base) so
// shop "NEW WEAPONS" listings show the as-purchased numbers. Optional
// `augmentIds` folds installed augment effects into the displayed numbers
// (damage, dps, fire rate, energy) so the loadout view reflects what the
// weapon actually fires like.
export function WeaponStats({
  weapon,
  level = 1,
  augmentIds = []
}: {
  weapon: WeaponDefinition;
  level?: number;
  augmentIds?: readonly AugmentId[];
}) {
  const isMulti = weapon.projectileCount > 1;
  const markMul = weaponDamageMultiplier(level);
  const effects = foldAugmentEffects(augmentIds);

  const hasAugments = augmentIds.length > 0;
  const baseDamage = weapon.damage * markMul;
  const damage = Math.round(baseDamage * effects.damageMul);
  const projectileTotal = weapon.projectileCount + effects.projectileBonus;
  const fireRateMs = weapon.fireRateMs * effects.fireRateMul;
  const dps = Math.round(baseDamage * effects.damageMul * projectileTotal * (1000 / fireRateMs));
  const rps = Math.round((1000 / fireRateMs) * 10) / 10;
  const energy = Math.max(1, Math.round(weapon.energyCost * effects.energyMul));

  // AoE / slow surface — only show when the weapon ships with the matching
  // optional fields. Damage scales by mark + augments to mirror what the
  // engine actually fires (see WeaponSystem.tryFire's explosionDamage * damageMul).
  const explosionRadius = weapon.explosionRadius ?? 0;
  const baseExplosionDamage = weapon.explosionDamage ?? 0;
  const explosionDamage = Math.round(baseExplosionDamage * markMul * effects.damageMul);
  const slowFactor = weapon.slowFactor ?? 0;
  const slowDurationMs = weapon.slowDurationMs ?? 0;
  const showBlast = explosionRadius > 0;
  const showSlow = slowFactor > 0 && slowDurationMs > 0;

  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px]">
      <Stat
        label="damage"
        value={`${damage}${projectileTotal > 1 ? ` × ${projectileTotal}` : ""}`}
      />
      <Stat label="dps" value={String(dps)} />
      <Stat label="fire rate" value={`${rps} rps`} />
      <Stat label="energy" value={`⚡ ${energy}`} />
      {isMulti || effects.projectileBonus > 0 ? (
        <Stat label="spread" value={`${weapon.spreadDegrees}°`} />
      ) : (
        <Stat label="bullet speed" value={String(weapon.bulletSpeed)} />
      )}
      {showBlast && (
        <Stat label="blast" value={`⌀ ${explosionRadius}px · ${explosionDamage} dmg`} />
      )}
      {showSlow && (
        <Stat
          label="slow"
          value={`${Math.round(slowFactor * 100)}% · ${(slowDurationMs / 1000).toFixed(1)}s`}
        />
      )}
      {hasAugments && (
        <div className="col-span-2 mt-1 text-[10px] text-hud-amber/70">
          augment{augmentIds.length === 1 ? "" : "s"}:{" "}
          {augmentIds.map((id) => getAugment(id).name).join(" · ")}
        </div>
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
