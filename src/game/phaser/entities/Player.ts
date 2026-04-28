import * as Phaser from "phaser";
import type { WeaponId } from "@/types/game";
import { WeaponSystem } from "../systems/WeaponSystem";
import { createKeyboardControls, type Controls } from "../systems/Controls";
import type { BulletPool } from "./Bullet";
import { type ShipConfig } from "@/game/state/ShipConfig";
import {
  resolveSlotMods,
  slotModsForGrantedWeapon,
  type SlotMods
} from "./player/SlotModResolver";
import { PlayerCombatant } from "./player/PlayerCombatant";
import { PlayerFireController } from "./player/PlayerFireController";

export const PLAYER_TEXTURE = "player-ship";

const SPEED = 360;

export class Player extends Phaser.Physics.Arcade.Sprite {
  private readonly controls: Controls;
  // One WeaponSystem per slot index keeps each weapon fireRate cooldown
  // isolated. Indexed by position in the ShipConfig.slots array.
  private readonly weaponsBySlot: WeaponSystem[];
  private readonly slotWeapons: (WeaponId | null)[];
  // Per-slot modifier cache resolved at boot (and on slot swap). Mid-mission
  // pickups always reset to neutral mods because freshly granted weapons are
  // level 1 and have no augments — upgrades and augment installs only happen
  // at the shop, never inside a combat scene.
  private readonly slotMods: SlotMods[];

  private readonly combatant: PlayerCombatant;
  private readonly fire: PlayerFireController;

  // Smoothed velocity. Set instantly when the input changes used to make the
  // ship feel weightless and snappy in a way that hurt dodge feel — eased
  // toward the input target so taps and direction changes carry a bit of
  // mass. Matches the bank/squash easing constant below for cohesion.
  private smoothedVx = 0;
  private smoothedVy = 0;

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
    // Hitbox tracks the potato silhouette, not the cyan rim glow padding.
    body.setSize(this.width * 0.55, this.height * 0.55);

    this.controls = createKeyboardControls(scene);
    this.slotWeapons = [...ship.slots];
    this.weaponsBySlot = ship.slots.map(() => new WeaponSystem(pool));
    this.slotMods = ship.slots.map((wid, i) => resolveSlotMods(i, ship, wid));

    this.combatant = new PlayerCombatant(ship);
    this.fire = new PlayerFireController(this.weaponsBySlot, this.slotWeapons, this.slotMods);
  }

  get maxShield(): number { return this.combatant.maxShield; }
  get maxArmor(): number { return this.combatant.maxArmor; }
  get maxEnergy(): number { return this.combatant.maxEnergy; }
  get energyRechargePerSec(): number { return this.combatant.energyRechargePerSec; }

  get shield(): number { return this.combatant.shield; }
  set shield(value: number) { this.combatant.shield = value; }
  get armor(): number { return this.combatant.armor; }
  set armor(value: number) { this.combatant.armor = value; }
  get energy(): number { return this.combatant.energy; }
  set energy(value: number) { this.combatant.energy = value; }

  setSlotWeapon(slotIndex: number, id: WeaponId | null): void {
    if (slotIndex < 0 || slotIndex >= this.slotWeapons.length) return;
    this.slotWeapons[slotIndex] = id;
    this.slotMods[slotIndex] = slotModsForGrantedWeapon(id);
  }

  getSlotWeapon(slotIndex: number): WeaponId | null {
    return this.slotWeapons[slotIndex] ?? null;
  }

  takeDamage(amount: number): void {
    this.combatant.takeDamage(amount, this.hasHardened, this, this.scene);
  }

  isDead(): boolean {
    return this.combatant.isDead();
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    const ix = this.controls.moveX();
    const iy = this.controls.moveY();
    let vx = ix;
    let vy = iy;
    if (vx !== 0 && vy !== 0) {
      const inv = 1 / Math.SQRT2;
      vx *= inv;
      vy *= inv;
    }

    const t = Math.min(1, delta * 0.012);
    this.smoothedVx += (vx * SPEED - this.smoothedVx) * t;
    this.smoothedVy += (vy * SPEED - this.smoothedVy) * t;
    this.setVelocity(this.smoothedVx, this.smoothedVy);

    // Bank into horizontal motion; fake pitch on vertical motion via squash/
    // stretch on Y plus a small narrowing on X when banking. Eased toward the
    // target so direction changes look like a tumble, not a snap.
    const targetAngle = ix * 18;
    const targetScaleY = 1 - iy * 0.10;
    const targetScaleX = 1 - Math.abs(ix) * 0.06;
    this.angle += (targetAngle - this.angle) * t;
    this.scaleY += (targetScaleY - this.scaleY) * t;
    this.scaleX += (targetScaleX - this.scaleX) * t;

    this.combatant.tickRegen(time, delta);

    if (this.controls.fire()) {
      const overdriveMul = this.hasOverdrive ? 0.66 : 1;
      this.fire.fireAll(time, overdriveMul, this, this.combatant);
    }
  }
}
