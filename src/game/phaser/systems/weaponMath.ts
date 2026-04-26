// Pure math helpers backing WeaponSystem. Extracted so the rate-limit and
// spread computations can be tested without instantiating Phaser.
import type { WeaponSlot } from "@/types/game";

export function canFire(now: number, lastFireMs: number, fireRateMs: number): boolean {
  return now - lastFireMs >= fireRateMs;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export interface BulletVector {
  readonly vx: number;
  readonly vy: number;
}

export function spreadVectors(
  count: number,
  spreadDegrees: number,
  speed: number,
  direction: 1 | -1
): readonly BulletVector[] {
  if (count <= 0) return [];
  if (count === 1) {
    return [{ vx: 0, vy: speed * direction }];
  }
  const spreadRad = degToRad(spreadDegrees);
  const startAngle = -spreadRad / 2;
  const step = spreadRad / (count - 1);
  const out: BulletVector[] = [];
  for (let i = 0; i < count; i++) {
    const angle = startAngle + step * i;
    out.push({
      vx: Math.sin(angle) * speed,
      vy: Math.cos(angle) * speed * direction
    });
  }
  return out;
}

// Slot-aware vector generator. Front uses straight spreadVectors. Rear flips
// the friendly base direction so bullets fly downward. Sidekick fires one
// bullet per pod at +/- 45 degrees outward, regardless of projectileCount.
const SIDEKICK_DEGREES = 45;

export function slotVectors(
  slot: WeaponSlot,
  count: number,
  spreadDegrees: number,
  speed: number,
  friendly: boolean
): readonly BulletVector[] {
  const friendlyDir: 1 | -1 = friendly ? -1 : 1;
  if (slot === "front") {
    return spreadVectors(count, spreadDegrees, speed, friendlyDir);
  }
  if (slot === "rear") {
    const flipped: 1 | -1 = friendly ? 1 : -1;
    return spreadVectors(count, spreadDegrees, speed, flipped);
  }
  // sidekick: two pods, one each side, fixed 45 deg outward — friendly fires
  // up-and-out, hostile fires down-and-out.
  const rad = degToRad(SIDEKICK_DEGREES);
  const vyMag = Math.cos(rad) * speed * friendlyDir;
  const vxMag = Math.sin(rad) * speed;
  return [
    { vx: -vxMag, vy: vyMag },
    { vx: vxMag, vy: vyMag }
  ];
}
