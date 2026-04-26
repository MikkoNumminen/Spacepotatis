import type { WeaponId } from "@/types/game";
import type { SlotName } from "@/game/state/ShipConfig";
import type { BulletPool } from "../entities/Bullet";
import { getWeapon } from "../data/weapons";
import { canFire, slotVectors } from "./weaponMath";

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
    fireRateMul = 1,
    damageMul = 1
  ): boolean {
    const def = getWeapon(weaponId);
    if (!canFire(now, this.lastFireMs, def.fireRateMs * fireRateMul)) return false;
    this.lastFireMs = now;

    const vectors = slotVectors(
      slot,
      def.projectileCount,
      def.spreadDegrees,
      def.bulletSpeed,
      friendly
    );
    const homing = def.homing ? { turnRateRadPerSec: def.turnRateRadPerSec ?? 3.5 } : null;
    const damage = def.damage * damageMul;
    for (const v of vectors) {
      this.pool.spawn(originX, originY, v.vx, v.vy, damage, friendly, homing);
    }
    return true;
  }
}
