import * as Phaser from "phaser";
import { SCENE_KEYS, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from "../config";
import { emit } from "../events";

// Renders on top of a paused CombatScene. Owns its own input so keyboard
// handlers fire while CombatScene is frozen.
export class PauseScene extends Phaser.Scene {
  private combatKey: string = SCENE_KEYS.Combat;

  constructor() {
    super(SCENE_KEYS.Pause);
  }

  init(data: { combatKey?: string }): void {
    this.combatKey = data.combatKey ?? SCENE_KEYS.Combat;
  }

  create(): void {
    this.add.rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x05060f, 0.72).setOrigin(0);

    this.add
      .text(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 - 40, "PAUSED", {
        fontFamily: "monospace",
        fontSize: "30px",
        color: "#5effa7"
      })
      .setOrigin(0.5);

    this.add
      .text(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 + 10, "P · resume", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#d3d3ff"
      })
      .setOrigin(0.5);

    this.add
      .text(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 + 32, "ESC · abandon mission", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#ff4d6d"
      })
      .setOrigin(0.5);

    this.input.keyboard?.once("keydown-P", () => this.resume());
    this.input.keyboard?.once("keydown-ESC", () => this.abandon());
  }

  private resume(): void {
    this.scene.resume(this.combatKey);
    this.scene.stop();
  }

  private abandon(): void {
    const combat = this.scene.get(this.combatKey);
    this.scene.resume(this.combatKey);
    this.scene.stop();
    emit(combat, { type: "abandon" });
  }
}
