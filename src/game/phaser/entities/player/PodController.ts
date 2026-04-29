import * as Phaser from "phaser";
import type { WeaponInstance } from "@/game/state/ShipConfig";
import { getWeapon } from "@/game/data/weapons";
import { slotXOffset } from "./slotLayout";

// Pods are visual-only sprites that mark the player's additional
// weapon slots in combat. One pod per slot index ≥ 1 whose equipped
// weapon declares a podSprite; absent declarations leave the slot
// invisible (today's behavior — bullets just spawn at the slot's
// offset). Pods inherit the main ship's rotation and Y-squash so
// they bank with the player.
//
// Pods own no physics body — they don't take or deal damage. The
// hitbox is still the main ship sprite. The pod's only job is to
// communicate "you have an extra gun mounted here" visually.

const POD_Y_OFFSET = 4; // sit slightly behind the main ship's nose

export class PodController {
  private readonly scene: Phaser.Scene;
  private readonly slotInstances: readonly (WeaponInstance | null)[];
  // Sparse array — index matches slot index. Slot 0 always null
  // (the main ship is the slot-0 visual). Slots without a podSprite-
  // declaring weapon are also null.
  private readonly pods: (Phaser.GameObjects.Sprite | null)[];

  constructor(scene: Phaser.Scene, slotInstances: readonly (WeaponInstance | null)[]) {
    this.scene = scene;
    this.slotInstances = slotInstances;
    this.pods = new Array(slotInstances.length).fill(null);
    this.reconcile();
  }

  // Walk the slot list and align the pod sprites to it. Creates pods
  // for slots whose new weapon declares a podSprite; destroys pods
  // when the weapon is removed or replaced with one that doesn't.
  // Cheap to call on every setSlotWeapon — only mutates when the
  // resolved sprite key changes.
  reconcile(): void {
    for (let i = 1; i < this.slotInstances.length; i++) {
      const inst = this.slotInstances[i];
      const desired = inst ? getWeapon(inst.id).podSprite : undefined;
      const existing = this.pods[i] ?? null;
      const existingKey = existing?.texture.key;
      if (desired === existingKey) continue;

      if (existing) {
        existing.destroy();
        this.pods[i] = null;
      }
      if (desired) {
        const pod = this.scene.add.sprite(0, 0, desired);
        pod.setOrigin(0.5);
        // Render below the main ship so the player sprite still pops.
        pod.setDepth(-1);
        this.pods[i] = pod;
      }
    }
  }

  // Position + orient every pod relative to the player. Called from
  // Player.preUpdate after the ship has moved this frame. Skips slot 0
  // (the main ship) and any slot without a pod.
  sync(player: Phaser.GameObjects.Sprite): void {
    for (let i = 1; i < this.pods.length; i++) {
      const pod = this.pods[i];
      if (!pod) continue;
      pod.setPosition(player.x + slotXOffset(i), player.y + POD_Y_OFFSET);
      pod.setAngle(player.angle);
      pod.setScale(player.scaleX, player.scaleY);
    }
  }

  destroy(): void {
    for (let i = 0; i < this.pods.length; i++) {
      this.pods[i]?.destroy();
      this.pods[i] = null;
    }
  }
}
