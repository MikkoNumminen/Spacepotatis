import * as Phaser from "phaser";

// Input abstraction layer. The Player reads through this interface so future
// input sources (gamepad, touch, remapped keys) only need a new factory.
export interface Controls {
  moveX(): number; // -1 | 0 | 1
  moveY(): number;
  firePrimary(): boolean;    // Space — main cannons (held to fire)
  fireSecondary(): boolean;  // Alt — reserved for future ability
  fireTertiary(): boolean;   // Ctrl — reserved for future ability
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
  const alt = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ALT);
  const ctrl = kb.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);

  // Stop the browser from acting on Space/Alt/Ctrl while the game has focus.
  kb.addCapture([
    Phaser.Input.Keyboard.KeyCodes.SPACE,
    Phaser.Input.Keyboard.KeyCodes.ALT,
    Phaser.Input.Keyboard.KeyCodes.CTRL
  ]);

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
    firePrimary() {
      return space.isDown;
    },
    fireSecondary() {
      return alt.isDown;
    },
    fireTertiary() {
      return ctrl.isDown;
    }
  };
}
