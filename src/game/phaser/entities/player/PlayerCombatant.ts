import * as Phaser from "phaser";
import {
  getMaxArmor,
  getMaxShield,
  getReactorCapacity,
  getReactorRecharge,
  type ShipConfig
} from "@/game/state/ShipConfig";
import { emit } from "../../events";
import { sfx } from "@/game/audio/sfx";

export const SHIELD_REGEN_PER_SEC = 6;
export const SHIELD_REGEN_DELAY_MS = 2000;

// Holds the player's defensive resources (shield/armor/energy) and the
// damage/regen logic that mutates them. Composed onto Player rather than
// inherited; the orchestrator exposes passthrough getters/setters so scenes
// can keep reading `player.shield` etc.
export class PlayerCombatant {
  readonly maxShield: number;
  readonly maxArmor: number;
  readonly maxEnergy: number;
  readonly energyRechargePerSec: number;

  shield: number;
  armor: number;
  energy: number;
  private lastDamageAt = 0;

  constructor(ship: ShipConfig) {
    this.maxShield = getMaxShield(ship);
    this.maxArmor = getMaxArmor(ship);
    this.maxEnergy = getReactorCapacity(ship);
    this.energyRechargePerSec = getReactorRecharge(ship);

    this.shield = this.maxShield;
    this.armor = this.maxArmor;
    this.energy = this.maxEnergy;
  }

  takeDamage(
    amount: number,
    hasHardened: boolean,
    sprite: Phaser.GameObjects.Sprite,
    scene: Phaser.Scene
  ): void {
    this.lastDamageAt = scene.time.now;

    if (hasHardened) amount *= 0.7;

    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
    }
    if (amount > 0) {
      this.armor = Math.max(0, this.armor - amount);
    }

    sfx.hit();
    scene.cameras.main.shake(120, 0.006);
    sprite.setTint(0xff4d6d);
    scene.time.delayedCall(80, () => sprite.clearTint());

    if (this.armor <= 0) {
      emit(scene, { type: "playerDied" });
    }
  }

  isDead(): boolean {
    return this.armor <= 0;
  }

  // Recharge first so a fire that arrives this tick can use the new energy.
  tickRegen(time: number, delta: number): void {
    if (this.energy < this.maxEnergy) {
      this.energy = Math.min(
        this.maxEnergy,
        this.energy + (this.energyRechargePerSec * delta) / 1000
      );
    }
    if (time - this.lastDamageAt > SHIELD_REGEN_DELAY_MS && this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + (SHIELD_REGEN_PER_SEC * delta) / 1000);
    }
  }
}
