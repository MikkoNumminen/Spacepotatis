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

    this.drawRing("powerup-shield", 0x4fd1ff, 24);
    this.drawCoin("powerup-credit", 0xffcc33, 20);
    this.drawGear("powerup-weapon", 0x5effa7, 24);

    this.drawSpark("particle-spark", 6);
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

  private drawRing(key: string, color: number, size: number): void {
    const g = this.add.graphics();
    g.lineStyle(4, color, 1);
    g.strokeCircle(size / 2, size / 2, size / 2 - 2);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private drawCoin(key: string, color: number, size: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillCircle(size / 2, size / 2, size / 2);
    g.lineStyle(2, 0xffffff, 0.8);
    g.strokeCircle(size / 2, size / 2, size / 2 - 1);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private drawGear(key: string, color: number, size: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillCircle(size / 2, size / 2, size / 2);
    g.fillStyle(0x05060f, 1);
    g.fillCircle(size / 2, size / 2, size / 4);
    g.generateTexture(key, size, size);
    g.destroy();
  }
}
