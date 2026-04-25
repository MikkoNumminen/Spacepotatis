import * as THREE from "three";
import type { MissionDefinition, MissionId } from "@/types/game";

const BASE_RADIUS = 0.9;

const DIFFICULTY_COLOR: Record<1 | 2 | 3, number> = {
  1: 0x5effa7, // easy = green
  2: 0xffcc33, // medium = amber
  3: 0xff4d6d  // hard = red
};

const SHOP_COLOR = 0x4fd1ff;

export class Planet {
  readonly object: THREE.Group;
  private readonly mesh: THREE.Mesh;
  private readonly outline: THREE.Mesh;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly outlineMaterial: THREE.MeshBasicMaterial;
  private readonly geometry: THREE.SphereGeometry;
  private readonly outlineGeometry: THREE.SphereGeometry;
  private readonly definition: MissionDefinition;
  private angle: number;
  private hovered = false;

  constructor(definition: MissionDefinition, textureLoader: THREE.TextureLoader) {
    this.definition = definition;
    this.angle = definition.startAngle;

    const radius = BASE_RADIUS * definition.scale;
    this.geometry = new THREE.SphereGeometry(radius, 48, 32);

    const baseColor =
      definition.kind === "shop" ? SHOP_COLOR : DIFFICULTY_COLOR[definition.difficulty];

    this.material = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.85,
      metalness: 0.05,
      emissive: baseColor,
      emissiveIntensity: 0.12
    });

    textureLoader.load(
      definition.texture,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        this.material.map = tex;
        this.material.emissiveIntensity = 0.04;
        this.material.needsUpdate = true;
      },
      undefined,
      () => {
        // Texture missing in /public/textures/planets — keep the flat color fallback.
      }
    );

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

    this.object = new THREE.Group();
    this.object.add(this.outline);
    this.object.add(this.mesh);
    this.positionOnOrbit();
  }

  update(dt: number): void {
    this.angle += this.definition.orbitSpeed * dt;
    this.positionOnOrbit();
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

  dispose(): void {
    this.geometry.dispose();
    this.outlineGeometry.dispose();
    this.material.dispose();
    this.outlineMaterial.dispose();
    this.material.map?.dispose();
  }

  private positionOnOrbit(): void {
    this.object.position.set(
      Math.cos(this.angle) * this.definition.orbitRadius,
      Math.sin(this.angle * 0.5) * 0.6,
      Math.sin(this.angle) * this.definition.orbitRadius
    );
  }
}
