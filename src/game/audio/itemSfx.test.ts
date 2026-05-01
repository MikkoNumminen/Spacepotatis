import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installAudioFakes,
  uninstallAudioFakes,
  flushMicrotasks,
  type AudioFakes
} from "./__tests__/fakeAudio";
import type { itemSfx as ItemSfxT } from "./itemSfx";

// itemSfx must spawn a fresh Audio per fire and release it on `ended` /
// `error` / play() rejection — the iOS HTMLAudioElement budget doesn't
// tolerate persistent template elements. Money() is throttled to avoid
// stepping on itself during a wave clear.

let fakes: AudioFakes;
let itemSfx: typeof ItemSfxT;

beforeEach(async () => {
  fakes = installAudioFakes();
  vi.resetModules();
  ({ itemSfx } = await import("./itemSfx"));
});

afterEach(() => {
  uninstallAudioFakes();
});

describe("itemSfx fire-and-release", () => {
  it("weapon() spawns one Audio with preload=none and play() called", async () => {
    itemSfx.weapon();
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
    const el = fakes.audio();
    expect(el.preload).toBe("none");
    expect(el.playCalls).toBe(1);
    expect(el.src).toBe("/audio/sfx/ui_shop_gun.mp3");
  });

  it("releases src on `ended` so the slot frees for iOS budget", async () => {
    itemSfx.shield();
    await flushMicrotasks();
    const el = fakes.audio();
    el.fireEnded();
    expect(el.src).toBe("");
  });

  it("releases src on `error` (e.g. missing asset)", async () => {
    itemSfx.augment();
    await flushMicrotasks();
    const el = fakes.audio();
    el.fireError();
    expect(el.src).toBe("");
  });

  it("releases src when play() rejects (autoplay block)", async () => {
    fakes.setNextPlayBehavior("reject");
    itemSfx.upgrade();
    await flushMicrotasks();
    const el = fakes.audio();
    expect(el.src).toBe("");
  });

  it("setMuted(true) makes subsequent fires no-op (no Audio allocated)", async () => {
    itemSfx.setMuted(true);
    itemSfx.weapon();
    itemSfx.shield();
    itemSfx.augment();
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(0);
  });
});

describe("itemSfx.money throttle", () => {
  // The throttle compares `performance.now() - lastMoneyAt`. Both start at 0
  // under fake timers, so the first call would self-drop unless we advance
  // past the cooldown window first. Real-world boot lands at performance.now
  // well past zero, so this is a fake-timer artifact, not engine behavior.
  it("subsequent money() calls within the cooldown drop", async () => {
    vi.advanceTimersByTime(2000);
    itemSfx.money();
    itemSfx.money();
    itemSfx.money();
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
  });

  it("money() fires again after the cooldown elapses", async () => {
    vi.advanceTimersByTime(2000);
    itemSfx.money();
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
    // MONEY_COOLDOWN_MS = 1800.
    vi.advanceTimersByTime(1900);
    itemSfx.money();
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(2);
  });
});

describe("itemSfx.perk", () => {
  it("plays the per-perk voice path", async () => {
    itemSfx.perk("overdrive");
    await flushMicrotasks();
    expect(fakes.audio().src).toBe("/audio/sfx/ui_perk_overdrive.mp3");
  });
});
