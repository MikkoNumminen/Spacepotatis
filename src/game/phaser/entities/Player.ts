import * as Phaser from "phaser";
import type { WeaponId } from "@/types/game";
import { WeaponSystem } from "../systems/WeaponSystem";
import { createKeyboardControls, type Controls } from "../systems/Controls";
import type { BulletPool } from "./Bullet";
import { type ShipConfig, type SlotName } from "@/game/state/ShipConfig";
import {
  NEUTRAL_SLOT_MODS,
  resolveSlotMods,
  slotModsForGrantedWeapon,
  type SlotMods
} from "./player/SlotModResolver";
import { PlayerCombatant } from "./player/PlayerCombatant";
import { PlayerFireController } from "./player/PlayerFireController";

export const PLAYER_TEXTURE = "player-ship";

const SPEED = 360;

export class Player extends Phaser.Physics.Arcade.Sprite {
  private controls: Controls;
  // One WeaponSystem per slot keeps each weapon fireRate cooldown isolated.
  private weaponsBySlot: Record<SlotName, WeaponSystem>;
  private slotWeapons: Record<SlotName, WeaponId | null>;
  // Per-slot modifier cache resolved at boot (and on slot swap). Mid-mission
  // pickups always reset to neutral mods because freshly granted weapons are
  // level 1 and have no augments — upgrades and augment installs only happen
  // at the shop, never inside a combat scene.
  private slotMods: Record<SlotName, SlotMods> = {
    front: NEUTRAL_SLOT_MODS,
    rear: NEUTRAL_SLOT_MODS,
    sidekickLeft: NEUTRAL_SLOT_MODS,
    sidekickRight: NEUTRAL_SLOT_MODS
  };

  private readonly combatant: PlayerCombatant;
  private readonly fire: PlayerFireController;

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
    for (const slot of Object.keys(this.slotWeapons) as SlotName[]) {
      this.slotMods[slot] = resolveSlotMods(slot, ship, this.slotWeapons[slot]);
    }

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

  setSlotWeapon(slot: SlotName, id: WeaponId | null): void {
    this.slotWeapons[slot] = id;
    this.slotMods[slot] = slotModsForGrantedWeapon(id);
  }

  getSlotWeapon(slot: SlotName): WeaponId | null {
    return this.slotWeapons[slot];
  }

  takeDamage(amount: number): void {
    this.combatant.takeDamage(amount, this.hasHardened, this, this.scene);
  }

  isDead(): boolean {
    return this.combatant.isDead();
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

    this.combatant.tickRegen(time, delta);

    const overdriveMul = this.hasOverdrive ? 0.66 : 1;
    if (this.controls.firePrimary()) {
      this.fire.tryFireSlot("front", time, overdriveMul, this, this.combatant);
    }
    if (this.controls.fireSecondary()) {
      // Twin sidekick pods fire together. Each pod has its own WeaponSystem
      // cooldown, so different weapons in left/right slots fire independently.
      this.fire.tryFireSlot("sidekickLeft", time, overdriveMul, this, this.combatant);
      this.fire.tryFireSlot("sidekickRight", time, overdriveMul, this, this.combatant);
    }
    if (this.controls.fireTertiary()) {
      this.fire.tryFireSlot("rear", time, overdriveMul, this, this.combatant);
    }
  }
}
