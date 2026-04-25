import type { WeaponId } from "@/types/game";
import type { BulletPool } from "../entities/Bullet";
import { getWeapon } from "../data/weapons";
import { canFire, spreadVectors } from "./weaponMath";

export class WeaponSystem {
  private readonly pool: BulletPool;
  private lastFireMs = 0;

  constructor(pool: BulletPool) {
    this.pool = pool;
  }

  tryFire(
    weaponId: WeaponId,
    originX: number,
    originY: number,
    now: number,
    friendly: boolean,
    fireRateMul = 1
  ): boolean {
    const def = getWeapon(weaponId);
    if (!canFire(now, this.lastFireMs, def.fireRateMs * fireRateMul)) return false;
    this.lastFireMs = now;

    const direction = friendly ? -1 : 1;
    const vectors = spreadVectors(def.projectileCount, def.spreadDegrees, def.bulletSpeed, direction);
    for (const v of vectors) {
      this.pool.spawn(originX, originY, v.vx, v.vy, def.damage, friendly);
    }
    return true;
  }
}
