import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installAudioFakes,
  uninstallAudioFakes,
  flushMicrotasks,
  type AudioFakes
} from "./__tests__/fakeAudio";
import type { storyAudio as StoryAudioT } from "./story";

// storyAudio drives the cinematic popup audio: a music bed (optional, may be
// null for replay-from-log entries that should layer onto storyLogAudio's
// bed) plus a delayed voice track. Tests pin the contract that StoryModal
// relies on:
//  - play() with both srcs allocates two elements, fades the bed in, and
//    delays the voice by `voiceDelayMs`.
//  - play() with musicSrc=null only allocates the voice (the bed is owned
//    by another engine in that mode).
//  - stop() faded both tracks to silence and releases them.
//  - setMuted(true) before voice timer fires keeps voice silent forever.

let fakes: AudioFakes;
let storyAudio: typeof StoryAudioT;

beforeEach(async () => {
  fakes = installAudioFakes();
  vi.resetModules();
  ({ storyAudio } = await import("./story"));
});

afterEach(() => {
  uninstallAudioFakes();
});

describe("storyAudio.play", () => {
  it("allocates a music + voice element and delays voice playback", async () => {
    storyAudio.play({
      musicSrc: "/audio/story/music.ogg",
      voiceSrc: "/audio/story/voice.mp3",
      voiceDelayMs: 500
    });
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(2);
    const [music, voice] = [fakes.audio(0), fakes.audio(1)];
    expect(music.src).toBe("/audio/story/music.ogg");
    expect(music.loop).toBe(true);
    expect(music.playCalls).toBe(1);
    expect(voice.src).toBe("/audio/story/voice.mp3");
    expect(voice.loop).toBe(false);
    // Voice is held for voiceDelayMs.
    expect(voice.playCalls).toBe(0);
    vi.advanceTimersByTime(500);
    await flushMicrotasks();
    expect(voice.playCalls).toBe(1);
  });

  it("with musicSrc=null only allocates the voice element", async () => {
    storyAudio.play({
      musicSrc: null,
      voiceSrc: "/audio/story/voice.mp3",
      voiceDelayMs: 0
    });
    await flushMicrotasks();
    expect(fakes.audios()).toHaveLength(1);
    expect(fakes.audio().src).toBe("/audio/story/voice.mp3");
  });

  it("starting a second play() while the first is active stops the first", async () => {
    storyAudio.play({
      musicSrc: "/audio/story/a-music.ogg",
      voiceSrc: "/audio/story/a-voice.mp3",
      voiceDelayMs: 0
    });
    await flushMicrotasks();
    const firstMusic = fakes.audio(0);
    storyAudio.play({
      musicSrc: "/audio/story/b-music.ogg",
      voiceSrc: "/audio/story/b-voice.mp3",
      voiceDelayMs: 0
    });
    await flushMicrotasks();
    // First music is faded out; advance past the 1500ms fade-out.
    vi.advanceTimersByTime(1600);
    expect(firstMusic.paused).toBe(true);
    expect(firstMusic.src).toBe("");
  });
});

describe("storyAudio.stop", () => {
  it("fades both tracks to 0 and releases them", async () => {
    storyAudio.play({
      musicSrc: "/audio/story/music.ogg",
      voiceSrc: "/audio/story/voice.mp3",
      voiceDelayMs: 0
    });
    await flushMicrotasks();
    const [music, voice] = [fakes.audio(0), fakes.audio(1)];
    storyAudio.stop();
    vi.advanceTimersByTime(2000);
    expect(music.paused).toBe(true);
    expect(music.src).toBe("");
    expect(voice.paused).toBe(true);
    expect(voice.src).toBe("");
  });
});

describe("storyAudio.setMuted", () => {
  it("setMuted(true) before the voice timer fires keeps voice silent on resume", async () => {
    storyAudio.play({
      musicSrc: "/audio/story/music.ogg",
      voiceSrc: "/audio/story/voice.mp3",
      voiceDelayMs: 1000
    });
    await flushMicrotasks();
    storyAudio.setMuted(true);
    // Even after the delay, voice must NOT auto-play because we're muted.
    vi.advanceTimersByTime(1500);
    await flushMicrotasks();
    const voice = fakes.audio(1);
    expect(voice.playCalls).toBe(0);
  });

  it("setMuted(false) mid-playback resumes both tracks", async () => {
    storyAudio.play({
      musicSrc: "/audio/story/music.ogg",
      voiceSrc: "/audio/story/voice.mp3",
      voiceDelayMs: 0
    });
    await flushMicrotasks();
    const music = fakes.audio(0);
    storyAudio.setMuted(true);
    // The mute path fades to 0 and pauses after VOICE_FADE_OUT_MS=300.
    vi.advanceTimersByTime(400);
    await flushMicrotasks();
    expect(music.paused).toBe(true);
    storyAudio.setMuted(false);
    await flushMicrotasks();
    expect(music.paused).toBe(false);
  });
});
