import type Phaser from "phaser";

// Typed combat-scene event bus. Emitting and subscribing through these
// wrappers keeps the event names and payloads in one place — Phaser's
// scene.events otherwise accepts any string with any payload.
export type CombatEvent =
  | { readonly type: "playerDied" }
  | { readonly type: "allWavesComplete" }
  | { readonly type: "abandon" };

export type CombatEventType = CombatEvent["type"];

export function emit<E extends CombatEvent>(scene: Phaser.Scene, event: E): void {
  scene.events.emit(event.type, event);
}

export function on<T extends CombatEventType>(
  scene: Phaser.Scene,
  type: T,
  handler: (event: Extract<CombatEvent, { type: T }>) => void
): void {
  scene.events.on(type, handler);
}
