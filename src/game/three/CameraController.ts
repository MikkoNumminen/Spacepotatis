import * as THREE from "three";

interface Options {
  minRadius: number;
  maxRadius: number;
  initialRadius: number;
  initialPolar: number;
}

const DEFAULTS: Options = {
  minRadius: 8,
  maxRadius: 60,
  initialRadius: 32,
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
  private activePointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;

  private pinchActive = false;
  private pinchStartDist = 0;
  private pinchStartRadius = 0;

  private readonly onPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
  private readonly onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
  private readonly onPointerUp = (e: PointerEvent) => this.handlePointerUp(e);
  private readonly onPointerCancel = (e: PointerEvent) => this.handlePointerUp(e);
  private readonly onWheel = (e: WheelEvent) => this.handleWheel(e);
  private readonly onTouchStart = (e: TouchEvent) => this.handleTouchStart(e);
  private readonly onTouchMove = (e: TouchEvent) => this.handleTouchMove(e);
  private readonly onTouchEnd = (e: TouchEvent) => this.handleTouchEnd(e);

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
    element.addEventListener("pointermove", this.onPointerMove);
    element.addEventListener("pointerup", this.onPointerUp);
    element.addEventListener("pointercancel", this.onPointerCancel);
    element.addEventListener("wheel", this.onWheel, { passive: false });
    element.addEventListener("touchstart", this.onTouchStart, { passive: false });
    element.addEventListener("touchmove", this.onTouchMove, { passive: false });
    element.addEventListener("touchend", this.onTouchEnd);
    element.addEventListener("touchcancel", this.onTouchEnd);
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
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerCancel);
    this.element.removeEventListener("wheel", this.onWheel);
    this.element.removeEventListener("touchstart", this.onTouchStart);
    this.element.removeEventListener("touchmove", this.onTouchMove);
    this.element.removeEventListener("touchend", this.onTouchEnd);
    this.element.removeEventListener("touchcancel", this.onTouchEnd);
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
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (this.pinchActive) return;
    this.dragging = true;
    this.activePointerId = e.pointerId;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    // Pointer capture guarantees move/up still fire when the finger leaves the
    // canvas mid-drag — without it, mobile drags get stuck on quick swipes.
    this.element.setPointerCapture?.(e.pointerId);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
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
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
    this.dragging = false;
    this.activePointerId = null;
    if (this.element.hasPointerCapture?.(e.pointerId)) {
      this.element.releasePointerCapture(e.pointerId);
    }
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

  private handleTouchStart(e: TouchEvent): void {
    const a = e.touches[0];
    const b = e.touches[1];
    if (a && b) {
      e.preventDefault();
      this.pinchActive = true;
      // Cancel any in-flight rotation drag; the second finger means pinch.
      this.dragging = false;
      this.activePointerId = null;
      this.pinchStartDist = touchDistance(a, b);
      this.pinchStartRadius = this.targetRadius;
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.pinchActive) return;
    const a = e.touches[0];
    const b = e.touches[1];
    if (!a || !b) return;
    e.preventDefault();
    const dist = touchDistance(a, b);
    if (dist <= 0 || this.pinchStartDist <= 0) return;
    const ratio = this.pinchStartDist / dist;
    this.targetRadius = THREE.MathUtils.clamp(
      this.pinchStartRadius * ratio,
      this.opts.minRadius,
      this.opts.maxRadius
    );
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (e.touches.length < 2) {
      this.pinchActive = false;
      this.pinchStartDist = 0;
    }
  }
}

function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}
