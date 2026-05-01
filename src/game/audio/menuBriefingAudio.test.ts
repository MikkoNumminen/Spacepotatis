import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installAudioFakes,
  uninstallAudioFakes,
  flushMicrotasks,
  type AudioFakes
} from "./__tests__/fakeAudio";
import type { menuBriefingAudio as MenuBriefingAudioT } from "./menuBriefingAudio";

// menuBriefingAudio plays a queue of voice clips with per-item lead-in gaps.
// Contracts:
//  - Each item starts after its gap; the next item starts after the previous
//    one's `ended` event PLUS the next item's gap.
//  - On autoplay-block (play() rejection), the queue stalls until arm() is
//    called from a user gesture; arm() resumes from the stalled item.
//  - stop() cancels the queue and releases the live voice.

let fakes: AudioFakes;
let menuBriefingAudio: typeof MenuBriefingAudioT;

beforeEach(async () => {
  fakes = installAudioFakes();
  vi.resetModules();
  ({ menuBriefingAudio } = await import("./menuBriefingAudio"));
});

afterEach(() => {
  uninstallAudioFakes();
});

describe("menuBriefingAudio.playSequence", () => {
  it("plays items in order, advancing on `ended`", async () => {
    menuBriefingAudio.playSequence([
      { src: "/a.mp3", gapBeforeMs: 0 },
      { src: "/b.mp3", gapBeforeMs: 200 }
    ]);
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
    expect(fakes.audio(0).src).toBe("/a.mp3");
    fakes.audio(0).fireEnded();
    // After ended, next item is scheduled with gapBeforeMs=200.
    vi.advanceTimersByTime(199);
    expect(fakes.audios()).toHaveLength(1);
    vi.advanceTimersByTime(2);
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(2);
    expect(fakes.audio(1).src).toBe("/b.mp3");
  });

  it("stop() cancels pending gap and releases the live voice", async () => {
    menuBriefingAudio.playSequence([
      { src: "/a.mp3", gapBeforeMs: 0 },
      { src: "/b.mp3", gapBeforeMs: 1000 }
    ]);
    await flushMicrotasks();
    const a = fakes.audio(0);
    a.fireEnded();
    // Now the next item is scheduled — interrupt before it fires.
    menuBriefingAudio.stop();
    vi.advanceTimersByTime(2000);
    expect(fakes.audios()).toHaveLength(1);
  });
});

describe("menuBriefingAudio.arm (autoplay-block recovery)", () => {
  it("arm() retries the stalled item after play() rejection", async () => {
    fakes.setNextPlayBehavior("reject");
    menuBriefingAudio.playSequence([{ src: "/a.mp3", gapBeforeMs: 0 }]);
    await flushMicrotasks();
    // First Audio element was created and play() rejected.
    expect(fakes.audios()).toHaveLength(1);
    expect(fakes.audio(0).playCalls).toBe(1);
    // arm() should retry by spawning a fresh Audio (the stalled one was
    // released on rejection).
    fakes.setNextPlayBehavior("resolve");
    menuBriefingAudio.arm();
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(2);
    expect(fakes.audio(1).playCalls).toBe(1);
    expect(fakes.audio(1).paused).toBe(false);
  });

  it("arm() while playback is healthy is a no-op", async () => {
    menuBriefingAudio.playSequence([{ src: "/a.mp3", gapBeforeMs: 0 }]);
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
    menuBriefingAudio.arm();
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
  });
});

describe("menuBriefingAudio.setMuted", () => {
  it("toggles voice volume between 0 and 1.0 without restarting playback", async () => {
    menuBriefingAudio.playSequence([{ src: "/a.mp3", gapBeforeMs: 0 }]);
    await flushMicrotasks();
    const voice = fakes.audio();
    expect(voice.volume).toBe(1.0);
    menuBriefingAudio.setMuted(true);
    expect(voice.volume).toBe(0);
    menuBriefingAudio.setMuted(false);
    expect(voice.volume).toBe(1.0);
    expect(voice.playCalls).toBe(1);
  });
});
