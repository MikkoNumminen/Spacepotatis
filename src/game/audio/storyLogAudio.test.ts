import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installAudioFakes,
  uninstallAudioFakes,
  flushMicrotasks,
  type AudioFakes
} from "./__tests__/fakeAudio";
import type { storyLogAudio as StoryLogAudioT } from "./storyLogAudio";

// storyLogAudio is a small dedicated bed for the Story log experience.
// Contract: play() is idempotent (calling while already playing is a no-op
// so the bed never restarts when the user transitions list view → replay
// popup), stop() releases the element, mute pauses without releasing.

let fakes: AudioFakes;
let storyLogAudio: typeof StoryLogAudioT;

beforeEach(async () => {
  fakes = installAudioFakes();
  vi.resetModules();
  ({ storyLogAudio } = await import("./storyLogAudio"));
});

afterEach(() => {
  uninstallAudioFakes();
});

describe("storyLogAudio", () => {
  it("play() allocates a single looped Audio element and starts playback", async () => {
    storyLogAudio.play();
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
    const el = fakes.audio();
    expect(el.loop).toBe(true);
    expect(el.playCalls).toBe(1);
  });

  it("play() while already playing is a no-op (bed must not restart)", async () => {
    storyLogAudio.play();
    await flushMicrotasks();
    storyLogAudio.play();
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
    expect(fakes.audio().playCalls).toBe(1);
  });

  it("stop() fades out and releases the element", async () => {
    storyLogAudio.play();
    await flushMicrotasks();
    const el = fakes.audio();
    storyLogAudio.stop();
    // FADE_MS = 800
    vi.advanceTimersByTime(900);
    expect(el.paused).toBe(true);
    expect(el.src).toBe("");
  });

  it("setMuted(true) pauses the bed; setMuted(false) resumes it", async () => {
    storyLogAudio.play();
    await flushMicrotasks();
    const el = fakes.audio();
    storyLogAudio.setMuted(true);
    expect(el.paused).toBe(true);
    storyLogAudio.setMuted(false);
    await flushMicrotasks();
    expect(el.paused).toBe(false);
  });
});
