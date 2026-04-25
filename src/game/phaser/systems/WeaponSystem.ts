import * as Phaser from "phaser";
import type { WeaponId } from "@/types/game";
import type { BulletPool } from "../entities/Bullet";
import { getWeapon } from "../data/weapons";

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
    friendly: boolean
  ): boolean {
    const def = getWeapon(weaponId);
    if (now - this.lastFireMs < def.fireRateMs) return false;
    this.lastFireMs = now;

    const speed = def.bulletSpeed;
    const direction = friendly ? -1 : 1;
    const count = def.projectileCount;
    const spreadRad = Phaser.Math.DegToRad(def.spreadDegrees);

    if (count === 1) {
      this.pool.spawn(originX, originY, 0, speed * direction, def.damage, friendly);
      return true;
    }

    const startAngle = -spreadRad / 2;
    const step = count > 1 ? spreadRad / (count - 1) : 0;
    for (let i = 0; i < count; i++) {
      const angle = startAngle + step * i;
      const vx = Math.sin(angle) * speed;
      const vy = Math.cos(angle) * speed * direction;
      this.pool.spawn(originX, originY, vx, vy, def.damage, friendly);
    }
    return true;
  }
}
