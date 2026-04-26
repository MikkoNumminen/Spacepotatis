import * as Phaser from "phaser";
import type { WeaponId } from "@/types/game";
import { WeaponSystem } from "../systems/WeaponSystem";
import { createKeyboardControls, type Controls } from "../systems/Controls";
import type { BulletPool } from "./Bullet";
import {
  getInstalledAugments,
  getMaxArmor,
  getMaxShield,
  getReactorCapacity,
  getReactorRecharge,
  getWeaponLevel,
  weaponDamageMultiplier,
  type ShipConfig,
  type SlotName
} from "@/game/state/ShipConfig";
import { getWeapon } from "../../data/weapons";
import { foldAugmentEffects, NEUTRAL_AUGMENT_EFFECTS } from "../../data/augments";
import { sfx } from "@/game/audio/sfx";

export const PLAYER_TEXTURE = "player-ship";

const SPEED = 360;
const SHIELD_REGEN_PER_SEC = 6;
const SHIELD_REGEN_DELAY_MS = 2000;

// Per-slot bullet spawn offset relative to the player sprite center. Front
// emerges from the nose, rear from the tail, sidekicks from the shoulder
// pods. slotVectors() in weaponMath then handles the firing direction per slot.
const SPAWN_OFFSET: Record<SlotName, { readonly x: number; readonly y: number }> = {
  front: { x: 0, y: -18 },
  rear: { x: 0, y: 18 },
  sidekickLeft: { x: -16, y: 0 },
  sidekickRight: { x: 16, y: 0 }
};

// Pre-resolved per-slot modifier cache. Combines mark-level damage scaling
// with the folded effects of every augment installed on the slot's weapon.
// `energyCost` is the effective integer cost per shot (floored at 1) so the
// fire path doesn't repeat the rounding each tick.
interface SlotMods {
  readonly damageMul: number;
  readonly fireRateMul: number;
  readonly projectileBonus: number;
  readonly energyCost: number;
  readonly turnRateMul: number;
}

const NEUTRAL_SLOT_MODS: SlotMods = {
  damageMul: 1,
  fireRateMul: 1,
  projectileBonus: 0,
  energyCost: 0,
  turnRateMul: 1
};

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
    for (const slot of Object.keys(this.slotWeapons) as SlotName[]) {
      this.slotMods[slot] = this.resolveSlotMods(slot, ship);
    }

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
    // Mid-mission pickups grant a fresh level-1 weapon with no augments, so
    // the slot resets to neutral mods. The energy cost falls back to the
    // weapon's base cost; null clears mods entirely.
    if (id === null) {
      this.slotMods[slot] = NEUTRAL_SLOT_MODS;
    } else {
      const def = getWeapon(id);
      this.slotMods[slot] = {
        ...NEUTRAL_SLOT_MODS,
        energyCost: def.energyCost
      };
    }
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

    const overdriveMul = this.hasOverdrive ? 0.66 : 1;
    if (this.controls.firePrimary()) {
      this.tryFireSlot("front", time, overdriveMul);
    }
    if (this.controls.fireSecondary()) {
      // Twin sidekick pods fire together. Each pod has its own WeaponSystem
      // cooldown, so different weapons in left/right slots fire independently.
      this.tryFireSlot("sidekickLeft", time, overdriveMul);
      this.tryFireSlot("sidekickRight", time, overdriveMul);
    }
    if (this.controls.fireTertiary()) {
      this.tryFireSlot("rear", time, overdriveMul);
    }

    if (time - this.lastDamageAt > SHIELD_REGEN_DELAY_MS && this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + (SHIELD_REGEN_PER_SEC * delta) / 1000);
    }
  }

  private resolveSlotMods(slot: SlotName, ship: ShipConfig): SlotMods {
    const wid = this.slotWeapons[slot];
    if (!wid) return NEUTRAL_SLOT_MODS;
    const def = getWeapon(wid);
    const installed = getInstalledAugments(ship, wid);
    const effects = installed.length === 0 ? NEUTRAL_AUGMENT_EFFECTS : foldAugmentEffects(installed);
    const levelMul = weaponDamageMultiplier(getWeaponLevel(ship, wid));
    return {
      damageMul: levelMul * effects.damageMul,
      fireRateMul: effects.fireRateMul,
      projectileBonus: effects.projectileBonus,
      energyCost: Math.max(1, Math.round(def.energyCost * effects.energyMul)),
      turnRateMul: effects.turnRateMul
    };
  }

  private tryFireSlot(slot: SlotName, now: number, overdriveMul: number): void {
    const weaponId = this.slotWeapons[slot];
    if (!weaponId) return;
    const mods = this.slotMods[slot];
    if (this.energy < mods.energyCost) return;

    const offset = SPAWN_OFFSET[slot];
    // Overdrive's fire-rate bonus stacks multiplicatively on top of any
    // augment fire-rate modifier — both are "cooldown multipliers", so the
    // effective cooldown is base × augment × overdrive.
    const fired = this.weaponsBySlot[slot].tryFire(
      weaponId,
      slot,
      this.x + offset.x,
      this.y + offset.y,
      now,
      true,
      {
        damageMul: mods.damageMul,
        fireRateMul: mods.fireRateMul * overdriveMul,
        projectileBonus: mods.projectileBonus,
        turnRateMul: mods.turnRateMul
      }
    );
    if (fired) {
      this.energy = Math.max(0, this.energy - mods.energyCost);
      sfx.laser();
    }
  }
}
