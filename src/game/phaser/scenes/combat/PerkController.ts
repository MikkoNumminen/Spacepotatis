import * as Phaser from "phaser";
import { sfx } from "@/game/audio/sfx";
import type { BulletPool } from "../../entities/Bullet";
import type { Player } from "../../entities/Player";
import { PERKS, type PerkId } from "../../../data/perks";

export interface PerkState {
  readonly activePerks: ReadonlySet<PerkId>;
  readonly empCharges: number;
}

export class PerkController {
  private empCharges = 0;
  private readonly activePerks: Set<PerkId> = new Set();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: () => Player,
    private readonly enemyBullets: () => BulletPool,
    private readonly onPickup: (text: string, color: number, x: number, y: number) => void,
    private readonly onChange: () => void
  ) {}

  apply(perkId: PerkId, x: number, y: number): void {
    const def = PERKS[perkId];
    switch (perkId) {
      case "overdrive":
        this.player().hasOverdrive = true;
        break;
      case "hardened":
        this.player().hasHardened = true;
        break;
      case "emp":
        this.empCharges += 1;
        break;
    }
    this.activePerks.add(perkId);
    this.onPickup(`+ ${def.name.toUpperCase()}`, def.tint, x, y);
    this.onChange();
  }

  triggerActive(): void {
    if (this.empCharges <= 0) return;
    this.empCharges -= 1;
    this.detonateEmp();
    if (this.empCharges <= 0) this.activePerks.delete("emp");
    this.onChange();
  }

  getState(): PerkState {
    return { activePerks: this.activePerks, empCharges: this.empCharges };
  }

  private detonateEmp(): void {
    // Clear every active enemy bullet on screen.
    this.enemyBullets().children.iterate((child) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b.active) b.disableBody(true, true);
      return true;
    });
    // Visual flash centred on the player.
    const player = this.player();
    const flash = this.scene.add.graphics();
    flash.fillStyle(PERKS.emp.tint, 0.45);
    flash.fillCircle(player.x, player.y, 24);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: flash,
      scale: 28,
      alpha: 0,
      duration: 480,
      ease: "cubic.out",
      onComplete: () => flash.destroy()
    });
    this.scene.cameras.main.flash(120, 255, 200, 240, false);
    sfx.explosion();
  }
}
