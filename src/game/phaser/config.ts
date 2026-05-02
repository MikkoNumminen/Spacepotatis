import type { MissionId } from "@/types/game";
import type { MissionReward } from "@/game/state/rewards";
import { getSummary, setBootData } from "./registry";

export const VIRTUAL_WIDTH = 960;
export const VIRTUAL_HEIGHT = 720;

export const SCENE_KEYS = {
  Boot: "BootScene",
  Combat: "CombatScene",
  Boss: "BossScene",
  Pause: "PauseScene"
} as const;

export interface BootData {
  missionId: MissionId;
  onComplete: () => void;
}

export interface CombatSummary {
  missionId: MissionId;
  score: number;
  credits: number;
  timeSeconds: number;
  victory: boolean;
  // Set only when this run was the player's first clear of the mission. The
  // banner shows it as an extra "+ first clear" line; replays leave it
  // undefined so they read as standard mission completes.
  firstClearReward?: MissionReward;
}

export async function createPhaserGame(
  parent: HTMLElement,
  opts: { missionId: MissionId; onComplete: (summary: CombatSummary) => void }
): Promise<import("phaser").Game> {
  const Phaser = await import("phaser");
  const { BootScene } = await import("./scenes/BootScene");
  const { CombatScene } = await import("./scenes/CombatScene");
  const { PauseScene } = await import("./scenes/PauseScene");

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIRTUAL_WIDTH,
    height: VIRTUAL_HEIGHT,
    backgroundColor: "#05060f",
    pixelArt: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
      default: "arcade",
      arcade: { debug: false, gravity: { x: 0, y: 0 } }
    },
    banner: false,
    scene: [BootScene, CombatScene, PauseScene]
  });

  const data: BootData = {
    missionId: opts.missionId,
    onComplete: () => {
      // Summary populated by CombatScene.finish() before calling onComplete via registry.
      const summary = getSummary(game);
      opts.onComplete(
        summary ?? {
          missionId: opts.missionId,
          score: 0,
          credits: 0,
          timeSeconds: 0,
          victory: false
        }
      );
    }
  };
  setBootData(game, data);
  game.scene.start(SCENE_KEYS.Boot, data);

  return game;
}
