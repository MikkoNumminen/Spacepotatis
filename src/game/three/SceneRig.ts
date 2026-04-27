import * as THREE from "three";
import type { MissionDefinition } from "@/types/game";
import { Planet } from "./Planet";
import { Starfield } from "./Starfield";
import { Sun } from "./Sun";

// Captures the ~80% of construction that GalaxyScene and LandingScene shared
// verbatim: WebGLRenderer config, Scene + fog, Starfield, Sun, ambient + rim
// light, and the planet add-loop. Drift between the two scenes here used to
// produce visible flashes on the galaxy↔landing transition; centralizing the
// scaffold removes the only place that drift could come from.
//
// Why a factory and not a base class: GalaxyScene and LandingScene already
// keep camera/controls in their own classes (CameraController vs. an inline
// PerspectiveCamera with auto-orbit). A base class would need protected
// fields that fight the readonly-everywhere style we hold elsewhere.

const CLEAR_COLOR = 0x05060f;
const FOG_DENSITY = 0.008;
const AMBIENT_COLOR = 0x1a2440;
const AMBIENT_INTENSITY = 0.07;
const RIM_COLOR = 0x3a5b8c;
const RIM_INTENSITY = 0.10;
const RIM_POSITION: readonly [number, number, number] = [-10, -2, -8];

export interface SceneRigOpts {
  readonly dpr: number;
  readonly powerPreference: "high-performance" | "low-power";
  readonly sunColor: string;
  readonly sunSize: number;
  readonly planets: readonly MissionDefinition[];
}

export interface SceneRig {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly starfield: Starfield;
  readonly sun: Sun;
  readonly planets: readonly Planet[];
  readonly ambient: THREE.AmbientLight;
  readonly rimLight: THREE.DirectionalLight;
  dispose(): void;
}

export function createSceneRig(canvas: HTMLCanvasElement, opts: SceneRigOpts): SceneRig {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: opts.powerPreference
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.dpr));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setClearColor(CLEAR_COLOR, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(CLEAR_COLOR, FOG_DENSITY);

  const starfield = new Starfield();
  scene.add(starfield.object);

  const sun = new Sun({ coreColor: opts.sunColor, sizeScale: opts.sunSize });
  scene.add(sun.object);

  const ambient = new THREE.AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY);
  const rimLight = new THREE.DirectionalLight(RIM_COLOR, RIM_INTENSITY);
  rimLight.position.set(RIM_POSITION[0], RIM_POSITION[1], RIM_POSITION[2]);
  scene.add(ambient, rimLight);

  const planets: Planet[] = [];
  for (const def of opts.planets) {
    const planet = new Planet(def);
    planets.push(planet);
    scene.add(planet.object);
  }

  return {
    renderer,
    scene,
    starfield,
    sun,
    planets,
    ambient,
    rimLight,
    dispose(): void {
      starfield.dispose();
      sun.dispose();
      for (const planet of planets) planet.dispose();
      renderer.dispose();
    }
  };
}
