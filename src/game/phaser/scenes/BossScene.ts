// BossScene — MVP delegates boss encounters to CombatScene, since the boss
// is just a specialized Enemy (behavior="boss") scripted via waves.json.
// Keep the class here so future phases can split out scripted phase logic
// without changing the game config.
import * as Phaser from "phaser";
import { SCENE_KEYS } from "../config";

export class BossScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.Boss);
  }

  create(): void {
    // Not registered in the game config yet. If you add it later, route
    // boss missions here via CombatScene.handoff() rather than start().
  }
}
