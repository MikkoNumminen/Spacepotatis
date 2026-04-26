import * as Phaser from "phaser";
import type { WeaponId } from "@/types/game";
import { WeaponSystem } from "../systems/WeaponSystem";
import { createKeyboardControls, type Controls } from "../systems/Controls";
import type { BulletPool } from "./Bullet";
import {
  getMaxArmor,
  getMaxShield,
  getReactorCapacity,
  getReactorRecharge,
  type ShipConfig,
  type SlotName
} from "@/game/state/ShipConfig";
import { getWeapon } from "../data/weapons";
import { sfx } from "@/game/audio/sfx";

export const PLAYER_TEXTURE = "player-ship";

const SPEED = 360;
const SHIELD_REGEN_PER_SEC = 6;
const SHIELD_REGEN_DELAY_MS = 2000;

// Slots that have firing wired up today. The rear + sidekick slots equip via
// the loadout UI but do not actually shoot yet — see TODO in tryFireSlot().
const ACTIVE_FIRE_SLOTS: readonly SlotName[] = ["front"];

export class Player extends Phaser.Physics.Arcade.Sprite {
  private controls: Controls;
  // One WeaponSystem per slot keeps each weapon fireRate cooldown isolated.
  private weaponsBySlot: Record<SlotName, WeaponSystem>;
  private slotWeapons: Record<SlotName, WeaponId | null>;

  readonly maxShield: number;
  readonly maxArmor: number;
  readonly maxEnergy: number;
  readonly energyRechargePerSec: number;

  shield: number;
  armor: number;
  energy: number;
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
    this.weaponsBySlot = {
      front: new WeaponSystem(pool),
      rear: new WeaponSystem(pool),
      sidekickLeft: new WeaponSystem(pool),
      sidekickRight: new WeaponSystem(pool)
    };
    this.slotWeapons = {
      front: ship.slots.front,
      rear: ship.slots.rear,
      sidekickLeft: ship.slots.sidekickLeft,
      sidekickRight: ship.slots.sidekickRight
    };

    this.maxShield = getMaxShield(ship);
    this.maxArmor = getMaxArmor(ship);
    this.maxEnergy = getReactorCapacity(ship);
    this.energyRechargePerSec = getReactorRecharge(ship);

    this.shield = this.maxShield;
    this.armor = this.maxArmor;
    this.energy = this.maxEnergy;
  }

  setSlotWeapon(slot: SlotName, id: WeaponId | null): void {
    this.slotWeapons[slot] = id;
  }

  getSlotWeapon(slot: SlotName): WeaponId | null {
    return this.slotWeapons[slot];
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

    // Recharge first so a fire that arrives this tick can use the new energy.
    if (this.energy < this.maxEnergy) {
      this.energy = Math.min(
        this.maxEnergy,
        this.energy + (this.energyRechargePerSec * delta) / 1000
      );
    }

    if (this.controls.firePrimary()) {
      const fireRateMul = this.hasOverdrive ? 0.66 : 1;
      // TODO: wire dedicated fire keys for rear + sidekick slots. For MVP only
      // the front slot fires on Space; the loadout UI lets the player equip
      // the other slots, but they are inert until those keybinds land.
      for (const slot of ACTIVE_FIRE_SLOTS) {
        this.tryFireSlot(slot, time, fireRateMul);
      }
    }

    if (time - this.lastDamageAt > SHIELD_REGEN_DELAY_MS && this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + (SHIELD_REGEN_PER_SEC * delta) / 1000);
    }
  }

  private tryFireSlot(slot: SlotName, now: number, fireRateMul: number): void {
    const weaponId = this.slotWeapons[slot];
    if (!weaponId) return;
    const def = getWeapon(weaponId);
    if (this.energy < def.energyCost) return;

    const fired = this.weaponsBySlot[slot].tryFire(weaponId, this.x, this.y - 18, now, true, fireRateMul);
    if (fired) {
      this.energy = Math.max(0, this.energy - def.energyCost);
      sfx.laser();
    }
  }
}
