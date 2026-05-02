import type Phaser from "phaser";
import type { BootData, CombatSummary } from "./config";

// Centralized accessors for Phaser's game-level registry. Each key has a
// single typed getter/setter pair so callers can't accidentally drift on
// key spelling or stuff the wrong shape into the bag.
const REGISTRY_KEYS = {
  summary: "summary",
  bootData: "bootData"
} as const;

export function getSummary(game: Phaser.Game): CombatSummary | undefined {
  return game.registry.get(REGISTRY_KEYS.summary) as CombatSummary | undefined;
}

export function setSummary(game: Phaser.Game, value: CombatSummary): void {
  game.registry.set(REGISTRY_KEYS.summary, value);
}

export function setBootData(game: Phaser.Game, value: BootData): void {
  game.registry.set(REGISTRY_KEYS.bootData, value);
}
