import type { WeaponInstance } from "@/game/state/ShipConfig";
import { WeaponSystem } from "../../systems/WeaponSystem";
import { sfx } from "@/game/audio/sfx";
import type { SlotMods } from "./SlotModResolver";
import type { PlayerCombatant } from "./PlayerCombatant";
import { slotXOffset } from "./slotLayout";

const SPAWN_Y_OFFSET = -18;

interface SpritePosition {
  readonly x: number;
  readonly y: number;
}

// Owns the per-slot fire-attempt path. Holds the per-slot WeaponSystem
// cooldowns plus references to the orchestrator's slot instance and mod
// arrays; when Player.setSlotWeapon mutates an entry the controller sees it
// through the shared array reference.
export class PlayerFireController {
  constructor(
    private readonly weaponsBySlot: WeaponSystem[],
    private readonly slotInstances: (WeaponInstance | null)[],
    private readonly slotMods: SlotMods[]
  ) {}

  // Fire one slot. Returns true if a shot left the barrel (caller can
  // aggregate across slots and play the laser sfx exactly once per tick).
  tryFireSlot(
    slotIndex: number,
    now: number,
    overdriveMul: number,
    sprite: SpritePosition,
    combatant: PlayerCombatant
  ): boolean {
    const instance = this.slotInstances[slotIndex];
    if (!instance) return false;
    const mods = this.slotMods[slotIndex];
    if (!mods) return false;
    if (combatant.energy < mods.energyCost) return false;

    const xOffset = slotXOffset(slotIndex);
    // Overdrive's fire-rate bonus stacks multiplicatively on top of any
    // augment fire-rate modifier — both are "cooldown multipliers", so the
    // effective cooldown is base × augment × overdrive.
    const fired = this.weaponsBySlot[slotIndex]?.tryFire(
      instance.id,
      sprite.x + xOffset,
      sprite.y + SPAWN_Y_OFFSET,
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
      combatant.energy = Math.max(0, combatant.energy - mods.energyCost);
    }
    return Boolean(fired);
  }

  // Fire every active slot in sequence. The caller owns the laser sfx —
  // this method just plays it once if at least one slot fired this tick.
  fireAll(
    now: number,
    overdriveMul: number,
    sprite: SpritePosition,
    combatant: PlayerCombatant
  ): void {
    let firedAny = false;
    for (let i = 0; i < this.slotInstances.length; i++) {
      if (this.tryFireSlot(i, now, overdriveMul, sprite, combatant)) firedAny = true;
    }
    if (firedAny) sfx.laser();
  }
}
