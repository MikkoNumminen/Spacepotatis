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

// Lateral spawn-point offset (px) between adjacent parallel projectiles when
// a weapon's base spreadDegrees is 0. Without this, the Splitter Module
// augment (extra-projectile) on a single-projectile / 0-spread weapon
// (rapid-fire, corsair-missile, boarding-snare) spawns N bullets at the
// exact same x and identical velocity — they overlap into one visual the
// entire flight, so the player can't tell the augment is doing anything.
// Pure cosmetic offset: the bullets stay parallel and converge on the
// same line of fire, but the player sees a clearly-visible salvo at launch.
const PARALLEL_FIRE_GAP_PX = 12;

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
    // For pure-parallel salvos (base spread is 0 — bullets all share angle 0)
    // we space spawns laterally so the player can see two/three bullets
    // instead of one fat bullet of overlapping sprites. Weapons with their
    // own spread (>0°) already fan out angularly, so no offset is needed.
    const parallelSalvo = def.spreadDegrees === 0 && projectileCount > 1;
    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i];
      if (!v) continue;
      const offsetX = parallelSalvo
        ? (i - (projectileCount - 1) / 2) * PARALLEL_FIRE_GAP_PX
        : 0;
      this.pool.spawn(
        originX + offsetX,
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
