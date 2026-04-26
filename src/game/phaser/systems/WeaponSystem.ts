import type { WeaponId } from "@/types/game";
import type { SlotName } from "@/game/state/ShipConfig";
import type { BulletPool } from "../entities/Bullet";
import { getWeapon } from "../../data/weapons";
import { canFire, slotVectors } from "./weaponMath";

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

  // The `slot` parameter is the actual mount position (sidekickLeft vs
  // sidekickRight matters for direction), NOT the weapon's `slot` kind.
  // The two are checked for compatibility at equip time in GameState.
  tryFire(
    weaponId: WeaponId,
    slot: SlotName,
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
    const vectors = slotVectors(
      slot,
      projectileCount,
      def.spreadDegrees,
      def.bulletSpeed,
      friendly
    );
    const homing = def.homing
      ? { turnRateRadPerSec: (def.turnRateRadPerSec ?? 3.5) * turnRateMul }
      : null;
    const damage = def.damage * damageMul;
    for (const v of vectors) {
      this.pool.spawn(originX, originY, v.vx, v.vy, damage, friendly, homing);
    }
    return true;
  }
}
