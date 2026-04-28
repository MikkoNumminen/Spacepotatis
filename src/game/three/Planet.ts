import * as THREE from "three";
import type { MissionDefinition, MissionId } from "@/types/game";
import type { CelestialBody } from "./CelestialBody";
import { createLabelTexture } from "./labelTexture";
import { generatePlanetSurface } from "./planetTexture";

const BASE_RADIUS = 0.9;

const DIFFICULTY_COLOR: Record<1 | 2 | 3, number> = {
  1: 0x5effa7, // easy = green
  2: 0xffcc33, // medium = amber
  3: 0xff4d6d  // hard = red
};

const SHOP_COLOR = 0x4fd1ff;
// Scenery bodies aren't interactive, so they read as just-a-planet using the
// neutral easy-difficulty hue rather than the cyan reserved for shops.
const SCENERY_COLOR = 0x8a9bb8;

// Per-mission base color overrides. Without these, planets are colored only
// by difficulty (red/amber/green) which makes a difficulty-2 jungle moon
// look identical to a difficulty-2 lava world. Each entry here is the base
// HSL hue the procedural surface generator builds its palette around.
const MISSION_COLOR_OVERRIDE: Partial<Record<MissionId, number>> = {
  "pirate-beacon": 0x3a8e6a,      // jungle-moon green-teal
  "ember-run": 0xff6b3a,          // bright lava-orange
  "burnt-spud": 0x4a2020,         // charred volcanic crust
  "tubernovae-outpost": 0x8aa8c8  // banded blue-grey ice giant
};

const RING_TEX_W = 1024;
const RING_TEX_H = 4;

function createRingTexture(seed: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = RING_TEX_W;
  canvas.height = RING_TEX_H;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const img = ctx.createImageData(RING_TEX_W, RING_TEX_H);
    const data = img.data;
    let s = seed >>> 0;
    const rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const bands: { center: number; width: number; weight: number }[] = [];
    for (let i = 0; i < 28; i++) {
      bands.push({
        center: rnd(),
        width: 0.012 + rnd() * 0.05,
        weight: 0.4 + rnd() * 0.6
      });
    }
    const gaps: { center: number; width: number }[] = [];
    for (let i = 0; i < 5; i++) {
      gaps.push({
        center: 0.12 + rnd() * 0.78,
        width: 0.01 + rnd() * 0.025
      });
    }
    const noiseSeed: number[] = [];
    for (let i = 0; i < RING_TEX_W; i++) noiseSeed.push(rnd());

    for (let u = 0; u < RING_TEX_W; u++) {
      const t = u / (RING_TEX_W - 1);
      let density = 0.35;
      for (const band of bands) {
        const d = Math.abs(t - band.center);
        if (d < band.width) {
          density += (1 - d / band.width) * band.weight * 0.55;
        }
      }
      for (const gap of gaps) {
        const dg = Math.abs(t - gap.center);
        if (dg < gap.width) {
          density *= dg / gap.width;
        }
      }
      const n0 = noiseSeed[u] ?? 0.5;
      const nm1 = noiseSeed[Math.max(0, u - 1)] ?? n0;
      const np1 = noiseSeed[Math.min(RING_TEX_W - 1, u + 1)] ?? n0;
      const grain = (n0 * 0.5 + nm1 * 0.25 + np1 * 0.25 - 0.5) * 0.18;
      density += grain;

      const edgeFade =
        t < 0.06 ? smoothstep(0, 0.06, t) : t > 0.94 ? smoothstep(1, 0.94, t) : 1;
      density = Math.max(0, Math.min(1, density)) * edgeFade;

      const tone = 175 + density * 60;
      const r = Math.round(tone);
      const g = Math.round(tone - 8 - density * 8);
      const b = Math.round(tone - 22 - density * 18);
      const alpha = Math.round(density * 230);
      for (let v = 0; v < RING_TEX_H; v++) {
        const idx = (v * RING_TEX_W + u) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = alpha;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function remapRingUVs(
  geometry: THREE.RingGeometry,
  innerRadius: number,
  outerRadius: number
): void {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  if (!pos || !uv) return;
  const span = outerRadius - innerRadius;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.sqrt(x * x + y * y);
    const u = (r - innerRadius) / span;
    const v = (Math.atan2(y, x) / (Math.PI * 2)) + 0.5;
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

function hashStringToInt(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Planet implements CelestialBody {
  readonly object: THREE.Group;
  private readonly mesh: THREE.Mesh;
  private readonly outline: THREE.Mesh;
  private readonly label: THREE.Sprite;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly outlineMaterial: THREE.MeshBasicMaterial;
  private readonly labelMaterial: THREE.SpriteMaterial;
  private labelTexture: THREE.CanvasTexture;
  private readonly labelHeight: number;
  private readonly surfaceMap: THREE.CanvasTexture;
  private readonly bumpMap: THREE.CanvasTexture;
  private readonly geometry: THREE.SphereGeometry;
  private readonly outlineGeometry: THREE.SphereGeometry;
  private readonly ring: THREE.Mesh | null;
  private readonly ringGeometry: THREE.RingGeometry | null;
  private readonly ringMaterial: THREE.MeshBasicMaterial | null;
  private readonly ringTexture: THREE.CanvasTexture | null;
  private readonly definition: MissionDefinition;
  private readonly orbitU: THREE.Vector3;
  private readonly orbitV: THREE.Vector3;
  private angle: number;
  private hovered = false;

  constructor(definition: MissionDefinition) {
    this.definition = definition;
    this.angle = definition.startAngle;

    const orbitSeed = hashStringToInt(definition.id);
    const incRand = ((orbitSeed % 1009) / 1009) - 0.5;
    const nodeRand = ((orbitSeed >>> 10) % 1013) / 1013;
    const inclination = definition.orbitTilt ?? incRand * 0.45;
    const nodeAngle = definition.orbitNode ?? nodeRand * Math.PI * 2;
    const cosN = Math.cos(nodeAngle);
    const sinN = Math.sin(nodeAngle);
    this.orbitU = new THREE.Vector3(cosN, 0, sinN);
    const vInitial = new THREE.Vector3(-sinN, 0, cosN);
    const tilt = new THREE.Quaternion().setFromAxisAngle(this.orbitU, inclination);
    this.orbitV = vInitial.applyQuaternion(tilt);

    const radius = BASE_RADIUS * definition.scale;
    this.geometry = new THREE.SphereGeometry(radius, 64, 48);

    const baseColor =
      MISSION_COLOR_OVERRIDE[definition.id] ??
      (definition.kind === "shop"
        ? SHOP_COLOR
        : definition.kind === "scenery"
          ? SCENERY_COLOR
          : DIFFICULTY_COLOR[definition.difficulty]);

    const surface = generatePlanetSurface(definition.id satisfies MissionId, baseColor);
    this.surfaceMap = surface.map;
    this.bumpMap = surface.bumpMap;

    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.surfaceMap,
      bumpMap: this.bumpMap,
      bumpScale: 0.04,
      roughness: 0.95,
      metalness: 0.0,
      emissive: 0x000000
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.userData.missionId = definition.id;

    this.outlineGeometry = new THREE.SphereGeometry(radius * 1.08, 48, 32);
    this.outlineMaterial = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      depthWrite: false
    });
    this.outline = new THREE.Mesh(this.outlineGeometry, this.outlineMaterial);

    if (definition.ring) {
      const inner = radius * definition.ring.innerRadius;
      const outer = radius * definition.ring.outerRadius;
      this.ringGeometry = new THREE.RingGeometry(inner, outer, 192, 1);
      remapRingUVs(this.ringGeometry, inner, outer);
      this.ringTexture = createRingTexture(hashStringToInt(definition.id));
      this.ringMaterial = new THREE.MeshBasicMaterial({
        map: this.ringTexture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this.ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
      this.ring.rotation.x = Math.PI / 2 + definition.ring.tilt;
      this.ring.renderOrder = 2;
    } else {
      this.ringGeometry = null;
      this.ringTexture = null;
      this.ringMaterial = null;
      this.ring = null;
    }

    const { texture: labelTex, aspect: labelAspect } = createLabelTexture(definition.name, null, "");
    this.labelTexture = labelTex;
    this.labelMaterial = new THREE.SpriteMaterial({
      map: this.labelTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false
    });
    this.label = new THREE.Sprite(this.labelMaterial);
    this.labelHeight = Math.max(0.55, radius * 0.6);
    this.label.scale.set(this.labelHeight * labelAspect, this.labelHeight, 1);
    this.label.position.set(0, -(radius + 0.55), 0);
    this.label.renderOrder = 10;

    this.object = new THREE.Group();
    this.object.add(this.outline);
    this.object.add(this.mesh);
    if (this.ring) this.object.add(this.ring);
    this.object.add(this.label);
    this.positionOnOrbit();
  }

  // `parentPosition` shifts the orbit's center: when a body declares
  // `orbitParentId`, the caller passes that parent's current world position
  // so the local-orbit math runs in the parent's frame (e.g. a station
  // orbiting a planet). Null means orbit the system origin as before.
  update(dt: number, parentPosition: THREE.Vector3 | null = null): void {
    this.angle += this.definition.orbitSpeed * dt;
    this.positionOnOrbit(parentPosition);
    this.mesh.rotation.y += dt * 0.25;

    const targetOpacity = this.hovered ? 0.55 : 0.0;
    this.outlineMaterial.opacity += (targetOpacity - this.outlineMaterial.opacity) * 0.18;
  }

  setHovered(hovered: boolean): void {
    this.hovered = hovered;
  }

  getMissionId(): MissionId {
    return this.definition.id;
  }

  getDefinition(): MissionDefinition {
    return this.definition;
  }

  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  setStatusLabel(status: string | null, color: string): void {
    const { texture, aspect } = createLabelTexture(this.definition.name, status, color);
    this.labelTexture.dispose();
    this.labelTexture = texture;
    this.labelMaterial.map = texture;
    this.labelMaterial.needsUpdate = true;
    this.label.scale.set(this.labelHeight * aspect, this.labelHeight, 1);
  }

  dispose(): void {
    this.geometry.dispose();
    this.outlineGeometry.dispose();
    this.material.dispose();
    this.outlineMaterial.dispose();
    this.labelMaterial.dispose();
    this.labelTexture.dispose();
    this.surfaceMap.dispose();
    this.bumpMap.dispose();
    this.ringGeometry?.dispose();
    this.ringMaterial?.dispose();
    this.ringTexture?.dispose();
  }

  private positionOnOrbit(parentPosition: THREE.Vector3 | null = null): void {
    const r = this.definition.orbitRadius;
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    const px = parentPosition?.x ?? 0;
    const py = parentPosition?.y ?? 0;
    const pz = parentPosition?.z ?? 0;
    this.object.position.set(
      px + (this.orbitU.x * c + this.orbitV.x * s) * r,
      py + (this.orbitU.y * c + this.orbitV.y * s) * r,
      pz + (this.orbitU.z * c + this.orbitV.z * s) * r
    );
  }
}
