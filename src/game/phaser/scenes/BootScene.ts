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
    this.drawPotatoShip("player-ship");

    this.drawBullet("bullet-friendly", 0x4fd1ff, 6, 18);
    this.drawBullet("bullet-hostile", 0xff4d6d, 8, 14);
    this.drawPotatoBullet("bullet-potato");
    this.drawIdahoPotatoBullet("bullet-potato-idaho");
    this.drawYukonGoldBullet("bullet-potato-yukon");
    this.drawRedBlissBullet("bullet-potato-redbliss");
    this.drawChantenayBullet("bullet-carrot-chantenay");
    this.drawImperatorBullet("bullet-carrot-imperator");
    this.drawNantesBullet("bullet-carrot-nantes");
    this.drawTokyoCrossBullet("bullet-turnip-tokyo");
    this.drawMilanPurpleTopBullet("bullet-turnip-milan");
    this.drawPotatoPod("pod-potato");
    this.drawCarrotPod("pod-carrot");
    this.drawTurnipPod("pod-turnip");

    this.drawAphid("enemy-aphid",       { size: 32, body: 0x9acd32, accent: 0x5a7d1a });
    this.drawAphid("enemy-aphid-giant", { size: 50, body: 0x88c020, accent: 0x3e5c10 });
    this.drawAphid("enemy-aphid-queen", { size: 60, body: 0x6fb320, accent: 0x3a4f0e, crown: 0xffcc33 });
    this.drawAphid("enemy-aphid-empress", { size: 110, body: 0xc8e030, accent: 0x4a5e10, crown: 0xffd84a });

    this.drawBeetle("enemy-beetle-scarab", { size: 44, body: 0x4a6b3a, accent: 0x223018, ornament: "dome",      ornamentColor: 0xb8d488 });
    this.drawBeetle("enemy-beetle-rhino",  { size: 46, body: 0x8b3a2a, accent: 0x4d1f15, ornament: "horn",      ornamentColor: 0x1a1008 });
    this.drawBeetle("enemy-beetle-stag",   { size: 50, body: 0x4a3a6b, accent: 0x231a36, ornament: "mandibles", ornamentColor: 0x140a22 });

    this.drawCaterpillar("enemy-caterpillar-hornworm", { segR: 9,  body: 0x6fb02a, accent: 0x2f4a14, segments: 6, hornColor: 0x2f4a14 });
    this.drawCaterpillar("enemy-caterpillar-army",     { segR: 8,  body: 0x4a5c1a, accent: 0x1f2810, segments: 5, stripeColor: 0xc0d050 });
    this.drawCaterpillar("enemy-caterpillar-monarch",  { segR: 18, body: 0xffd64a, accent: 0x1a1a1a, segments: 7, stripeColor: 0x1a1a1a });

    this.drawSpider("enemy-spider-wolf",   { size: 18, body: 0x6b4a2a, accent: 0x2e1f10 });
    this.drawSpider("enemy-spider-widow",  { size: 20, body: 0x141420, accent: 0x05050a, marking: { color: 0xd02020, kind: "hourglass" } });
    this.drawSpider("enemy-spider-jumper", { size: 12, body: 0x4a6a5a, accent: 0x1e2c25, marking: { color: 0x4fd1ff, kind: "eyes-large" } });

    this.drawDragonfly("enemy-dragonfly-common", { size: 38, body: 0x4fc1cf, accent: 0x1f5560, wing: 0xb0f0ff, wings: 2 });
    this.drawDragonfly("enemy-dragonfly-heli",   { size: 46, body: 0x2a8cb0, accent: 0x103040, wing: 0x80d8e8, wings: 4 });
    this.drawDragonfly("enemy-dragonfly-damsel", { size: 36, body: 0xc060d0, accent: 0x4a1a55, wing: 0xf5c8ff, wings: 2, slim: true });

    this.drawPirateShip("enemy-pirate-skiff",       { size: 36,  body: 0x8a5a3a, accent: 0x3a2010, variant: "skiff",       cannons: 0, sail: 0xd9c6a0 });
    this.drawPirateShip("enemy-pirate-cutlass",     { size: 38,  body: 0x6b3a2a, accent: 0x2a140a, variant: "cutlass",     cannons: 1, sail: 0xc8a878 });
    this.drawPirateShip("enemy-pirate-marauder",    { size: 42,  body: 0x5a4a2a, accent: 0x231a10, variant: "marauder",    cannons: 2, sail: 0xb89868 });
    this.drawPirateShip("enemy-pirate-corsair",     { size: 46,  body: 0x9a3030, accent: 0x4a1414, variant: "corsair",     cannons: 2, sail: 0xd8a060, skull: true });
    this.drawPirateShip("enemy-pirate-frigate",     { size: 52,  body: 0x4a4a6a, accent: 0x1f1f30, variant: "frigate",     cannons: 3, sail: 0xa8a8c0 });
    this.drawPirateShip("enemy-pirate-galleon",     { size: 60,  body: 0x5a4030, accent: 0x2a1c10, variant: "galleon",     cannons: 4, sail: 0xc8a87a });
    this.drawPirateShip("enemy-pirate-dreadnought", { size: 110, body: 0x7a1010, accent: 0x2a0606, variant: "dreadnought", cannons: 6, sail: 0x1a0606, skull: true });

    this.drawAsteroid("obstacle-asteroid-small", { size: 40, body: 0x6a5a4a, accent: 0x3a2e22 });

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

  // Irregular polygon "rock" silhouette for indestructible space junk. The
  // outline is a fixed 8-vertex pattern (deterministic so test snapshots
  // don't drift); the inner accents are two darker craters offset from
  // center so the shape doesn't read as a perfect circle.
  private drawAsteroid(
    key: string,
    opts: { size: number; body: number; accent: number }
  ): void {
    const { size, body, accent } = opts;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 1;
    const g = this.add.graphics();

    // Lumpy outline: 8 vertices around the center with stable per-index
    // radius offsets. Avoids Math.random so the texture is reproducible.
    const offsets = [1.0, 0.82, 0.95, 0.78, 1.02, 0.85, 0.92, 0.8];
    g.fillStyle(body, 1);
    g.beginPath();
    for (let i = 0; i < offsets.length; i++) {
      const angle = (i / offsets.length) * Math.PI * 2;
      const radius = r * (offsets[i] ?? 1);
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillPath();

    // Two darker craters give the rock readable surface depth.
    g.fillStyle(accent, 1);
    g.fillCircle(cx - r * 0.25, cy - r * 0.2, r * 0.18);
    g.fillCircle(cx + r * 0.18, cy + r * 0.28, r * 0.13);

    g.generateTexture(key, size, size);
    g.destroy();
  }

  // Attach hitbox metadata to a generated enemy texture so Enemy.ts can
  // size its physics body from the texture's `customData` field instead of
  // hard-coding a per-key match. Stored as plain numbers in pixels relative
  // to the texture's top-left.
  private setEnemyHitbox(
    key: string,
    hitboxWidth: number,
    hitboxHeight: number,
    hitboxOffsetX: number,
    hitboxOffsetY: number
  ): void {
    this.textures.get(key).customData = {
      hitboxWidth,
      hitboxHeight,
      hitboxOffsetX,
      hitboxOffsetY,
    };
  }

  // The player ship is a Spacepotato — a slightly lumpy tuber with a tiny
  // green sprout pointing forward (up-screen) and a faint cyan space-rim glow.
  // Drawn into a padded canvas so the rim glow is captured by generateTexture.
  private drawPotatoShip(key: string): void {
    const PAD = 6;
    const innerW = 50;
    const innerH = 42;
    const W = innerW + PAD * 2;
    const H = innerH + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Atmospheric rim — two soft cyan halos so it reads as "in space".
    g.fillStyle(0x4fd1ff, 0.10);
    g.fillEllipse(cx, cy, innerW + PAD * 2, innerH + PAD * 2);
    g.fillStyle(0x4fd1ff, 0.18);
    g.fillEllipse(cx, cy, innerW + PAD, innerH + PAD);

    // Lumpy silhouette — pre-baked noise so the shape is identical every boot.
    const noise = [0.07, -0.04, 0.05, -0.03, 0.02, -0.05, 0.04, 0.01, -0.06, 0.03, 0.05, -0.02, 0.04, -0.05, 0.03, 0.0, 0.05, -0.03];
    const steps = 18;
    const baseRx = innerW / 2;
    const baseRy = innerH / 2;
    const body: { x: number; y: number }[] = [];
    for (let i = 0; i < steps; i++) {
      const a = (Math.PI * 2 * i) / steps;
      const wobble = 1 + (noise[i] ?? 0);
      body.push({ x: cx + Math.cos(a) * baseRx * wobble, y: cy + Math.sin(a) * baseRy * wobble });
    }

    const tracePath = (): void => {
      const first = body[0];
      if (!first) return;
      g.beginPath();
      g.moveTo(first.x, first.y);
      for (let i = 1; i < body.length; i++) {
        const p = body[i];
        if (p) g.lineTo(p.x, p.y);
      }
      g.closePath();
    };

    g.fillStyle(0xa86b3d, 1);
    tracePath();
    g.fillPath();

    g.fillStyle(0x6b3f1f, 0.55);
    g.fillEllipse(cx + 5, cy + 6, innerW - 14, innerH - 16);

    g.fillStyle(0xd9a378, 0.7);
    g.fillEllipse(cx - 7, cy - 7, innerW - 22, innerH - 22);

    g.fillStyle(0xffe6b8, 0.9);
    g.fillEllipse(cx - 9, cy - 10, 7, 4);

    g.fillStyle(0x3d2210, 1);
    g.fillCircle(cx + 4, cy - 4, 1.4);
    g.fillCircle(cx - 6, cy + 5, 1.6);
    g.fillCircle(cx + 9, cy + 3, 1.2);
    g.fillCircle(cx - 2, cy + 8, 1.3);
    g.fillCircle(cx + 11, cy - 7, 1.0);
    g.fillCircle(cx - 11, cy - 2, 1.2);

    // Tiny green sprout on top — points to the front of the ship.
    g.lineStyle(1.5, 0x4caa55, 1);
    g.beginPath();
    g.moveTo(cx + 5, cy - innerH / 2 + 1);
    g.lineTo(cx + 5, cy - innerH / 2 - 4);
    g.strokePath();
    g.fillStyle(0x6fdc6f, 1);
    g.fillEllipse(cx + 2, cy - innerH / 2 - 4, 5, 2.5);
    g.fillEllipse(cx + 8, cy - innerH / 2 - 3, 5, 2.5);

    g.lineStyle(1.2, 0x2a1808, 0.7);
    tracePath();
    g.strokePath();

    g.generateTexture(key, W, H);
    g.destroy();
  }

  private drawBullet(key: string, color: number, w: number, h: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(0, 0, w, h, 2);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  // Small tumbling potato projectile. Asymmetric ellipse + 2 dark eye
  // dots + a small white sheen — small enough to read as a thrown spud
  // at combat speed but distinctive against the cyan default bullet.
  private drawPotatoBullet(key: string): void {
    const PAD = 2;
    const W = 14 + PAD * 2;
    const H = 16 + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Asymmetric body — slightly off-center so the silhouette doesn't
    // read as a generic pill.
    g.fillStyle(0xc8d878, 1); // peeled-potato lime
    g.fillEllipse(cx, cy, 12, 14);

    // Shadow wash on lower-right for a hint of volume.
    g.fillStyle(0x6e7f2c, 0.5);
    g.fillEllipse(cx + 1.5, cy + 2, 9, 10);

    // Two-stage highlight — matches drawPotatoShip's discipline.
    g.fillStyle(0xeaffd0, 0.55);
    g.fillEllipse(cx - 2, cy - 3, 6, 5);
    g.fillStyle(0xffffff, 0.8);
    g.fillEllipse(cx - 3, cy - 4, 2, 1.2);

    // Two potato eyes.
    g.fillStyle(0x3d2210, 1);
    g.fillCircle(cx + 2, cy - 1, 0.9);
    g.fillCircle(cx - 1, cy + 3, 0.8);

    // 1px outline at 70% opacity over a re-stroked ellipse so the
    // silhouette stays crisp at small size.
    g.lineStyle(1, 0x4a3a14, 0.7);
    g.strokeEllipse(cx, cy, 12, 14);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Idaho-russet potato projectile — same shape as drawPotatoBullet
  // but the player-ship russet palette instead of the lime peeled
  // variety, so a player firing the Idaho Potato Rifle alongside the
  // Potato Cannon can read the two streams apart instantly.
  private drawIdahoPotatoBullet(key: string): void {
    const PAD = 2;
    const W = 14 + PAD * 2;
    const H = 16 + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Russet body.
    g.fillStyle(0xb87a4a, 1);
    g.fillEllipse(cx, cy, 12, 14);

    // Shadow wash on lower-right for a hint of volume.
    g.fillStyle(0x6b3f1f, 0.55);
    g.fillEllipse(cx + 1.5, cy + 2, 9, 10);

    // Two-stage highlight, warm tan.
    g.fillStyle(0xd9a378, 0.55);
    g.fillEllipse(cx - 2, cy - 3, 6, 5);
    g.fillStyle(0xffe6b8, 0.8);
    g.fillEllipse(cx - 3, cy - 4, 2, 1.2);

    // Two potato eyes — same dark brown as the Potato Cannon's so the
    // tuber-eye motif stays consistent across spud weapons.
    g.fillStyle(0x3d2210, 1);
    g.fillCircle(cx + 2, cy - 1, 0.9);
    g.fillCircle(cx - 1, cy + 3, 0.8);

    // 1px outline at 70% opacity over a re-stroked ellipse so the
    // silhouette stays crisp at small size.
    g.lineStyle(1, 0x4a2810, 0.7);
    g.strokeEllipse(cx, cy, 12, 14);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Yukon Gold mortar projectile — heavier sibling of the standard
  // potato bullet. Larger silhouette (16×18 vs 12×14), warm
  // gold/buttery palette, same eyes-and-outline discipline. Sized up
  // so the heavy-cannon's three-bolt burst feels like it has weight
  // compared to the lighter Pulse / Idaho streams.
  private drawYukonGoldBullet(key: string): void {
    const PAD = 2;
    const W = 18 + PAD * 2;
    const H = 20 + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Yukon-gold body — buttery yellow, more rounded than the russet
    // sibling so it reads as a heavier, denser spud.
    g.fillStyle(0xddc060, 1);
    g.fillEllipse(cx, cy, 16, 18);

    // Shadow wash on lower-right.
    g.fillStyle(0x7a6020, 0.55);
    g.fillEllipse(cx + 2, cy + 3, 12, 13);

    // Two-stage highlight.
    g.fillStyle(0xfff5b8, 0.55);
    g.fillEllipse(cx - 3, cy - 4, 8, 6);
    g.fillStyle(0xffffff, 0.85);
    g.fillEllipse(cx - 4, cy - 5, 3, 1.5);

    // Two potato eyes — same dark brown as the rest of the spud line.
    g.fillStyle(0x3d2210, 1);
    g.fillCircle(cx + 3, cy - 1, 1.0);
    g.fillCircle(cx - 1, cy + 4, 0.9);

    // Outline.
    g.lineStyle(1, 0x5a4818, 0.7);
    g.strokeEllipse(cx, cy, 16, 18);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Red Bliss missile projectile — elongated 10×16 silhouette so the
  // homing rotation reads it as a pointed missile (the bullet's
  // homing logic calls setRotation each tick, overriding the cosmetic
  // tumble — the elongation lines up with the motion vector). Crimson
  // body for instant read against the lighter spud streams.
  private drawRedBlissBullet(key: string): void {
    const PAD = 2;
    const W = 12 + PAD * 2;
    const H = 18 + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Crimson body, taller than wide so it reads as a missile when
    // the homing logic locks rotation to the motion vector.
    g.fillStyle(0xc84050, 1);
    g.fillEllipse(cx, cy, 10, 16);

    // Shadow wash on lower-right.
    g.fillStyle(0x6a1a25, 0.55);
    g.fillEllipse(cx + 1.5, cy + 2.5, 7, 11);

    // Two-stage highlight, pink.
    g.fillStyle(0xffb0c0, 0.55);
    g.fillEllipse(cx - 2, cy - 4, 5, 6);
    g.fillStyle(0xffffff, 0.8);
    g.fillEllipse(cx - 3, cy - 5, 2, 1.2);

    // One eye near the top — sparse so the elongated shape stays
    // legible at small size.
    g.fillStyle(0x3d2210, 1);
    g.fillCircle(cx + 1, cy - 3, 0.9);
    g.fillCircle(cx - 1, cy + 3, 0.8);

    // Outline.
    g.lineStyle(1, 0x4a1218, 0.7);
    g.strokeEllipse(cx, cy, 10, 16);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Chantenay carrot — the wide-and-short variety, used as the chunky
  // cluster round. Stubby orange ellipse with a tiny green tuft at the
  // TOP so when motion-aligned by the gravity-rotation each tick, the
  // carrot flies leaves-back / tip-forward.
  private drawChantenayBullet(key: string): void {
    const PAD = 2;
    const W = 12 + PAD * 2;
    const H = 14 + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Stubby warm-orange body.
    g.fillStyle(0xe8a040, 1);
    g.fillEllipse(cx, cy, 8, 10);

    // Shadow wash on lower-right.
    g.fillStyle(0x8b4f10, 0.55);
    g.fillEllipse(cx + 1.5, cy + 1.5, 6, 7);

    // Two-stage highlight, warm cream.
    g.fillStyle(0xffd896, 0.55);
    g.fillEllipse(cx - 2, cy - 2, 4, 4);
    g.fillStyle(0xffffff, 0.8);
    g.fillEllipse(cx - 2.5, cy - 3, 1.6, 1);

    // Tiny green tuft at the TOP — two small leafy ellipses fan from
    // just inside the top edge so the carrot reads tip-down (the bullet
    // is rotated by the gravity-aligned motion vector each frame).
    g.fillStyle(0x4caa55, 1);
    g.fillEllipse(cx - 1.5, PAD, 2.5, 1.6);
    g.fillEllipse(cx + 1.5, PAD, 2.5, 1.6);

    // Outline.
    g.lineStyle(1, 0x4a2810, 0.7);
    g.strokeEllipse(cx, cy, 8, 10);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Imperator carrot — the very-long, slender variety, used as the
  // lance/precision round. Tall thin orange ellipse with a slim frond
  // at the TOP so the motion-aligned bullet reads as a flying lance.
  private drawImperatorBullet(key: string): void {
    const PAD = 2;
    const W = 8 + PAD * 2;
    const H = 20 + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Tall skinny deep-orange body.
    g.fillStyle(0xd77820, 1);
    g.fillEllipse(cx, cy, 4, 16);

    // Shadow wash on lower-right.
    g.fillStyle(0x6b3a08, 0.55);
    g.fillEllipse(cx + 0.7, cy + 2, 3, 12);

    // Two-stage highlight, warm orange near the top.
    g.fillStyle(0xffb060, 0.55);
    g.fillEllipse(cx - 1, cy - 4, 2, 6);
    g.fillStyle(0xffffff, 0.8);
    g.fillEllipse(cx - 1, cy - 6, 1.2, 1.6);

    // Slim green frond at the TOP — single leaf so the silhouette stays
    // narrow at small size.
    g.fillStyle(0x4caa55, 1);
    g.fillEllipse(cx, PAD, 3, 1.8);

    // Outline.
    g.lineStyle(1, 0x4a1810, 0.7);
    g.strokeEllipse(cx, cy, 4, 16);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Nantes carrot — the classic medium variety, used as the workhorse
  // assault round. Bright-orange ellipse with a medium green tuft at
  // the TOP so when gravity-aligned each frame the carrot points tip-
  // first along its motion vector.
  private drawNantesBullet(key: string): void {
    const PAD = 2;
    const W = 10 + PAD * 2;
    const H = 16 + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Classic bright-orange body.
    g.fillStyle(0xed8b30, 1);
    g.fillEllipse(cx, cy, 6, 12);

    // Shadow wash on lower-right.
    g.fillStyle(0x804010, 0.55);
    g.fillEllipse(cx + 1, cy + 2, 4.5, 9);

    // Two-stage highlight.
    g.fillStyle(0xffc870, 0.55);
    g.fillEllipse(cx - 1.5, cy - 3, 3, 5);
    g.fillStyle(0xffffff, 0.8);
    g.fillEllipse(cx - 2, cy - 4, 1.6, 1.2);

    // Medium green tuft at the TOP — two leafy ellipses.
    g.fillStyle(0x4caa55, 1);
    g.fillEllipse(cx - 1.5, PAD, 2.8, 1.8);
    g.fillEllipse(cx + 1.5, PAD, 2.8, 1.8);

    // Outline.
    g.lineStyle(1, 0x4a2010, 0.7);
    g.strokeEllipse(cx, cy, 6, 12);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Half-scale carrot mini-ship — the carrot-line counterpart to
  // drawPotatoPod. Tall orange silhouette so it reads as "carrot" not
  // "potato" when attached as a side pod for any carrot-themed weapon.
  private drawCarrotPod(key: string): void {
    const PAD = 4;
    const innerW = 14;
    const innerH = 22;
    const W = innerW + PAD * 2;
    const H = innerH + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Tall orange body — straight ellipse since carrots are smoother
    // than the lumpy potato silhouette.
    g.fillStyle(0xed8b30, 1);
    g.fillEllipse(cx, cy, innerW, innerH);

    // Shadow wash on lower-right.
    g.fillStyle(0x804010, 0.55);
    g.fillEllipse(cx + 2, cy + 3, innerW - 4, innerH - 6);

    // Two-stage highlight, warm cream.
    g.fillStyle(0xffc870, 0.55);
    g.fillEllipse(cx - 3, cy - 4, innerW - 6, innerH - 10);
    g.fillStyle(0xffe6b8, 0.8);
    g.fillEllipse(cx - 3.5, cy - 6, 3, 1.8);

    // Two small dark "rings" / eyes on the body.
    g.fillStyle(0x3d2210, 1);
    g.fillCircle(cx + 1, cy - 1, 1.0);
    g.fillCircle(cx - 2, cy + 4, 1.0);

    // Leafy green top — three ellipses fanning across the top edge.
    g.fillStyle(0x4caa55, 1);
    g.fillEllipse(cx - 3, PAD, 4, 2.4);
    g.fillEllipse(cx, PAD - 1, 4, 2.4);
    g.fillEllipse(cx + 3, PAD, 4, 2.4);

    // Outline.
    g.lineStyle(1, 0x4a2010, 0.7);
    g.strokeEllipse(cx, cy, innerW, innerH);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Tokyo Cross turnip — tiny cream/white Japanese hybrid bred for
  // uniformity. Used as the rapid-stream chip-damage round. Single small
  // green tuft at the top marks it as a turnip rather than a stray
  // pearl/egg shape.
  private drawTokyoCrossBullet(key: string): void {
    const PAD = 2;
    const W = 10 + PAD * 2;
    const H = 11 + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Cream/white body — slightly taller than wide so it reads as a tiny
    // round turnip rather than a generic pellet.
    g.fillStyle(0xf0e8d0, 1);
    g.fillEllipse(cx, cy, 6, 7);

    // Shadow wash on lower-right.
    g.fillStyle(0xa09080, 0.5);
    g.fillEllipse(cx + 1, cy + 1, 4.5, 5);

    // Two-stage highlight.
    g.fillStyle(0xfff5e8, 0.55);
    g.fillEllipse(cx - 1, cy - 1.5, 2.5, 2.5);
    g.fillStyle(0xffffff, 0.85);
    g.fillEllipse(cx - 1.5, cy - 2, 1.2, 0.8);

    // Tiny green tuft at the TOP — single small leaf so the silhouette
    // stays compact at this size.
    g.fillStyle(0x4caa55, 1);
    g.fillEllipse(cx, PAD + 1, 2.4, 1.4);

    // Outline.
    g.lineStyle(1, 0x5a4a30, 0.7);
    g.strokeEllipse(cx, cy, 6, 7);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Milan Purple Top turnip — the Italian flat-and-wide variety. Wider
  // than tall (22×12 vs the round Globe variant's 14×16), so when it
  // tumbles it reads as a thrown disc rather than a thrown ball. Used
  // as the heavy 5-shot volley round (5 discs flung in a 36° fan).
  // Same purple-cap-on-white-base treatment as the Globe sibling, just
  // squashed into a wide silhouette.
  private drawMilanPurpleTopBullet(key: string): void {
    const PAD = 2;
    const W = 22 + PAD * 2;
    const H = 12 + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Step 1 — full white/cream body sets the bottom half. WIDE ellipse
    // for the disc-shape that distinguishes Milan from the round Globe.
    g.fillStyle(0xf0e8d0, 1);
    g.fillEllipse(cx, cy, 20, 10);

    // Step 2 — purple cap covers the upper half so the silhouette
    // reads as the signature two-tone Purple Top, just flattened.
    g.fillStyle(0x9050b0, 1);
    g.fillEllipse(cx, cy - 2.5, 20, 6.5);

    // Subtle shadow wash on lower-right across both halves.
    g.fillStyle(0x3a1a4a, 0.4);
    g.fillEllipse(cx + 2, cy + 1.5, 14, 7);

    // Two-stage highlight on the purple cap (upper-left).
    g.fillStyle(0xc898d8, 0.55);
    g.fillEllipse(cx - 4, cy - 3, 7, 3);
    g.fillStyle(0xffffff, 0.7);
    g.fillEllipse(cx - 5, cy - 3.5, 2.5, 1);

    // Two small dark "root pocks" on the white bottom half.
    g.fillStyle(0x6a5040, 0.6);
    g.fillCircle(cx - 2, cy + 2, 0.8);
    g.fillCircle(cx + 4, cy + 3, 0.8);

    // Green tuft at the TOP — three small leaves fanning across the
    // wider cap so the disc still reads as a turnip silhouette.
    g.fillStyle(0x4caa55, 1);
    g.fillEllipse(cx - 4, PAD, 3, 1.6);
    g.fillEllipse(cx, PAD - 0.5, 3, 1.6);
    g.fillEllipse(cx + 4, PAD, 3, 1.6);

    // Outline around the full disc body.
    g.lineStyle(1, 0x3a1a4a, 0.7);
    g.strokeEllipse(cx, cy, 20, 10);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Half-scale turnip mini-ship — turnip-line counterpart to drawPotatoPod
  // and drawCarrotPod. Two-tone purple-cap-on-white-globe silhouette so
  // it reads as "turnip" not potato or carrot when attached as a side pod.
  private drawTurnipPod(key: string): void {
    const PAD = 4;
    const innerW = 14;
    const innerH = 18;
    const W = innerW + PAD * 2;
    const H = innerH + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Step 1 — full white/cream body.
    g.fillStyle(0xf0e8d0, 1);
    g.fillEllipse(cx, cy, innerW, innerH);

    // Step 2 — purple cap covers the upper half.
    g.fillStyle(0x9050b0, 1);
    g.fillEllipse(cx, cy - 5, innerW, innerH * 0.6);

    // Shadow wash on lower-right across the body.
    g.fillStyle(0x3a1a4a, 0.4);
    g.fillEllipse(cx + 2, cy + 3, innerW - 4, innerH - 6);

    // Highlight on the purple cap (upper-left) + warm sheen.
    g.fillStyle(0xc898d8, 0.5);
    g.fillEllipse(cx - 3, cy - 6, innerW - 6, innerH - 12);
    g.fillStyle(0xffe6b8, 0.6);
    g.fillEllipse(cx - 3.5, cy - 7, 3, 1.6);

    // Two small dark "root pocks" on the white bottom half.
    g.fillStyle(0x6a5040, 0.6);
    g.fillCircle(cx - 1, cy + 3, 1.0);
    g.fillCircle(cx + 2, cy + 5, 1.0);

    // Leafy green top — three ellipses fanning across the top edge,
    // middle leaf raised 1px.
    g.fillStyle(0x4caa55, 1);
    g.fillEllipse(cx - 3, PAD, 4, 2.4);
    g.fillEllipse(cx, PAD - 1, 4, 2.4);
    g.fillEllipse(cx + 3, PAD, 4, 2.4);

    // Outline.
    g.lineStyle(1, 0x3a1a4a, 0.7);
    g.strokeEllipse(cx, cy, innerW, innerH);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Half-scale player potato. Same body recipe as drawPotatoShip, no
  // rim glow, no sprout — just the silhouette + dimensional shading +
  // outline. Used as a visible "side pod" attached to the main ship
  // when an additional slot is equipped with any potato-themed weapon.
  private drawPotatoPod(key: string): void {
    const PAD = 4;
    const innerW = 26;
    const innerH = 22;
    const W = innerW + PAD * 2;
    const H = innerH + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Lumpy silhouette — pre-baked noise so the shape is identical
    // every boot. Matches drawPotatoShip's noise pattern at half scale.
    const noise = [0.07, -0.04, 0.05, -0.03, 0.02, -0.05, 0.04, 0.01, -0.06, 0.03, 0.05, -0.02, 0.04, -0.05, 0.03, 0.0, 0.05, -0.03];
    const steps = 18;
    const baseRx = innerW / 2;
    const baseRy = innerH / 2;
    const body: { x: number; y: number }[] = [];
    for (let i = 0; i < steps; i++) {
      const a = (Math.PI * 2 * i) / steps;
      const wobble = 1 + (noise[i] ?? 0);
      body.push({ x: cx + Math.cos(a) * baseRx * wobble, y: cy + Math.sin(a) * baseRy * wobble });
    }

    const tracePath = (): void => {
      const first = body[0];
      if (!first) return;
      g.beginPath();
      g.moveTo(first.x, first.y);
      for (let i = 1; i < body.length; i++) {
        const p = body[i];
        if (p) g.lineTo(p.x, p.y);
      }
      g.closePath();
    };

    g.fillStyle(0xa86b3d, 1);
    tracePath();
    g.fillPath();

    g.fillStyle(0x6b3f1f, 0.55);
    g.fillEllipse(cx + 3, cy + 3, innerW - 8, innerH - 9);

    g.fillStyle(0xd9a378, 0.7);
    g.fillEllipse(cx - 3, cy - 4, innerW - 12, innerH - 12);

    g.fillStyle(0xffe6b8, 0.9);
    g.fillEllipse(cx - 4, cy - 5, 4, 2);

    g.fillStyle(0x3d2210, 1);
    g.fillCircle(cx + 2, cy - 2, 0.9);
    g.fillCircle(cx - 3, cy + 2, 1.0);
    g.fillCircle(cx + 5, cy + 1, 0.8);

    g.lineStyle(1, 0x2a1808, 0.7);
    tracePath();
    g.strokePath();

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Pear-shaped sap-sucker. Head points DOWN since enemies fall toward
  // the player. Same layered-ellipse + accent dots + outline language as
  // drawPotatoShip so player and bug feel like the same biome. The
  // optional `crown` paints 5 amber spikes fanning from the rear of the
  // abdomen (queen variant only).
  private drawAphid(
    key: string,
    opts: { size: number; body: number; accent: number; crown?: number }
  ): void {
    const { size, body, accent, crown } = opts;
    const PAD = 4;
    const W = size + PAD * 2;
    const H = size + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    const bodyRx = size * 0.42;
    const bodyRy = size * 0.40;
    const bodyCy = cy - size * 0.06;
    const headRx = size * 0.28;
    const headRy = size * 0.22;
    const headCy = cy + size * 0.22;

    g.fillStyle(body, 1);
    g.fillEllipse(cx, bodyCy, bodyRx * 2, bodyRy * 2);
    g.fillEllipse(cx, headCy, headRx * 2, headRy * 2);

    g.fillStyle(accent, 0.45);
    g.fillEllipse(cx + size * 0.06, bodyCy + size * 0.07, bodyRx * 1.55, bodyRy * 1.45);

    g.fillStyle(0xeaffd0, 0.35);
    g.fillEllipse(cx - size * 0.12, bodyCy - size * 0.13, bodyRx * 1.05, bodyRy * 0.85);
    g.fillStyle(0xffffff, 0.55);
    g.fillEllipse(cx - size * 0.16, bodyCy - size * 0.18, size * 0.14, size * 0.07);

    const legR = Math.max(1, size * 0.045);
    const legXOffset = bodyRx * 0.92;
    const legYs = [bodyCy - bodyRy * 0.45, bodyCy, bodyCy + bodyRy * 0.5];
    g.fillStyle(accent, 1);
    for (const ly of legYs) {
      g.fillCircle(cx - legXOffset, ly, legR);
      g.fillCircle(cx + legXOffset, ly, legR);
    }

    // Phaser Graphics has no quadraticCurveTo here, so antennae are 3-segment polylines.
    const antLen = size * 0.22;
    const antBaseY = headCy + headRy * 0.55;
    const antBaseX = headRx * 0.55;
    g.lineStyle(Math.max(1, size * 0.035), accent, 0.95);
    g.beginPath();
    g.moveTo(cx - antBaseX, antBaseY);
    g.lineTo(cx - antBaseX - antLen * 0.35, antBaseY + antLen * 0.45);
    g.lineTo(cx - antBaseX - antLen * 0.85, antBaseY + antLen * 0.95);
    g.strokePath();
    g.beginPath();
    g.moveTo(cx + antBaseX, antBaseY);
    g.lineTo(cx + antBaseX + antLen * 0.35, antBaseY + antLen * 0.45);
    g.lineTo(cx + antBaseX + antLen * 0.85, antBaseY + antLen * 0.95);
    g.strokePath();

    const eyeR = Math.max(1.5, size * 0.085);
    const eyeY = headCy + headRy * 0.15;
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx, eyeY, eyeR);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - eyeR * 0.35, eyeY - eyeR * 0.35, Math.max(0.8, eyeR * 0.32));

    if (crown !== undefined) {
      const crownBaseY = bodyCy - bodyRy * 0.92;
      const spikes = 5;
      const spread = Math.PI * 0.55;
      const spikeLen = size * 0.15;
      const spikeHalfBase = Math.max(1.2, size * 0.04);
      g.fillStyle(crown, 1);
      for (let i = 0; i < spikes; i++) {
        const t = i / (spikes - 1);
        const a = -Math.PI / 2 + (t - 0.5) * spread;
        const baseR = bodyRy * 0.95;
        const bx = cx + Math.cos(a) * bodyRx * 0.7;
        const by = crownBaseY + (Math.sin(a) + 1) * baseR * 0.05;
        const tx = bx + Math.cos(a) * spikeLen;
        const ty = by + Math.sin(a) * spikeLen;
        const px = -Math.sin(a) * spikeHalfBase;
        const py = Math.cos(a) * spikeHalfBase;
        g.fillTriangle(tx, ty, bx + px, by + py, bx - px, by - py);
      }
    }

    g.lineStyle(1, accent, 0.7);
    g.strokeEllipse(cx, bodyCy, bodyRx * 2, bodyRy * 2);
    g.strokeEllipse(cx, headCy, headRx * 2, headRy * 2);

    g.generateTexture(key, W, H);
    g.destroy();

    // Hitbox covers the body+head silhouette. Antennae, crown spikes, and
    // legs are all too thin to count as fair targets, so they're excluded.
    const hitboxWidth = size * 0.84;
    const hitboxHeight = size * 0.90;
    const hitboxOffsetX = (W - hitboxWidth) / 2;
    const hitboxOffsetY = bodyCy - bodyRy;
    this.setEnemyHitbox(key, hitboxWidth, hitboxHeight, hitboxOffsetX, hitboxOffsetY);
  }

  // Armored beetle. Wide oval carapace with a center elytra split line,
  // a small head segment at the front (down-screen), 6 legs along the
  // sides, and a variant ornament at the head: scarab gets a dome boss
  // on the carapace, rhino gets a forward-pointing horn, stag gets two
  // forking mandibles. Outline + carapace shine sell the "armored" read.
  private drawBeetle(
    key: string,
    opts: {
      size: number;
      body: number;
      accent: number;
      ornament: "dome" | "horn" | "mandibles";
      ornamentColor: number;
    }
  ): void {
    const { size, body, accent, ornament, ornamentColor } = opts;
    const PAD = 5;
    const W = size + PAD * 2;
    const H = size + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    const bodyRx = size * 0.46;
    const bodyRy = size * 0.40;
    const bodyCy = cy - size * 0.05;
    const headRx = size * 0.22;
    const headRy = size * 0.13;
    const headCy = cy + size * 0.32;

    // Carapace + head silhouette.
    g.fillStyle(body, 1);
    g.fillEllipse(cx, bodyCy, bodyRx * 2, bodyRy * 2);
    g.fillEllipse(cx, headCy, headRx * 2, headRy * 2);

    // Right-side shadow wash for volume.
    g.fillStyle(accent, 0.55);
    g.fillEllipse(cx + size * 0.10, bodyCy + size * 0.04, bodyRx * 1.4, bodyRy * 1.55);

    // Carapace shine — bright crescent on the upper-left, sells "polished armor".
    g.fillStyle(0xffffff, 0.22);
    g.fillEllipse(cx - size * 0.16, bodyCy - size * 0.16, bodyRx * 1.0, bodyRy * 0.55);
    g.fillStyle(0xffffff, 0.45);
    g.fillEllipse(cx - size * 0.18, bodyCy - size * 0.20, size * 0.10, size * 0.05);

    // Elytra split — vertical seam down the carapace, the signature beetle tell.
    g.lineStyle(Math.max(1, size * 0.04), accent, 0.85);
    g.beginPath();
    g.moveTo(cx, bodyCy - bodyRy * 0.95);
    g.lineTo(cx, bodyCy + bodyRy * 0.95);
    g.strokePath();

    // 6 legs as short angled slashes outside the carapace.
    const legLen = size * 0.13;
    const legXOffset = bodyRx * 0.95;
    const legYs = [bodyCy - bodyRy * 0.55, bodyCy - bodyRy * 0.05, bodyCy + bodyRy * 0.45];
    g.lineStyle(Math.max(1, size * 0.045), accent, 0.95);
    for (const ly of legYs) {
      g.beginPath();
      g.moveTo(cx - legXOffset, ly);
      g.lineTo(cx - legXOffset - legLen, ly + legLen * 0.4);
      g.strokePath();
      g.beginPath();
      g.moveTo(cx + legXOffset, ly);
      g.lineTo(cx + legXOffset + legLen, ly + legLen * 0.4);
      g.strokePath();
    }

    // Small black eye dots on the head with a 1px white gleam each.
    const eyeR = Math.max(1.2, size * 0.055);
    const eyeY = headCy + headRy * 0.05;
    const eyeX = headRx * 0.55;
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - eyeX, eyeY, eyeR);
    g.fillCircle(cx + eyeX, eyeY, eyeR);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - eyeX - eyeR * 0.3, eyeY - eyeR * 0.3, Math.max(0.6, eyeR * 0.32));
    g.fillCircle(cx + eyeX - eyeR * 0.3, eyeY - eyeR * 0.3, Math.max(0.6, eyeR * 0.32));

    // Variant ornament.
    if (ornament === "dome") {
      // Scarab: a domed boss in the center of the carapace.
      g.fillStyle(ornamentColor, 0.9);
      g.fillCircle(cx, bodyCy, size * 0.11);
      g.fillStyle(0xffffff, 0.4);
      g.fillCircle(cx - size * 0.04, bodyCy - size * 0.04, size * 0.04);
    } else if (ornament === "horn") {
      // Rhino: single forward horn extending from the head.
      const hornBaseY = headCy + headRy * 0.6;
      const hornTipY = hornBaseY + size * 0.22;
      const hornHalfBase = size * 0.07;
      g.fillStyle(ornamentColor, 1);
      g.fillTriangle(cx, hornTipY, cx - hornHalfBase, hornBaseY, cx + hornHalfBase, hornBaseY);
      // Tiny upward kink at the base for "rhino horn" character.
      g.fillTriangle(
        cx, hornBaseY - size * 0.04,
        cx - hornHalfBase * 0.6, hornBaseY,
        cx + hornHalfBase * 0.6, hornBaseY
      );
    } else {
      // Stag: two forking mandibles diverging from the head.
      const mandBaseY = headCy + headRy * 0.55;
      const mandBaseX = headRx * 0.45;
      const mandTipY = mandBaseY + size * 0.18;
      const mandTipX = headRx * 1.4;
      const mandHalfBase = size * 0.04;
      g.fillStyle(ornamentColor, 1);
      g.fillTriangle(
        cx - mandTipX, mandTipY,
        cx - mandBaseX - mandHalfBase, mandBaseY,
        cx - mandBaseX + mandHalfBase, mandBaseY
      );
      g.fillTriangle(
        cx + mandTipX, mandTipY,
        cx + mandBaseX - mandHalfBase, mandBaseY,
        cx + mandBaseX + mandHalfBase, mandBaseY
      );
    }

    // Outline last over re-stroked silhouettes.
    g.lineStyle(1, accent, 0.75);
    g.strokeEllipse(cx, bodyCy, bodyRx * 2, bodyRy * 2);
    g.strokeEllipse(cx, headCy, headRx * 2, headRy * 2);

    g.generateTexture(key, W, H);
    g.destroy();

    // Hitbox covers the carapace+head mass. Short leg slashes and small
    // ornaments (dome/horn/mandibles) are excluded as cosmetic detail.
    const hitboxWidth = size * 0.92;
    const hitboxHeight = size * 0.90;
    const hitboxOffsetX = (W - hitboxWidth) / 2;
    const hitboxOffsetY = bodyCy - bodyRy;
    this.setEnemyHitbox(key, hitboxWidth, hitboxHeight, hitboxOffsetX, hitboxOffsetY);
  }

  // Segmented caterpillar — chain of overlapping circles with a smaller
  // head segment at the front (down-screen). Optional posterior horn
  // (hornworm) and per-segment horizontal stripes (army worm, monarch).
  // The boss-tier monarch reuses this helper at large segR + segment count
  // so the worm reads as a long undulating threat.
  private drawCaterpillar(
    key: string,
    opts: {
      segR: number;
      body: number;
      accent: number;
      segments: number;
      stripeColor?: number;
      hornColor?: number;
    }
  ): void {
    const { segR, body, accent, segments, stripeColor, hornColor } = opts;
    const PAD = 4;
    const headR = segR * 0.85;
    const spacing = segR;

    const W = segR * 2 + PAD * 2;
    // Length spans the head (2*headR) plus the chain of body segments.
    // Each segment is one diameter (2*segR) and successive centers sit
    // `spacing` apart (= segR), so N segments take (N+1)*segR of vertical
    // run from the bottom of the chain to the top of the topmost segment.
    const totalLen = 2 * headR + (segments + 1) * segR;
    const hornExtra = hornColor !== undefined ? segR * 0.7 : 0;
    const H = totalLen + hornExtra + PAD * 2;

    const cx = W / 2;
    const g = this.add.graphics();

    // Head sits at the BOTTOM of the texture (enemies fall toward player);
    // segments stack upward away from the head. Center positions:
    const headCy = H - PAD - headR;
    const segCenters: number[] = [];
    for (let i = 0; i < segments; i++) {
      segCenters.push(headCy - headR - segR - i * spacing);
    }

    // Posterior horn — extends UP from the topmost segment.
    if (hornColor !== undefined) {
      const top = segCenters[segCenters.length - 1] ?? 0;
      g.fillStyle(hornColor, 1);
      g.fillTriangle(
        cx, top - segR - segR * 0.7,
        cx - segR * 0.4, top - segR + segR * 0.05,
        cx + segR * 0.4, top - segR + segR * 0.05
      );
    }

    // Body segments — back to front so the head sits visually on top.
    g.fillStyle(body, 1);
    for (const yc of segCenters) g.fillCircle(cx, yc, segR);

    // Right-side shadow on each segment for volume.
    g.fillStyle(accent, 0.4);
    for (const yc of segCenters) {
      g.fillEllipse(cx + segR * 0.22, yc + segR * 0.1, segR * 1.4, segR * 1.4);
    }

    // Top-left highlight on each segment.
    g.fillStyle(0xffffff, 0.18);
    for (const yc of segCenters) {
      g.fillEllipse(cx - segR * 0.3, yc - segR * 0.32, segR * 0.95, segR * 0.5);
    }

    // Stripes — two thin horizontal bands per segment for army/monarch.
    if (stripeColor !== undefined) {
      g.fillStyle(stripeColor, 0.85);
      for (const yc of segCenters) {
        g.fillEllipse(cx, yc - segR * 0.32, segR * 1.65, segR * 0.20);
        g.fillEllipse(cx, yc + segR * 0.32, segR * 1.65, segR * 0.20);
      }
    }

    // Head — slightly smaller circle, drawn last so it overlaps the
    // first body segment at the base of the chain.
    g.fillStyle(body, 1);
    g.fillCircle(cx, headCy, headR);
    g.fillStyle(accent, 0.5);
    g.fillEllipse(cx + headR * 0.22, headCy + headR * 0.15, headR * 1.4, headR * 1.3);

    // Eyes — two black dots with white gleams on the head.
    const eyeR = Math.max(1.2, segR * 0.18);
    const eyeY = headCy + headR * 0.1;
    const eyeX = headR * 0.45;
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - eyeX, eyeY, eyeR);
    g.fillCircle(cx + eyeX, eyeY, eyeR);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - eyeX - eyeR * 0.3, eyeY - eyeR * 0.3, Math.max(0.6, eyeR * 0.32));
    g.fillCircle(cx + eyeX - eyeR * 0.3, eyeY - eyeR * 0.3, Math.max(0.6, eyeR * 0.32));

    // Outline last over re-stroked silhouettes.
    g.lineStyle(1, accent, 0.75);
    for (const yc of segCenters) g.strokeCircle(cx, yc, segR);
    g.strokeCircle(cx, headCy, headR);

    g.generateTexture(key, W, H);
    g.destroy();

    // Hitbox is the worm's column: the full segR-wide strip from below the
    // optional posterior horn down to the bottom edge of the head. PAD on
    // the X axis matches drawing offsets; PAD + hornExtra on the Y axis
    // skips the cosmetic horn at the top.
    const hitboxWidth = 2 * segR;
    const hitboxHeight = totalLen;
    const hitboxOffsetX = PAD;
    const hitboxOffsetY = PAD + hornExtra;
    this.setEnemyHitbox(key, hitboxWidth, hitboxHeight, hitboxOffsetX, hitboxOffsetY);
  }

  // Spider — bulbous abdomen (top, rear) + smaller cephalothorax (bottom,
  // leading the fall) with 4 multi-segment legs per side. The widow gets
  // a red hourglass marking on the abdomen; the jumping spider gets a
  // glowing accent ring around its big front eyes (jumping spiders are
  // famous for their oversized forward-facing eyes).
  private drawSpider(
    key: string,
    opts: {
      size: number;
      body: number;
      accent: number;
      marking?: { color: number; kind: "hourglass" | "eyes-large" };
    }
  ): void {
    const { size, body, accent, marking } = opts;
    const PAD = 5;
    const legSpan = size * 1.05;
    const cephR = size * 0.62;
    const W = (size + legSpan) * 2 + PAD * 2;
    const H = 2 * size + 2 * cephR + PAD * 2;
    const cx = W / 2;
    const g = this.add.graphics();

    // Layout: abdomen on top (rear), cephalothorax overlaps below (front).
    const abdomenCy = PAD + size;
    const cephCy = abdomenCy + size * 0.7 + cephR * 0.45;

    // 8 legs first so the body covers their roots. 4 per side, fanning
    // outward and slightly forward (down-screen).
    g.lineStyle(Math.max(1, size * 0.10), accent, 1);
    for (let i = 0; i < 8; i++) {
      const isLeft = i < 4;
      const idx = isLeft ? i : i - 4;
      const sign = isLeft ? -1 : 1;

      const rootX = cx + sign * cephR * 0.7;
      const rootY = cephCy - cephR * 0.55 + idx * cephR * 0.35;

      // Knee: outward + slight up/down variation per leg pair.
      const kneeX = rootX + sign * legSpan * 0.55;
      const kneeY = rootY + (idx - 1.5) * cephR * 0.18;

      // Foot tip: full leg span outward + slight forward bias.
      const footX = rootX + sign * legSpan * 0.95;
      const footY = rootY + cephR * 0.4 + idx * cephR * 0.18;

      g.beginPath();
      g.moveTo(rootX, rootY);
      g.lineTo(kneeX, kneeY);
      g.lineTo(footX, footY);
      g.strokePath();
    }

    // Abdomen.
    g.fillStyle(body, 1);
    g.fillCircle(cx, abdomenCy, size);
    g.fillStyle(accent, 0.45);
    g.fillEllipse(cx + size * 0.2, abdomenCy + size * 0.15, size * 1.5, size * 1.5);
    g.fillStyle(0xffffff, 0.18);
    g.fillEllipse(cx - size * 0.3, abdomenCy - size * 0.3, size * 0.95, size * 0.5);

    // Hourglass marking — two triangles meeting at a waist (widow).
    if (marking?.kind === "hourglass") {
      g.fillStyle(marking.color, 1);
      g.fillTriangle(
        cx - size * 0.28, abdomenCy - size * 0.30,
        cx + size * 0.28, abdomenCy - size * 0.30,
        cx, abdomenCy
      );
      g.fillTriangle(
        cx - size * 0.28, abdomenCy + size * 0.30,
        cx + size * 0.28, abdomenCy + size * 0.30,
        cx, abdomenCy
      );
    }

    // Cephalothorax (head segment).
    g.fillStyle(body, 1);
    g.fillCircle(cx, cephCy, cephR);
    g.fillStyle(accent, 0.5);
    g.fillEllipse(cx + cephR * 0.2, cephCy + cephR * 0.15, cephR * 1.4, cephR * 1.3);

    // 4-eye cluster (2 large central + 2 smaller side eyes).
    const eyeR = Math.max(1.0, cephR * 0.16);
    const eyeY = cephCy + cephR * 0.25;
    const eyeXBig = cephR * 0.25;
    const eyeXSmall = cephR * 0.55;
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - eyeXBig, eyeY, eyeR * 1.3);
    g.fillCircle(cx + eyeXBig, eyeY, eyeR * 1.3);
    g.fillCircle(cx - eyeXSmall, eyeY - eyeR * 0.3, eyeR * 0.7);
    g.fillCircle(cx + eyeXSmall, eyeY - eyeR * 0.3, eyeR * 0.7);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - eyeXBig - eyeR * 0.4, eyeY - eyeR * 0.4, Math.max(0.6, eyeR * 0.4));
    g.fillCircle(cx + eyeXBig - eyeR * 0.4, eyeY - eyeR * 0.4, Math.max(0.6, eyeR * 0.4));

    // Jumping-spider tell — glowing ring around the big eyes.
    if (marking?.kind === "eyes-large") {
      g.lineStyle(1.5, marking.color, 0.85);
      g.strokeCircle(cx - eyeXBig, eyeY, eyeR * 1.7);
      g.strokeCircle(cx + eyeXBig, eyeY, eyeR * 1.7);
    }

    // Outline last.
    g.lineStyle(1, accent, 0.7);
    g.strokeCircle(cx, abdomenCy, size);
    g.strokeCircle(cx, cephCy, cephR);

    g.generateTexture(key, W, H);
    g.destroy();

    // Hitbox covers the abdomen+cephalothorax body mass. Legs are thin
    // lines that barely extend past `size` and would inflate the box
    // unfairly, so they're excluded.
    const hitboxWidth = 2 * size;
    const hitboxHeight = (cephCy + cephR) - (abdomenCy - size);
    const hitboxOffsetX = (W - hitboxWidth) / 2;
    const hitboxOffsetY = abdomenCy - size;
    this.setEnemyHitbox(key, hitboxWidth, hitboxHeight, hitboxOffsetX, hitboxOffsetY);
  }

  // Dragonfly — long thin body with the head pointing DOWN, large
  // semi-transparent wings extending sideways from the upper third, and
  // a pair of compound eyes on the head. `wings: 4` paints a second
  // wing pair behind the first (helicopter dragonfly); `slim: true`
  // narrows everything for the damselfly variant.
  private drawDragonfly(
    key: string,
    opts: {
      size: number;
      body: number;
      accent: number;
      wing: number;
      wings: 2 | 4;
      slim?: boolean;
    }
  ): void {
    const { size, body, accent, wing, wings, slim } = opts;
    const PAD = 5;
    const bodyLen = size;
    const bodyHalfW = size * (slim ? 0.06 : 0.09);
    const wingLen = size * (slim ? 0.55 : 0.72);
    const wingHalfH = size * (slim ? 0.08 : 0.11);
    const W = (bodyHalfW + wingLen) * 2 + PAD * 2;
    const H = bodyLen + (wings === 4 ? wingHalfH * 0.8 : 0) + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Wings draw first so the body covers their roots. Wing center sits
    // in the upper third of the body (toward the rear). For the
    // 4-winged variant a second slightly-smaller pair sits behind.
    const wingCy = cy - bodyLen * 0.20;
    const drawWingPair = (yOffset: number, scale: number, alpha: number): void => {
      g.fillStyle(wing, alpha);
      g.fillEllipse(
        cx - bodyHalfW - wingLen * 0.5 * scale,
        wingCy + yOffset,
        wingLen * scale,
        wingHalfH * 2 * scale
      );
      g.fillEllipse(
        cx + bodyHalfW + wingLen * 0.5 * scale,
        wingCy + yOffset,
        wingLen * scale,
        wingHalfH * 2 * scale
      );
      // Wing veins — a thin accent stroke along the wing centerline.
      g.lineStyle(Math.max(0.8, size * 0.012), accent, 0.5);
      g.beginPath();
      g.moveTo(cx - bodyHalfW, wingCy + yOffset);
      g.lineTo(cx - bodyHalfW - wingLen * scale, wingCy + yOffset);
      g.strokePath();
      g.beginPath();
      g.moveTo(cx + bodyHalfW, wingCy + yOffset);
      g.lineTo(cx + bodyHalfW + wingLen * scale, wingCy + yOffset);
      g.strokePath();
    };
    if (wings === 4) {
      drawWingPair(wingHalfH * 1.3, 0.85, 0.55);
    }
    drawWingPair(0, 1, 0.7);

    // Long thin body — three stacked ellipses (tail, thorax, head) that
    // collectively read as one cigar-shape.
    const tailCy = cy - bodyLen * 0.32;
    const thoraxCy = cy;
    const headCy = cy + bodyLen * 0.36;
    g.fillStyle(body, 1);
    g.fillEllipse(cx, tailCy, bodyHalfW * 1.6, bodyLen * 0.42);
    g.fillEllipse(cx, thoraxCy, bodyHalfW * 2.4, bodyLen * 0.40);
    g.fillEllipse(cx, headCy, bodyHalfW * 2.6, bodyLen * 0.20);

    // Subtle body shadow (right side).
    g.fillStyle(accent, 0.5);
    g.fillEllipse(cx + bodyHalfW * 0.4, thoraxCy + bodyLen * 0.05, bodyHalfW * 1.8, bodyLen * 0.32);

    // Compound eyes — two large dark domes on the head, dragonfly signature.
    const eyeR = bodyHalfW * 1.6;
    const eyeY = headCy + bodyLen * 0.05;
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - bodyHalfW * 1.1, eyeY, eyeR);
    g.fillCircle(cx + bodyHalfW * 1.1, eyeY, eyeR);
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(cx - bodyHalfW * 1.1 - eyeR * 0.3, eyeY - eyeR * 0.3, Math.max(0.7, eyeR * 0.3));
    g.fillCircle(cx + bodyHalfW * 1.1 - eyeR * 0.3, eyeY - eyeR * 0.3, Math.max(0.7, eyeR * 0.3));

    // Outline — re-stroke each body section.
    g.lineStyle(1, accent, 0.7);
    g.strokeEllipse(cx, tailCy, bodyHalfW * 1.6, bodyLen * 0.42);
    g.strokeEllipse(cx, thoraxCy, bodyHalfW * 2.4, bodyLen * 0.40);
    g.strokeEllipse(cx, headCy, bodyHalfW * 2.6, bodyLen * 0.20);

    g.generateTexture(key, W, H);
    g.destroy();

    // Wings ARE the dragonfly's signature visual — players will shoot at
    // the wide silhouette, so the hitbox includes the full wingspan and
    // body length. Effectively the entire texture minus the PAD border.
    const hitboxWidth = (bodyHalfW + wingLen) * 2;
    const hitboxHeight = bodyLen + (wings === 4 ? wingHalfH * 0.8 : 0);
    const hitboxOffsetX = PAD;
    const hitboxOffsetY = PAD;
    this.setEnemyHitbox(key, hitboxWidth, hitboxHeight, hitboxOffsetX, hitboxOffsetY);
  }

  // Top-down pirate vessel pointing DOWN (bow at the bottom, stern at the top
  // of the texture). Hull is an elongated wedge — a stern rectangle joined
  // to a triangular bow — with a square sail behind, optional cannon ports
  // along port + starboard, and an optional jolly-roger skull on the hull.
  // `dreadnought` adds a raised forecastle at the bow + double cannon rows
  // so it reads bigger and meaner than a galleon. Variant just tunes width
  // and length so silhouettes feel distinct at a glance.
  private drawPirateShip(
    key: string,
    opts: {
      size: number;
      body: number;
      accent: number;
      sail?: number;
      cannons?: number;
      variant: "skiff" | "cutlass" | "marauder" | "corsair" | "frigate" | "galleon" | "dreadnought";
      skull?: boolean;
    }
  ): void {
    const { size, body, accent, sail, cannons = 0, variant, skull } = opts;
    const PAD = 5;

    // Width per variant — skiff narrowest, dreadnought widest.
    const widthFactor =
      variant === "skiff" ? 0.34 :
      variant === "cutlass" ? 0.36 :
      variant === "marauder" ? 0.40 :
      variant === "corsair" ? 0.42 :
      variant === "frigate" ? 0.42 :
      variant === "galleon" ? 0.48 :
      0.52; // dreadnought

    const hullHalfW = size * widthFactor;
    const hullLen = size;
    const bowLen = hullLen * 0.30;
    const sternLen = hullLen - bowLen;

    const sailHalfW = hullHalfW * 0.85;
    const sailH = sail !== undefined ? hullLen * 0.42 : 0;
    const sailGap = sail !== undefined ? size * 0.04 : 0;

    const W = hullHalfW * 2 + PAD * 2;
    const H = sailH + sailGap + hullLen + PAD * 2;
    const cx = W / 2;

    // Bow at the bottom of the texture (enemies fall down). Stern at top.
    const bowTipY = H - PAD;
    const sternTopY = bowTipY - hullLen;
    const sternBottomY = sternTopY + sternLen;

    const g = this.add.graphics();

    // Sail — square sail behind/above the hull.
    if (sail !== undefined) {
      const sailBottomY = sternTopY - sailGap;
      const sailTopY = sailBottomY - sailH;
      g.fillStyle(sail, 1);
      g.fillRect(cx - sailHalfW, sailTopY, sailHalfW * 2, sailH);
      g.lineStyle(1, accent, 0.7);
      g.strokeRect(cx - sailHalfW, sailTopY, sailHalfW * 2, sailH);
      // Mast — vertical line up the middle of the sail.
      g.lineStyle(Math.max(1, size * 0.025), accent, 0.85);
      g.beginPath();
      g.moveTo(cx, sailTopY - sailGap * 0.5);
      g.lineTo(cx, sternTopY + sternLen * 0.25);
      g.strokePath();
      // Pennant — small triangle off the top of the mast.
      g.fillStyle(accent, 0.9);
      g.fillTriangle(
        cx, sailTopY - sailGap * 0.5,
        cx + size * 0.10, sailTopY - sailGap * 0.5 + size * 0.04,
        cx, sailTopY - sailGap * 0.5 + size * 0.08
      );
    }

    // Hull — stern rectangle + bow triangle, drawn as one filled silhouette.
    g.fillStyle(body, 1);
    g.fillRect(cx - hullHalfW, sternTopY, hullHalfW * 2, sternLen);
    g.fillTriangle(
      cx - hullHalfW, sternBottomY,
      cx + hullHalfW, sternBottomY,
      cx, bowTipY
    );

    // Right-side shadow wash for volume.
    g.fillStyle(accent, 0.45);
    g.fillRect(cx + hullHalfW * 0.15, sternTopY + sternLen * 0.05, hullHalfW * 0.85, sternLen * 0.95);
    g.fillTriangle(
      cx + hullHalfW * 0.15, sternBottomY,
      cx + hullHalfW, sternBottomY,
      cx, bowTipY
    );

    // Top-left highlight on the deck.
    g.fillStyle(0xffffff, 0.18);
    g.fillRect(cx - hullHalfW * 0.85, sternTopY + sternLen * 0.10, hullHalfW * 0.70, sternLen * 0.35);

    // Stern transom — accent strip across the top of the rectangle.
    g.fillStyle(accent, 0.85);
    g.fillRect(cx - hullHalfW, sternTopY, hullHalfW * 2, Math.max(1.5, size * 0.05));

    // Deck plank seam — thin centerline running stern-to-bow.
    g.lineStyle(Math.max(1, size * 0.02), accent, 0.55);
    g.beginPath();
    g.moveTo(cx, sternTopY + size * 0.08);
    g.lineTo(cx, bowTipY - size * 0.05);
    g.strokePath();

    // Forecastle — only on the dreadnought, a smaller raised rectangle near
    // the bow that visually layers a second deck on top.
    if (variant === "dreadnought") {
      const foreHalfW = hullHalfW * 0.55;
      const foreTopY = sternBottomY - sternLen * 0.20;
      const foreH = sternLen * 0.32;
      g.fillStyle(body, 1);
      g.fillRect(cx - foreHalfW, foreTopY, foreHalfW * 2, foreH);
      g.fillStyle(accent, 0.55);
      g.fillRect(cx + foreHalfW * 0.15, foreTopY + foreH * 0.1, foreHalfW * 0.85, foreH * 0.9);
      g.lineStyle(1, accent, 0.85);
      g.strokeRect(cx - foreHalfW, foreTopY, foreHalfW * 2, foreH);
    }

    // Cannon ports — small dark circles along port + starboard. Count is
    // per side (so cannons:2 = 2 left + 2 right). Dreadnought stacks two
    // rows at slightly different X offsets to read as multi-deck.
    if (cannons > 0) {
      const portR = Math.max(1.2, size * 0.04);
      const xPort = -hullHalfW + portR * 1.6;
      const xStar = hullHalfW - portR * 1.6;
      const yTop = sternTopY + sternLen * 0.22;
      const yBot = sternBottomY - sternLen * 0.05;
      const yStep = cannons > 1 ? (yBot - yTop) / (cannons - 1) : 0;
      g.fillStyle(0x05060a, 1);
      for (let i = 0; i < cannons; i++) {
        const yc = cannons === 1 ? (yTop + yBot) * 0.5 : yTop + yStep * i;
        g.fillCircle(cx + xPort, yc, portR);
        g.fillCircle(cx + xStar, yc, portR);
        if (variant === "dreadnought") {
          g.fillCircle(cx + xPort + portR * 1.5, yc - portR * 0.4, portR * 0.85);
          g.fillCircle(cx + xStar - portR * 1.5, yc - portR * 0.4, portR * 0.85);
        }
      }
    }

    // Jolly-roger skull on hull center (corsair, dreadnought).
    if (skull === true) {
      const skullR = size * 0.10;
      const skullCy = sternTopY + sternLen * 0.55;
      g.fillStyle(0xf0e8d8, 1);
      g.fillCircle(cx, skullCy, skullR);
      // Jaw — short rectangle below the cranium.
      g.fillRect(cx - skullR * 0.55, skullCy + skullR * 0.6, skullR * 1.1, skullR * 0.45);
      // Eye pits + nasal slit.
      g.fillStyle(0x05060a, 1);
      g.fillCircle(cx - skullR * 0.4, skullCy - skullR * 0.05, skullR * 0.28);
      g.fillCircle(cx + skullR * 0.4, skullCy - skullR * 0.05, skullR * 0.28);
      g.fillRect(cx - skullR * 0.08, skullCy + skullR * 0.3, skullR * 0.16, skullR * 0.25);
      // Jaw line.
      g.lineStyle(Math.max(1, size * 0.018), 0x05060a, 0.9);
      g.beginPath();
      g.moveTo(cx - skullR * 0.55, skullCy + skullR * 0.85);
      g.lineTo(cx + skullR * 0.55, skullCy + skullR * 0.85);
      g.strokePath();
    }

    // Hull outline last so the silhouette reads cleanly.
    g.lineStyle(1, accent, 0.85);
    g.beginPath();
    g.moveTo(cx - hullHalfW, sternTopY);
    g.lineTo(cx + hullHalfW, sternTopY);
    g.lineTo(cx + hullHalfW, sternBottomY);
    g.lineTo(cx, bowTipY);
    g.lineTo(cx - hullHalfW, sternBottomY);
    g.lineTo(cx - hullHalfW, sternTopY);
    g.strokePath();

    g.generateTexture(key, W, H);
    g.destroy();

    // Hitbox covers the hull silhouette only — the sail + pennant are
    // cosmetic and excluded so players aren't punished for shooting at
    // empty cloth above the deck.
    const hitboxWidth = hullHalfW * 2;
    const hitboxHeight = hullLen;
    const hitboxOffsetX = (W - hitboxWidth) / 2;
    const hitboxOffsetY = sternTopY;
    this.setEnemyHitbox(key, hitboxWidth, hitboxHeight, hitboxOffsetX, hitboxOffsetY);
  }

}
