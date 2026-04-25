import * as Phaser from "phaser";
import type { WeaponId } from "@/types/game";
import { WeaponSystem } from "../systems/WeaponSystem";
import { createKeyboardControls, type Controls } from "../systems/Controls";
import type { BulletPool } from "./Bullet";
import { getMaxArmor, getMaxShield, type ShipConfig } from "@/game/state/ShipConfig";
import { sfx } from "@/game/audio/sfx";

export const PLAYER_TEXTURE = "player-ship";

const SPEED = 360;
const SHIELD_REGEN_PER_SEC = 6;
const SHIELD_REGEN_DELAY_MS = 2000;

export class Player extends Phaser.Physics.Arcade.Sprite {
  private controls: Controls;
  private weapons: WeaponSystem;
  private weaponId: WeaponId;
  readonly maxShield: number;
  readonly maxArmor: number;

  shield: number;
  armor: number;
  private lastDamageAt = 0;

  // Mission-only perk state — reset every CombatScene boot.
  hasOverdrive = false;
  hasHardened = false;

  constructor(scene: Phaser.Scene, x: number, y: number, pool: BulletPool, ship: ShipConfig) {
    super(scene, x, y, PLAYER_TEXTURE);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setOrigin(0.5);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(this.width * 0.55, this.height * 0.65);

    this.controls = createKeyboardControls(scene);
    this.weapons = new WeaponSystem(pool);
    this.weaponId = ship.primaryWeapon;
    this.maxShield = getMaxShield(ship);
    this.maxArmor = getMaxArmor(ship);
    this.shield = this.maxShield;
    this.armor = this.maxArmor;
  }

  setWeapon(id: WeaponId): void {
    this.weaponId = id;
  }

  getWeapon(): WeaponId {
    return this.weaponId;
  }

  takeDamage(amount: number): void {
    this.lastDamageAt = this.scene.time.now;

    if (this.hasHardened) amount *= 0.7;

    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
    }
    if (amount > 0) {
      this.armor = Math.max(0, this.armor - amount);
    }

    sfx.hit();
    this.scene.cameras.main.shake(120, 0.006);
    this.setTint(0xff4d6d);
    this.scene.time.delayedCall(80, () => this.clearTint());

    if (this.armor <= 0) {
      this.scene.events.emit("playerDied");
    }
  }

  isDead(): boolean {
    return this.armor <= 0;
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    let vx = this.controls.moveX();
    let vy = this.controls.moveY();
    if (vx !== 0 && vy !== 0) {
      const inv = 1 / Math.SQRT2;
      vx *= inv;
      vy *= inv;
    }
    this.setVelocity(vx * SPEED, vy * SPEED);

    if (this.controls.firePrimary()) {
      const fireRateMul = this.hasOverdrive ? 0.66 : 1;
      if (this.weapons.tryFire(this.weaponId, this.x, this.y - 18, time, true, fireRateMul)) {
        sfx.laser();
      }
    }

    if (time - this.lastDamageAt > SHIELD_REGEN_DELAY_MS && this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + (SHIELD_REGEN_PER_SEC * delta) / 1000);
    }
  }
}
