import * as Phaser from "phaser";
import { SCENE_KEYS, VIRTUAL_HEIGHT, VIRTUAL_WIDTH, type BootData } from "../config";
import { getSummary } from "../registry";

export class ResultScene extends Phaser.Scene {
  private bootData!: BootData;

  constructor() {
    super(SCENE_KEYS.Result);
  }

  init(data: BootData): void {
    this.bootData = data;
  }

  create(): void {
    const summary = getSummary(this.game);

    this.add.rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x05060f, 0.9).setOrigin(0);

    const title = summary?.victory ? "MISSION COMPLETE" : "MISSION FAILED";
    const color = summary?.victory ? "#5effa7" : "#ff4d6d";

    const titleText = this.add
      .text(VIRTUAL_WIDTH / 2, 160, title, {
        fontFamily: "monospace",
        fontSize: "34px",
        color
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({ targets: titleText, alpha: 1, y: 140, duration: 350, ease: "Power2" });

    const scoreRow = this.makeRow(230, "Score   ");
    const creditsRow = this.makeRow(260, "Credits ");
    const timeRow = this.makeRow(290, "Time    ");

    if (summary) {
      this.countUp(scoreRow, "Score   ", summary.score, 900);
      this.countUp(creditsRow, "Credits ", summary.credits, 900);
      this.countUp(timeRow, "Time    ", summary.timeSeconds, 600, "s");
    } else {
      scoreRow.setText("No result data.");
    }

    const prompt = this.add
      .text(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 120, "Press SPACE or click to return", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#ffcc33"
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.35,
      duration: 700,
      yoyo: true,
      repeat: -1
    });

    const finish = () => this.bootData.onComplete();
    this.input.keyboard?.once("keydown-SPACE", finish);
    this.input.once("pointerdown", finish);
  }

  private makeRow(y: number, initial: string): Phaser.GameObjects.Text {
    return this.add
      .text(VIRTUAL_WIDTH / 2, y, `${initial}0`, {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#d3d3ff"
      })
      .setOrigin(0.5);
  }

  private countUp(
    text: Phaser.GameObjects.Text,
    prefix: string,
    target: number,
    durationMs: number,
    suffix = ""
  ): void {
    const obj = { v: 0 };
    this.tweens.add({
      targets: obj,
      v: target,
      duration: durationMs,
      ease: "Cubic.out",
      onUpdate: () => {
        text.setText(`${prefix}${Math.round(obj.v)}${suffix}`);
      }
    });
  }
}
