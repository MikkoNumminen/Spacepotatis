import * as Phaser from "phaser";

// Input abstraction layer. The Player reads through this interface so future
// input sources (gamepad, touch, remapped keys) only need a new factory.
//
// Single fire key now — every weapon slot fires together when Space is held.
// The old per-slot keys (Alt for sidekicks, Ctrl for rear) went away with
// the slot-array refactor; all slots are forward-firing and there's no
// reason to fire them independently.
export interface Controls {
  moveX(): number; // -1 | 0 | 1
  moveY(): number;
  fire(): boolean; // Space — every active weapon slot
}

export function createKeyboardControls(scene: Phaser.Scene): Controls {
  const kb = scene.input.keyboard;
  if (!kb) throw new Error("Keyboard plugin unavailable");

  const cursors = kb.createCursorKeys();
  const wasd = kb.addKeys("W,A,S,D") as Record<
    "W" | "A" | "S" | "D",
    Phaser.Input.Keyboard.Key
  >;
  const space = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

  // Stop the browser from acting on Space while the game has focus.
  kb.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE]);

  return {
    moveX() {
      let x = 0;
      if (cursors.left.isDown || wasd.A.isDown) x -= 1;
      if (cursors.right.isDown || wasd.D.isDown) x += 1;
      return x;
    },
    moveY() {
      let y = 0;
      if (cursors.up.isDown || wasd.W.isDown) y -= 1;
      if (cursors.down.isDown || wasd.S.isDown) y += 1;
      return y;
    },
    fire() {
      return space.isDown;
    }
  };
}
