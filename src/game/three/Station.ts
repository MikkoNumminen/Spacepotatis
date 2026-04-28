import * as THREE from "three";
import type { MissionDefinition, MissionId } from "@/types/game";
import type { CelestialBody } from "./CelestialBody";

// Visual signature of a market space station: a flat-laid torus hub, an
// inner accent ring, a central spine, two solar-panel wings, and an antenna
// mast topped by a blinking nav light. No procedural surface map — stations
// read as machined metal, not planetary crust.
//
// All bodies with MissionDefinition.kind === "shop" render as Stations.
// The class implements CelestialBody so SceneRig holds Planets and Stations
// in the same array.

const HULL_COLOR = 0x9da8b8;       // cool greyish blue
const ACCENT_COLOR = 0x2d3a4e;     // dark navy panel + ring
const LIGHT_COLOR = 0x9ce8ff;      // antenna nav light
const HULL_EMISSIVE = 0x4fd1ff;    // faint window glow
const HULL_EMISSIVE_BASE = 0.08;
const HULL_EMISSIVE_HOVER = 0.45;  // boost on hover (replaces sphere outline)

const LABEL_FONT = "600 56px ui-monospace, 'JetBrains Mono', Menlo, monospace";
const LABEL_HEIGHT_PX = 128;
const LABEL_PAD_PX = 56;

// Stations are smaller than planets. Bring the visible-size baseline in line
// with how scale=1 used to read for planets so a "scale: 0.22" entry in
// missions.json renders at a sensible size.
const STATION_SCALE_BASE = 1.4;

function createLabelTexture(text: string): { texture: THREE.CanvasTexture; aspect: number } {
  const measure = document.createElement("canvas").getContext("2d");
  let width = 480;
  if (measure) {
    measure.font = LABEL_FONT;
    width = measure.measureText(text).width;
  }
  const canvasW = Math.max(256, Math.ceil(width + LABEL_PAD_PX * 2));
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = LABEL_HEIGHT_PX;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = LABEL_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#dceaff";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, aspect: canvasW / LABEL_HEIGHT_PX };
}

export class Station implements CelestialBody {
  readonly object: THREE.Group;
  private readonly definition: MissionDefinition;

  // The whole station except the label sits under spinningRoot so we can
  // rotate it without rotating the always-camera-facing label sprite.
  private readonly spinningRoot: THREE.Group;
  private readonly hitbox: THREE.Mesh;
  private readonly hullMaterial: THREE.MeshStandardMaterial;
  private readonly accentMaterial: THREE.MeshStandardMaterial;
  private readonly lightMaterial: THREE.MeshBasicMaterial;
  private readonly hitboxMaterial: THREE.MeshBasicMaterial;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly label: THREE.Sprite;
  private readonly labelMaterial: THREE.SpriteMaterial;
  private readonly labelTexture: THREE.CanvasTexture;
  private readonly tipLight: THREE.Mesh;

  private readonly orbitU: THREE.Vector3;
  private readonly orbitV: THREE.Vector3;
  private angle: number;
  private hovered = false;
  // Drives the antenna nav-light blink. Sine-driven so the on/off transition
  // is smooth rather than a hard square wave.
  private blinkPhase = 0;

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

    const s = definition.scale * STATION_SCALE_BASE;

    this.hullMaterial = new THREE.MeshStandardMaterial({
      color: HULL_COLOR,
      metalness: 0.85,
      roughness: 0.32,
      emissive: HULL_EMISSIVE,
      emissiveIntensity: HULL_EMISSIVE_BASE
    });
    this.accentMaterial = new THREE.MeshStandardMaterial({
      color: ACCENT_COLOR,
      metalness: 0.6,
      roughness: 0.5
    });
    this.lightMaterial = new THREE.MeshBasicMaterial({ color: LIGHT_COLOR });

    this.spinningRoot = new THREE.Group();

    // Hub: torus laid flat (the docking ring).
    const hubGeom = new THREE.TorusGeometry(0.55 * s, 0.18 * s, 14, 28);
    this.geometries.push(hubGeom);
    const hub = new THREE.Mesh(hubGeom, this.hullMaterial);
    hub.rotation.x = Math.PI / 2;
    this.spinningRoot.add(hub);

    // Inner accent ring — visual interest inside the hub opening.
    const innerRingGeom = new THREE.TorusGeometry(0.32 * s, 0.045 * s, 8, 24);
    this.geometries.push(innerRingGeom);
    const innerRing = new THREE.Mesh(innerRingGeom, this.accentMaterial);
    innerRing.rotation.x = Math.PI / 2;
    this.spinningRoot.add(innerRing);

    // Central spine.
    const spineGeom = new THREE.CylinderGeometry(0.10 * s, 0.10 * s, 0.85 * s, 16);
    this.geometries.push(spineGeom);
    const spine = new THREE.Mesh(spineGeom, this.hullMaterial);
    this.spinningRoot.add(spine);

    // Solar panel wings.
    const panelGeom = new THREE.BoxGeometry(0.7 * s, 0.025 * s, 0.35 * s);
    this.geometries.push(panelGeom);
    const wingL = new THREE.Mesh(panelGeom, this.accentMaterial);
    wingL.position.x = -0.85 * s;
    this.spinningRoot.add(wingL);
    const wingR = new THREE.Mesh(panelGeom, this.accentMaterial);
    wingR.position.x = 0.85 * s;
    this.spinningRoot.add(wingR);

    // Antenna mast.
    const mastGeom = new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.4 * s, 8);
    this.geometries.push(mastGeom);
    const mast = new THREE.Mesh(mastGeom, this.hullMaterial);
    mast.position.y = 0.62 * s;
    this.spinningRoot.add(mast);

    // Blinking nav light at the tip.
    const tipGeom = new THREE.SphereGeometry(0.05 * s, 10, 8);
    this.geometries.push(tipGeom);
    this.tipLight = new THREE.Mesh(tipGeom, this.lightMaterial);
    this.tipLight.position.y = 0.85 * s;
    this.spinningRoot.add(this.tipLight);

    // Invisible bounding sphere — the only mesh registered with the raycaster
    // so hovers/clicks resolve cleanly without missing the gaps between solar
    // panel and hub.
    const hitGeom = new THREE.SphereGeometry(0.95 * s, 12, 8);
    this.geometries.push(hitGeom);
    this.hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
    this.hitbox = new THREE.Mesh(hitGeom, this.hitboxMaterial);
    this.hitbox.userData.missionId = definition.id;
    this.spinningRoot.add(this.hitbox);

    const { texture: labelTex, aspect: labelAspect } = createLabelTexture(definition.name);
    this.labelTexture = labelTex;
    this.labelMaterial = new THREE.SpriteMaterial({
      map: this.labelTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false
    });
    this.label = new THREE.Sprite(this.labelMaterial);
    const labelHeight = Math.max(0.45, s * 0.5);
    this.label.scale.set(labelHeight * labelAspect, labelHeight, 1);
    this.label.position.set(0, -(s * 0.95 + 0.45), 0);
    this.label.renderOrder = 10;

    this.object = new THREE.Group();
    this.object.add(this.spinningRoot);
    this.object.add(this.label);
    this.positionOnOrbit(null);
  }

  update(dt: number, parentPosition: THREE.Vector3 | null = null): void {
    this.angle += this.definition.orbitSpeed * dt;
    this.positionOnOrbit(parentPosition);

    // Stations spin slower than the planet rotation — they're large and
    // engineered, not freely rotating.
    this.spinningRoot.rotation.y += dt * 0.35;

    // Antenna nav-light pulse. Sine 0..1 → opacity feels like a steady blink.
    this.blinkPhase += dt * 2.2;
    const pulse = 0.55 + 0.45 * Math.sin(this.blinkPhase);
    this.lightMaterial.opacity = pulse;
    this.lightMaterial.transparent = true;

    // Hover effect: instead of a sphere outline (which doesn't match the
    // station silhouette) we boost the hull's emissive so the whole frame
    // glows brighter for a beat.
    const targetEmissive = this.hovered ? HULL_EMISSIVE_HOVER : HULL_EMISSIVE_BASE;
    this.hullMaterial.emissiveIntensity +=
      (targetEmissive - this.hullMaterial.emissiveIntensity) * 0.18;
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
    return this.hitbox;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.hullMaterial.dispose();
    this.accentMaterial.dispose();
    this.lightMaterial.dispose();
    this.hitboxMaterial.dispose();
    this.labelMaterial.dispose();
    this.labelTexture.dispose();
  }

  private positionOnOrbit(parentPosition: THREE.Vector3 | null): void {
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

function hashStringToInt(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
