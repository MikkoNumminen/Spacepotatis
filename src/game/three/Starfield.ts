import * as THREE from "three";

const STAR_COUNT = 2000;
const INNER_RADIUS = 80;
const OUTER_RADIUS = 220;

export class Starfield {
  readonly object: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor() {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const color = new THREE.Color();

    for (let i = 0; i < STAR_COUNT; i++) {
      const r = INNER_RADIUS + Math.random() * (OUTER_RADIUS - INNER_RADIUS);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Slight hue variation: cyan → white → amber.
      const t = Math.random();
      if (t < 0.15) color.setRGB(1.0, 0.85, 0.55);
      else if (t < 0.45) color.setRGB(0.65, 0.9, 1.0);
      else color.setRGB(1.0, 1.0, 1.0);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    this.material = new THREE.PointsMaterial({
      size: 0.6,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });

    this.object = new THREE.Points(this.geometry, this.material);
    this.object.frustumCulled = false;
  }

  update(dt: number): void {
    this.object.rotation.y += dt * 0.01;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
