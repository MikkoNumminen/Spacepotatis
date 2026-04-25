import * as THREE from "three";

interface Options {
  minRadius: number;
  maxRadius: number;
  initialRadius: number;
  initialPolar: number;
}

const DEFAULTS: Options = {
  minRadius: 8,
  maxRadius: 45,
  initialRadius: 22,
  initialPolar: Math.PI / 3
};

export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  private readonly element: HTMLElement;
  private readonly opts: Options;

  private radius: number;
  private azimuth = 0;
  private polar: number;

  private targetRadius: number;
  private targetAzimuth = 0;
  private targetPolar: number;

  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  private readonly onPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
  private readonly onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
  private readonly onPointerUp = (e: PointerEvent) => this.handlePointerUp(e);
  private readonly onWheel = (e: WheelEvent) => this.handleWheel(e);

  constructor(element: HTMLElement, aspect: number, options: Partial<Options> = {}) {
    this.element = element;
    this.opts = { ...DEFAULTS, ...options };

    this.radius = this.opts.initialRadius;
    this.targetRadius = this.radius;
    this.polar = this.opts.initialPolar;
    this.targetPolar = this.polar;

    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 1000);
    this.apply();

    element.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    element.addEventListener("wheel", this.onWheel, { passive: false });
  }

  update(_dt: number): void {
    this.radius += (this.targetRadius - this.radius) * 0.18;
    this.azimuth += (this.targetAzimuth - this.azimuth) * 0.18;
    this.polar += (this.targetPolar - this.polar) * 0.18;
    this.apply();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("wheel", this.onWheel);
  }

  private apply(): void {
    const sinPolar = Math.sin(this.polar);
    const x = this.radius * sinPolar * Math.cos(this.azimuth);
    const y = this.radius * Math.cos(this.polar);
    const z = this.radius * sinPolar * Math.sin(this.azimuth);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.element.setPointerCapture?.(e.pointerId);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    this.targetAzimuth -= dx * 0.006;
    this.targetPolar = THREE.MathUtils.clamp(
      this.targetPolar - dy * 0.005,
      0.25,
      Math.PI - 0.25
    );
  }

  private handlePointerUp(e: PointerEvent): void {
    this.dragging = false;
    this.element.releasePointerCapture?.(e.pointerId);
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.001);
    this.targetRadius = THREE.MathUtils.clamp(
      this.targetRadius * factor,
      this.opts.minRadius,
      this.opts.maxRadius
    );
  }
}
