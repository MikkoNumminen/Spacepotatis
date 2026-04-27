import type { WeaponId } from "@/types/game";
import type { SlotName } from "@/game/state/ShipConfig";
import { WeaponSystem } from "../../systems/WeaponSystem";
import { sfx } from "@/game/audio/sfx";
import type { SlotMods } from "./SlotModResolver";
import type { PlayerCombatant } from "./PlayerCombatant";

// Per-slot bullet spawn offset relative to the player sprite center. Front
// emerges from the nose, rear from the tail, sidekicks from the shoulder
// pods. slotVectors() in weaponMath then handles the firing direction per slot.
const SPAWN_OFFSET: Record<SlotName, { readonly x: number; readonly y: number }> = {
  front: { x: 0, y: -18 },
  rear: { x: 0, y: 18 },
  sidekickLeft: { x: -16, y: 0 },
  sidekickRight: { x: 16, y: 0 }
};

interface SpritePosition {
  readonly x: number;
  readonly y: number;
}

// Owns the per-slot fire-attempt path. Holds the per-slot WeaponSystem
// cooldowns plus references to the orchestrator's slot weapon and mod tables;
// when Player.setSlotWeapon mutates an entry the controller sees it through
// the shared record reference.
export class PlayerFireController {
  constructor(
    private readonly weaponsBySlot: Record<SlotName, WeaponSystem>,
    private readonly slotWeapons: Record<SlotName, WeaponId | null>,
    private readonly slotMods: Record<SlotName, SlotMods>
  ) {}

  tryFireSlot(
    slot: SlotName,
    now: number,
    overdriveMul: number,
    sprite: SpritePosition,
    combatant: PlayerCombatant
  ): void {
    const weaponId = this.slotWeapons[slot];
    if (!weaponId) return;
    const mods = this.slotMods[slot];
    if (combatant.energy < mods.energyCost) return;

    const offset = SPAWN_OFFSET[slot];
    // Overdrive's fire-rate bonus stacks multiplicatively on top of any
    // augment fire-rate modifier — both are "cooldown multipliers", so the
    // effective cooldown is base × augment × overdrive.
    const fired = this.weaponsBySlot[slot].tryFire(
      weaponId,
      slot,
      sprite.x + offset.x,
      sprite.y + offset.y,
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
      sfx.laser();
    }
  }
}
