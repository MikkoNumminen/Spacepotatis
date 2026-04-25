"use client";

import { useSyncExternalStore } from "react";
import { getState, subscribe, type GameStateShape } from "./GameState";

export function useGameState<T>(selector: (s: GameStateShape) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getState()),
    () => selector(getState())
  );
}
