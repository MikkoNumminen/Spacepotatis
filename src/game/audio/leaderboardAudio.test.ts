import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installAudioFakes,
  uninstallAudioFakes,
  flushMicrotasks,
  type AudioFakes
} from "./__tests__/fakeAudio";
import type { leaderboardAudio as LeaderboardAudioT } from "./leaderboardAudio";

// leaderboardAudio is the simplest engine — schedule a one-shot voice with
// a lead-in delay, cancel on stop, mute toggles voice volume.

let fakes: AudioFakes;
let leaderboardAudio: typeof LeaderboardAudioT;

beforeEach(async () => {
  fakes = installAudioFakes();
  vi.resetModules();
  ({ leaderboardAudio } = await import("./leaderboardAudio"));
});

afterEach(() => {
  uninstallAudioFakes();
});

describe("leaderboardAudio", () => {
  it("play(delay) schedules the voice and fires after delayMs", async () => {
    leaderboardAudio.play(800);
    expect(fakes.audios()).toHaveLength(0);
    vi.advanceTimersByTime(799);
    expect(fakes.audios()).toHaveLength(0);
    vi.advanceTimersByTime(2);
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
    expect(fakes.audio().playCalls).toBe(1);
  });

  it("stop() before the lead-in cancels the schedule entirely", async () => {
    leaderboardAudio.play(1000);
    leaderboardAudio.stop();
    vi.advanceTimersByTime(2000);
    expect(fakes.audios()).toHaveLength(0);
  });

  it("calling play() twice cancels the prior schedule (latest wins)", async () => {
    leaderboardAudio.play(1000);
    leaderboardAudio.play(0);
    vi.advanceTimersByTime(0);
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
    // The original 1000ms schedule must NOT also fire.
    vi.advanceTimersByTime(1500);
    expect(fakes.audios()).toHaveLength(1);
  });

  it("setMuted toggles voice volume without releasing the element", async () => {
    leaderboardAudio.play(0);
    vi.advanceTimersByTime(0);
    await flushMicrotasks();
    const voice = fakes.audio();
    expect(voice.volume).toBe(1.0);
    leaderboardAudio.setMuted(true);
    expect(voice.volume).toBe(0);
    leaderboardAudio.setMuted(false);
    expect(voice.volume).toBe(1.0);
  });

  it("voice's `ended` event clears the live reference", async () => {
    leaderboardAudio.play(0);
    vi.advanceTimersByTime(0);
    await flushMicrotasks();
    const voice = fakes.audio();
    voice.fireEnded();
    expect(voice.src).toBe("");
  });
});
