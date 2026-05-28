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

  // Regression test for the rapid close → open transition: closing the Story
  // menu fires stop() (fade-out begins), then re-opening it before the fade
  // completes used to spawn a second Audio element that briefly overlapped
  // with the still-fading one. The fix reuses the existing element by
  // detecting `fadingOut` and re-fading up to TARGET_VOLUME.
  it("play() during an in-flight fade-out reuses the same element (no second Audio spawned)", async () => {
    storyLogAudio.play();
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
    const el = fakes.audio();
    // Let the fade-in complete so we're at steady-state volume.
    vi.advanceTimersByTime(900);
    expect(el.volume).toBeCloseTo(0.45, 2);

    // Trigger fade-out, then advance partway through it.
    storyLogAudio.stop();
    vi.advanceTimersByTime(400); // half of FADE_MS (800)
    expect(el.paused).toBe(false);
    expect(el.src).not.toBe("");
    expect(el.volume).toBeLessThan(0.45);
    expect(el.volume).toBeGreaterThan(0);

    // Re-open the Story log mid-fadeout. The fix's contract: cancel the
    // fade-out, re-fade the same element up to target. No second Audio.
    storyLogAudio.play();
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
    expect(el.paused).toBe(false);
    expect(el.src).not.toBe("");

    // Let the re-fade-up complete.
    vi.advanceTimersByTime(900);
    expect(el.volume).toBeCloseTo(0.45, 2);

    // Advance well past the cancelled fade-out's deadline. The onDone guard
    // (this.fadingOut && this.music === music) must keep the element alive.
    vi.advanceTimersByTime(2000);
    expect(fakes.audios()).toHaveLength(1);
    expect(el.paused).toBe(false);
    expect(el.src).not.toBe("");
  });

  // After a cancelled fade-out, the next stop() must be a fresh fade-out
  // cycle that DOES release the element. This proves `fadingOut` gets reset
  // by the rapid-toggle play() so the subsequent close path isn't poisoned.
  it("stop() after a cancelled fade-out still releases the element on the next cycle", async () => {
    storyLogAudio.play();
    await flushMicrotasks();
    const el = fakes.audio();
    vi.advanceTimersByTime(900);

    // Rapid close → open cycle that cancels the fade-out.
    storyLogAudio.stop();
    vi.advanceTimersByTime(300);
    storyLogAudio.play();
    await flushMicrotasks();
    vi.advanceTimersByTime(900);
    expect(el.src).not.toBe("");

    // Now a real close: fade-out runs to completion and releases.
    storyLogAudio.stop();
    vi.advanceTimersByTime(900);
    expect(el.paused).toBe(true);
    expect(el.src).toBe("");
  });
});
