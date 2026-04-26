import * as Phaser from "phaser";
import { SCENE_KEYS, type BootData } from "../config";

// Generates placeholder textures programmatically so the game runs without
// any art assets shipped in /public. Drop real PNGs into public/sprites and
// this file becomes a proper asset preloader.
export class BootScene extends Phaser.Scene {
  private bootData!: BootData;

  constructor() {
    super(SCENE_KEYS.Boot);
  }

  init(data: BootData): void {
    this.bootData = data;
  }

  create(): void {
    this.generateTextures();
    this.scene.start(SCENE_KEYS.Combat, this.bootData);
  }

  private generateTextures(): void {
    this.drawTriangleUp("player-ship", 0x5effa7, 36, 44);

    this.drawBullet("bullet-friendly", 0x4fd1ff, 6, 18);
    this.drawBullet("bullet-hostile", 0xff4d6d, 8, 14);

    this.drawEnemyBasic("enemy-basic", 0x8f9cff, 40);
    this.drawEnemyDiamond("enemy-zigzag", 0xff66cc, 42);
    this.drawTriangleDown("enemy-kamikaze", 0xffa040, 36, 44);
    this.drawBoss("boss-1", 0xff4d6d, 140, 100);

    this.drawPotatoPowerUp("powerup-shield", 0x4fd1ff, "ring");
    this.drawPotatoPowerUp("powerup-credit", 0xffcc33, "coin");
    this.drawPotatoPowerUp("powerup-weapon", 0x5effa7, "gear");

    this.drawMissionPerk("perk-overdrive", 0xffaa33, "bolt");
    this.drawMissionPerk("perk-hardened", 0x66aaff, "hex");
    this.drawMissionPerk("perk-emp", 0xff66cc, "pulse");

    this.drawSpark("particle-spark", 6);
  }

  private drawPotatoPowerUp(
    key: string,
    iconColor: number,
    icon: "ring" | "coin" | "gear"
  ): void {
    const size = 36;
    const g = this.add.graphics();
    // Bright gold "potato seal" frame — signals permanent ship upgrade.
    g.fillStyle(0x05060f, 0.85);
    g.fillCircle(size / 2, size / 2, size / 2);
    g.lineStyle(3, 0xffd66b, 1);
    g.strokeCircle(size / 2, size / 2, size / 2 - 1);
    g.lineStyle(1, 0xffd66b, 0.4);
    g.strokeCircle(size / 2, size / 2, size / 2 - 4);
    // Tiny "P" tab at bottom-right to mark permanent.
    g.fillStyle(0xffd66b, 1);
    g.fillTriangle(size - 6, size - 6, size + 2, size - 2, size - 2, size + 2);
    // Inner icon.
    const cx = size / 2;
    const cy = size / 2 - 1;
    if (icon === "ring") {
      g.lineStyle(3, iconColor, 1);
      g.strokeCircle(cx, cy, 7);
    } else if (icon === "coin") {
      g.fillStyle(iconColor, 1);
      g.fillCircle(cx, cy, 7);
      g.lineStyle(1.5, 0x05060f, 0.6);
      g.strokeCircle(cx, cy, 7);
    } else {
      g.fillStyle(iconColor, 1);
      g.fillCircle(cx, cy, 7.5);
      g.fillStyle(0x05060f, 1);
      g.fillCircle(cx, cy, 3);
    }
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private drawMissionPerk(
    key: string,
    iconColor: number,
    icon: "bolt" | "hex" | "pulse"
  ): void {
    const size = 36;
    const g = this.add.graphics();
    // Magenta star-like frame — signals temporary mission-only perk.
    g.fillStyle(0x05060f, 0.85);
    g.fillCircle(size / 2, size / 2, size / 2);
    const cx = size / 2;
    const cy = size / 2;
    // 8-point spiked frame instead of plain circle.
    g.lineStyle(2, 0xff66cc, 1);
    g.beginPath();
    const outerR = size / 2 - 1;
    const innerR = size / 2 - 4;
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (Math.PI / 8) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.strokePath();
    // Tiny "M" tab at bottom-right to mark mission-only.
    g.fillStyle(0xff66cc, 1);
    g.fillCircle(size - 4, size - 4, 3.5);
    // Inner icon.
    const ix = cx;
    const iy = cy;
    if (icon === "bolt") {
      g.fillStyle(iconColor, 1);
      g.beginPath();
      g.moveTo(ix + 2, iy - 8);
      g.lineTo(ix - 5, iy + 1);
      g.lineTo(ix - 1, iy + 1);
      g.lineTo(ix - 4, iy + 8);
      g.lineTo(ix + 5, iy - 1);
      g.lineTo(ix + 1, iy - 1);
      g.lineTo(ix + 4, iy - 8);
      g.closePath();
      g.fillPath();
    } else if (icon === "hex") {
      g.fillStyle(iconColor, 1);
      g.beginPath();
      const hr = 7;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const x = ix + Math.cos(a) * hr;
        const y = iy + Math.sin(a) * hr;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillPath();
    } else {
      g.lineStyle(1.5, iconColor, 1);
      g.strokeCircle(ix, iy, 7);
      g.strokeCircle(ix, iy, 4);
      g.fillStyle(iconColor, 1);
      g.fillCircle(ix, iy, 1.5);
    }
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private drawSpark(key: string, size: number): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(size / 2, size / 2, size / 2);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private drawTriangleUp(key: string, color: number, w: number, h: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, 0xffffff, 0.7);
    g.strokePath();
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private drawTriangleDown(key: string, color: number, w: number, h: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w, 0);
    g.lineTo(w / 2, h);
    g.closePath();
    g.fillPath();
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private drawBullet(key: string, color: number, w: number, h: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(0, 0, w, h, 2);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private drawEnemyBasic(key: string, color: number, size: number): void {
    const g = this.add.graphics();
    g.fillStyle(0x1b2040, 1);
    g.fillRoundedRect(0, 0, size, size, 6);
    g.fillStyle(color, 1);
    g.fillCircle(size / 2, size / 2, size * 0.3);
    g.lineStyle(2, 0xffffff, 0.6);
    g.strokeRoundedRect(1, 1, size - 2, size - 2, 6);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private drawEnemyDiamond(key: string, color: number, size: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(size / 2, 0);
    g.lineTo(size, size / 2);
    g.lineTo(size / 2, size);
    g.lineTo(0, size / 2);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, 0xffffff, 0.6);
    g.strokePath();
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private drawBoss(key: string, color: number, w: number, h: number): void {
    const g = this.add.graphics();
    g.fillStyle(0x2a0a14, 1);
    g.fillRoundedRect(0, 0, w, h, 14);
    g.fillStyle(color, 1);
    g.fillRoundedRect(10, 10, w - 20, h - 20, 10);
    g.fillStyle(0xffcc33, 1);
    g.fillCircle(w / 2, h / 2, 14);
    g.lineStyle(3, 0xffffff, 0.8);
    g.strokeRoundedRect(0, 0, w, h, 14);
    g.generateTexture(key, w, h);
    g.destroy();
  }

}
