import * as Phaser from "phaser";
import type { MissionId } from "@/types/game";
import * as GameState from "@/game/state/GameState";
import { sfx } from "@/game/audio/sfx";
import { itemSfx } from "@/game/audio/itemSfx";
import {
  PowerUpPool,
  isPerkKind,
  type PowerUp,
  type PowerUpKind,
  type PermanentPowerUpKind
} from "../../entities/PowerUp";
import type { Enemy } from "../../entities/Enemy";
import type { Player } from "../../entities/Player";
import type { ScoreSystem } from "../../systems/ScoreSystem";
import { randomPerkId, type PerkId } from "../../../data/perks";
import { getMission } from "../../../data/missions";
import { getWeapon } from "../../../data/weapons";
import { ownsAnyOfType } from "@/game/state/ShipConfig";

export const DROP_CHANCE = 0.18;
// Of any drop, 25% is a mission perk (rare). Remaining 75% splits across
// the permanent powerups with the existing weights.
export const PERK_DROP_SHARE = 0.25;

function hexToInt(hex: string): number {
  return parseInt(hex.replace(/^#/, ""), 16);
}

export class DropController {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly missionId: MissionId,
    private readonly powerUps: PowerUpPool,
    private readonly player: () => Player,
    private readonly score: () => ScoreSystem,
    private readonly onPerk: (perk: PerkId, x: number, y: number) => void
  ) {}

  maybeDrop(enemy: Enemy): void {
    if (Math.random() >= DROP_CHANCE) return;
    const kind: PowerUpKind = this.rollDrop();
    this.powerUps.spawn(kind, enemy.x, enemy.y);
  }

  rollDrop(): PowerUpKind {
    const mission = getMission(this.missionId);
    const perksAllowed = mission.perksAllowed === true;
    if (perksAllowed && Math.random() < PERK_DROP_SHARE) {
      return { perk: randomPerkId() };
    }
    const roll = Math.random();
    const kind: PermanentPowerUpKind = roll < 0.5 ? "credit" : roll < 0.8 ? "shield" : "weapon";
    return kind;
  }

  applyPowerUp(power: PowerUp): void {
    sfx.pickup();
    if (isPerkKind(power.kind)) {
      this.onPerk(power.kind.perk, power.x, power.y);
      return;
    }
    const player = this.player();
    const score = this.score();
    switch (power.kind) {
      case "shield":
        player.shield = Math.min(
          player.maxShield,
          player.shield + player.maxShield * 0.5
        );
        this.flashPickup("+ SHIELD", 0x4fd1ff, power.x, power.y, "potato");
        break;
      case "credit":
        score.addCredits(25);
        itemSfx.money();
        this.flashPickup("+ ¢25", 0xffcc33, power.x, power.y, "potato");
        break;
      case "weapon": {
        const upgrade = this.nextWeaponUpgrade();
        if (upgrade) {
          // grantWeapon mints a fresh instance and equips it into the first
          // empty slot in GameState. Mirror that onto the live Player by
          // searching slot instances for the matching id; if every slot was
          // already full the instance sits in inventory and the live Player
          // has nothing to update.
          GameState.grantWeapon(upgrade.id);
          const slots = GameState.getState().ship.slots;
          let landedSlot = -1;
          for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            if (s && s.id === upgrade.id) { landedSlot = i; break; }
          }
          if (landedSlot >= 0) {
            player.setSlotWeapon(landedSlot, slots[landedSlot] ?? null);
          }
          itemSfx.weapon();
          this.flashPickup(
            `+ ${upgrade.name.toUpperCase()}`,
            hexToInt(upgrade.tint),
            power.x,
            power.y,
            "potato"
          );
        } else {
          // Already maxed on weapons — convert pickup to credits so the player
          // is never penalized by a duplicate.
          score.addCredits(50);
          itemSfx.money();
          this.flashPickup("+ ¢50", 0xffcc33, power.x, power.y, "potato");
        }
        break;
      }
    }
  }

  flashPickup(
    text: string,
    color: number,
    x: number,
    y: number,
    category: "potato" | "mission" = "potato"
  ): void {
    const hex = `#${color.toString(16).padStart(6, "0")}`;
    const tag = category === "potato" ? "POTATO UPGRADE" : "MISSION ONLY";
    const tagColor = category === "potato" ? "#ffd66b" : "#ff66cc";

    const name = this.scene.add.text(x, y - 14, text, {
      fontFamily: "monospace",
      fontSize: "14px",
      fontStyle: "bold",
      color: hex
    });
    name.setOrigin(0.5, 1);

    const subtitle = this.scene.add.text(x, y, tag, {
      fontFamily: "monospace",
      fontSize: "10px",
      color: tagColor
    });
    subtitle.setOrigin(0.5, 1);

    this.scene.tweens.add({
      targets: [name, subtitle],
      y: `-=44`,
      alpha: 0,
      duration: 1100,
      ease: "cubic.out",
      onComplete: () => {
        name.destroy();
        subtitle.destroy();
      }
    });
  }

  // Walks the fixed weapon-pickup ladder (rapid-fire → spread-shot →
  // heavy-cannon) and returns the first weapon the player doesn't yet own
  // ANY copy of, or null when the ladder is exhausted. Uses ownsAnyOfType
  // because a weapon "type" can have multiple independent instances now,
  // but the pickup ladder still gates on whether the player has touched
  // this kind at all.
  private nextWeaponUpgrade() {
    const order: Array<"rapid-fire" | "spread-shot" | "heavy-cannon"> = [
      "rapid-fire",
      "spread-shot",
      "heavy-cannon"
    ];
    const ship = GameState.getState().ship;
    for (const id of order) {
      if (!ownsAnyOfType(ship, id)) return getWeapon(id);
    }
    return null;
  }
}
