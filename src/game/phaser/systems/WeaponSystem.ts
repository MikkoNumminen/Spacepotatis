import type { WeaponId } from "@/types/game";
import type { BulletEffect, BulletPool } from "../entities/Bullet";
import { getWeapon } from "../../data/weapons";
import { canFire, spreadVectors } from "./weaponMath";

// Per-fire modifier bag. Resolved upstream (Player) by combining the weapon's
// mark level, installed augments, and any active mission perk. Defaults are
// the identity element so callers without modifiers (e.g. tests) can pass {}.
export interface FireModifiers {
  readonly damageMul?: number;
  readonly fireRateMul?: number;
  readonly projectileBonus?: number;
  readonly turnRateMul?: number;
}

export class WeaponSystem {
  private readonly pool: BulletPool;
  private lastFireMs = 0;

  constructor(pool: BulletPool) {
    this.pool = pool;
  }

  // All weapons fire forward — the slot-direction parameter from the
  // pre-array layout is gone. Friendly fire goes up (-y), hostile down (+y).
  tryFire(
    weaponId: WeaponId,
    originX: number,
    originY: number,
    now: number,
    friendly: boolean,
    mods: FireModifiers = {}
  ): boolean {
    const def = getWeapon(weaponId);
    const damageMul = mods.damageMul ?? 1;
    const fireRateMul = mods.fireRateMul ?? 1;
    const projectileBonus = mods.projectileBonus ?? 0;
    const turnRateMul = mods.turnRateMul ?? 1;

    if (!canFire(now, this.lastFireMs, def.fireRateMs * fireRateMul)) return false;
    this.lastFireMs = now;

    const projectileCount = Math.max(1, def.projectileCount + projectileBonus);
    const direction: 1 | -1 = friendly ? -1 : 1;
    const vectors = spreadVectors(projectileCount, def.spreadDegrees, def.bulletSpeed, direction);
    const homing = def.homing
      ? { turnRateRadPerSec: (def.turnRateRadPerSec ?? 3.5) * turnRateMul }
      : null;
    const damage = def.damage * damageMul;
    // Secondary effect bag — explosion damage scales with damageMul so
    // damage-up augments amplify the AoE the same way they do direct damage.
    // Slow factor / duration are unaffected by mods today (no slow-related
    // augment exists; if one lands, plumb a slowDurationMul mod here).
    const explosionRadius = def.explosionRadius ?? 0;
    const explosionDamage = (def.explosionDamage ?? 0) * damageMul;
    const slowFactor = def.slowFactor ?? 0;
    const slowDurationMs = def.slowDurationMs ?? 0;
    const effect: BulletEffect | undefined =
      explosionRadius > 0 || slowFactor > 0
        ? { explosionRadius, explosionDamage, slowFactor, slowDurationMs }
        : undefined;
    for (const v of vectors) {
      this.pool.spawn(
        originX,
        originY,
        v.vx,
        v.vy,
        damage,
        friendly,
        homing,
        def.bulletSprite,
        def.gravity,
        effect
      );
    }
    return true;
  }
}
