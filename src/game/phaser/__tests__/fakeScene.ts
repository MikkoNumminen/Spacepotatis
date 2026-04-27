import { vi, type Mock } from "vitest";

// Test harness for combat-track unit tests. Mirrors the slice of
// `Phaser.Scene` (and adjacent Phaser surfaces) that the combat helpers
// actually touch — nothing more. Lives in a __tests__ folder so Phaser's
// scene loader never picks it up at runtime, and so coverage doesn't count
// the harness as production code.
//
// Why a hand-rolled fake instead of Phaser itself: real Phaser touches
// `window`/`document` at import time and spins up an Arcade physics world.
// Both are heavyweight and unnecessary for testing helpers that only call
// `scene.physics.add.overlap`, `scene.time.delayedCall`, etc.

export interface DelayedCallEntry {
  readonly delayMs: number;
  readonly callback: () => void;
  fired: boolean;
}

export interface FakeTime {
  now: number;
  delayedCall: Mock;
  readonly queue: DelayedCallEntry[];
  /** Fire every queued delayedCall whose time has come, optionally advancing `now`. */
  advance(deltaMs: number): void;
  /** Fire every queued callback regardless of delay. Used for "all spawns fire" assertions. */
  fireAll(): void;
}

function createFakeTime(): FakeTime {
  const queue: DelayedCallEntry[] = [];
  const time: FakeTime = {
    now: 0,
    queue,
    delayedCall: vi.fn((delayMs: number, callback: () => void) => {
      const entry: DelayedCallEntry = { delayMs, callback, fired: false };
      queue.push(entry);
      return { remove: vi.fn() };
    }),
    advance(deltaMs: number) {
      time.now += deltaMs;
      // Snapshot — callbacks may push new delayedCalls (e.g. WaveManager.advance).
      const due = queue.filter((e) => !e.fired && e.delayMs <= time.now);
      for (const entry of due) {
        entry.fired = true;
        entry.callback();
      }
    },
    fireAll() {
      // Loop because callbacks can enqueue more callbacks (advance() does this).
      // Guard with an iteration cap so a buggy producer can't hang the test.
      for (let guard = 0; guard < 10; guard++) {
        const pending = queue.filter((e) => !e.fired);
        if (pending.length === 0) return;
        for (const entry of pending) {
          entry.fired = true;
          entry.callback();
        }
      }
    }
  };
  return time;
}

export interface KeyStub {
  isDown: boolean;
}

export interface KeyboardStub {
  readonly cursors: { up: KeyStub; down: KeyStub; left: KeyStub; right: KeyStub };
  readonly wasd: { W: KeyStub; A: KeyStub; S: KeyStub; D: KeyStub };
  readonly space: KeyStub;
  readonly alt: KeyStub;
  readonly ctrl: KeyStub;
}

export interface FakeScene {
  add: {
    existing: Mock;
    graphics: Mock;
    text: Mock;
  };
  physics: {
    add: {
      existing: Mock;
      overlap: Mock;
    };
    world: {
      bounds: { x: number; y: number; right: number; bottom: number; width: number; height: number };
    };
  };
  time: FakeTime;
  input: {
    keyboard: {
      stub: KeyboardStub;
      createCursorKeys: Mock;
      addKeys: Mock;
      addKey: Mock;
      addCapture: Mock;
    };
  };
  tweens: { add: Mock };
  cameras: { main: { shake: Mock; flash: Mock } };
  events: {
    emit: Mock;
    on: Mock;
    off: Mock;
    emitted: Array<{ readonly type: string; readonly payload: unknown }>;
  };
  sound: { add: Mock };
  // Convenience accessors mirroring Phaser.Scene.
  scale: { width: number; height: number };
}

function makeKey(): KeyStub {
  return { isDown: false };
}

export function createFakeScene(): FakeScene {
  const stub: KeyboardStub = {
    cursors: { up: makeKey(), down: makeKey(), left: makeKey(), right: makeKey() },
    wasd: { W: makeKey(), A: makeKey(), S: makeKey(), D: makeKey() },
    space: makeKey(),
    alt: makeKey(),
    ctrl: makeKey()
  };

  const emitted: Array<{ readonly type: string; readonly payload: unknown }> = [];

  const time = createFakeTime();

  const flashGraphics = {
    fillStyle: vi.fn(),
    fillCircle: vi.fn(),
    setBlendMode: vi.fn(),
    destroy: vi.fn()
  };

  const textObj = {
    setOrigin: vi.fn(),
    destroy: vi.fn()
  };

  const scene: FakeScene = {
    add: {
      existing: vi.fn(),
      graphics: vi.fn(() => flashGraphics),
      text: vi.fn(() => textObj)
    },
    physics: {
      add: {
        existing: vi.fn(),
        overlap: vi.fn()
      },
      world: {
        bounds: { x: 0, y: 0, right: 960, bottom: 720, width: 960, height: 720 }
      }
    },
    time,
    input: {
      keyboard: {
        stub,
        createCursorKeys: vi.fn(() => stub.cursors),
        addKeys: vi.fn(() => stub.wasd),
        addKey: vi.fn((code: number) => {
          // Phaser.Input.Keyboard.KeyCodes.SPACE === 32, ALT === 18, CTRL === 17.
          if (code === 32) return stub.space;
          if (code === 18) return stub.alt;
          if (code === 17) return stub.ctrl;
          return makeKey();
        }),
        addCapture: vi.fn()
      }
    },
    tweens: { add: vi.fn() },
    cameras: { main: { shake: vi.fn(), flash: vi.fn() } },
    events: {
      emit: vi.fn((type: string, payload: unknown) => {
        emitted.push({ type, payload });
      }),
      on: vi.fn(),
      off: vi.fn(),
      emitted
    },
    sound: { add: vi.fn() },
    scale: { width: 960, height: 720 }
  };
  return scene;
}

// Minimal sprite stub. Many helpers (PlayerCombatant, DropController) accept a
// Phaser.GameObjects.Sprite-shaped argument purely to call setTint/clearTint.
export interface FakeSpriteOptions {
  readonly x?: number;
  readonly y?: number;
}

export function createFakeSprite(opts: FakeSpriteOptions = {}) {
  return {
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    setTint: vi.fn(),
    clearTint: vi.fn(),
    setBlendMode: vi.fn(),
    setOrigin: vi.fn()
  };
}
