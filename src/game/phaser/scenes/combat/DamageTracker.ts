import type { WeaponId } from "@/types/game";

// Per-mission accumulator for damage dealt by each friendly weapon.
// Lives next to CombatHud / CombatVfx / DropController / PerkController
// as a per-scene peer; constructed once in CombatScene.create and
// .reset()'d at the top of CombatScene.init so a re-entered scene
// starts at zero.
//
// Fed from two CombatScene call sites (both inside the friendly-bullet
// path): the direct-hit branch in wireCollisions's onEnemyHit, and the
// AoE branch in applyBulletAoE. Both pass `bullet.weaponId` (set by
// WeaponSystem when the bullet was fired) plus the *capped* damage
// amount (caller computes `Math.min(rawDamage, hpBefore)` so overkill
// is excluded — players don't get inflated stats by oversizing one
// weapon vs a low-HP target).
//
// The Map is small (≤ 6 weapon ids in the catalog at a time) and reads
// happen only at mission end (snapshot()), so there's no perf concern.
// Hostile bullets pass weaponId=null and are silently dropped here.
export class DamageTracker {
  private readonly byWeapon = new Map<WeaponId, number>();
  private totalDamage = 0;

  /**
   * Record `applied` damage from a friendly bullet sourced from `weaponId`.
   * Calls with `weaponId === null` are no-ops (hostile damage and any
   * out-of-band friendly damage that doesn't trace to a weapon).
   */
  record(weaponId: WeaponId | null, applied: number): void {
    if (weaponId === null || applied <= 0) return;
    const prev = this.byWeapon.get(weaponId) ?? 0;
    this.byWeapon.set(weaponId, prev + applied);
    this.totalDamage += applied;
  }

  /**
   * Total damage dealt across all friendly weapons in the current
   * mission run. Cap-at-remaining-HP semantics — see record().
   */
  total(): number {
    return this.totalDamage;
  }

  /**
   * Frozen plain object suitable for embedding in CombatSummary. Keys
   * are weapon ids; values are total damage attributed to that weapon
   * over the mission.
   */
  snapshot(): Readonly<Record<WeaponId, number>> {
    const out: Partial<Record<WeaponId, number>> = {};
    for (const [id, amount] of this.byWeapon) {
      out[id] = amount;
    }
    return out as Readonly<Record<WeaponId, number>>;
  }

  /** Wipe both the per-weapon map and the running total. */
  reset(): void {
    this.byWeapon.clear();
    this.totalDamage = 0;
  }
}
