import { describe, expect, it, vi } from "vitest";

// Controls.ts uses Phaser only for the Input.Keyboard.KeyCodes constants and
// the addCapture call. Stub the namespace so the import never reaches Phaser's
// device-detection code (which throws under node).
vi.mock("phaser", () => ({
  Input: {
    Keyboard: {
      KeyCodes: { SPACE: 32, ALT: 18, CTRL: 17 }
    }
  }
}));

import { createKeyboardControls } from "./Controls";
import { createFakeScene } from "../__tests__/fakeScene";

describe("createKeyboardControls", () => {
  it("throws when the keyboard plugin is unavailable", () => {
    const scene = createFakeScene();
    // Replicate the headless-input case (Phaser sets `keyboard` to null
    // when the input plugin is disabled).
    const noKb = { input: { keyboard: null } } as unknown as Parameters<
      typeof createKeyboardControls
    >[0];
    void scene; // keep for parity with other tests
    expect(() => createKeyboardControls(noKb)).toThrow(/Keyboard plugin unavailable/);
  });

  it("registers the WASD key bundle and the single fire key (Space)", () => {
    const scene = createFakeScene();
    createKeyboardControls(scene as never);
    const kb = scene.input.keyboard;
    expect(kb.createCursorKeys).toHaveBeenCalledTimes(1);
    expect(kb.addKeys).toHaveBeenCalledWith("W,A,S,D");
    expect(kb.addKey).toHaveBeenCalledWith(32); // SPACE
    expect(kb.addCapture).toHaveBeenCalledWith([32]);
  });

  it("moveX returns -1 when ArrowLeft is held, +1 when ArrowRight is held, 0 when both", () => {
    const scene = createFakeScene();
    const controls = createKeyboardControls(scene as never);
    const { cursors } = scene.input.keyboard.stub;

    cursors.left.isDown = true;
    expect(controls.moveX()).toBe(-1);

    cursors.left.isDown = false;
    cursors.right.isDown = true;
    expect(controls.moveX()).toBe(1);

    cursors.left.isDown = true;
    cursors.right.isDown = true;
    expect(controls.moveX()).toBe(0);
  });

  it("moveY returns -1 when ArrowUp is held, +1 when ArrowDown is held", () => {
    const scene = createFakeScene();
    const controls = createKeyboardControls(scene as never);
    const { cursors } = scene.input.keyboard.stub;
    cursors.up.isDown = true;
    expect(controls.moveY()).toBe(-1);
    cursors.up.isDown = false;
    cursors.down.isDown = true;
    expect(controls.moveY()).toBe(1);
  });

  it("WASD keys mirror the arrow keys", () => {
    const scene = createFakeScene();
    const controls = createKeyboardControls(scene as never);
    const { wasd } = scene.input.keyboard.stub;

    wasd.A.isDown = true;
    expect(controls.moveX()).toBe(-1);
    wasd.A.isDown = false;

    wasd.D.isDown = true;
    expect(controls.moveX()).toBe(1);
    wasd.D.isDown = false;

    wasd.W.isDown = true;
    expect(controls.moveY()).toBe(-1);
    wasd.W.isDown = false;

    wasd.S.isDown = true;
    expect(controls.moveY()).toBe(1);
  });

  it("arrow + WASD on the same axis stack: both pressed in opposite directions cancel", () => {
    const scene = createFakeScene();
    const controls = createKeyboardControls(scene as never);
    const { cursors, wasd } = scene.input.keyboard.stub;
    cursors.left.isDown = true;
    wasd.D.isDown = true;
    expect(controls.moveX()).toBe(0);
  });

  it("fire follows Space and reports false when Space is up", () => {
    const scene = createFakeScene();
    const controls = createKeyboardControls(scene as never);
    const { space } = scene.input.keyboard.stub;

    expect(controls.fire()).toBe(false);
    space.isDown = true;
    expect(controls.fire()).toBe(true);
  });

  it("returns a fresh, stateful Controls object on each call (no shared state across instances)", () => {
    const scene = createFakeScene();
    const a = createKeyboardControls(scene as never);
    const b = createKeyboardControls(scene as never);
    // Both share the underlying scene's keyboard, but the closures themselves are independent.
    expect(a).not.toBe(b);
    expect(typeof a.moveX).toBe("function");
    expect(typeof b.moveX).toBe("function");
  });
});
