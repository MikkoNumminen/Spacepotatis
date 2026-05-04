import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installAudioFakes,
  uninstallAudioFakes,
  flushMicrotasks,
  type AudioFakes
} from "./__tests__/fakeAudio";
import type { storyAudio as StoryAudioT } from "./story";
import type { audioBus as AudioBusT } from "./AudioBus";
import type * as UserActivationT from "./userActivation";

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
//  - play() before the first user gesture stays queued; once activated, the
//    bed and voice each fire a single play() and pick up from there.

let fakes: AudioFakes;
let storyAudio: typeof StoryAudioT;
let audioBus: typeof AudioBusT;
let userActivation: typeof UserActivationT;

beforeEach(async () => {
  fakes = installAudioFakes();
  vi.resetModules();
  ({ storyAudio } = await import("./story"));
  ({ audioBus } = await import("./AudioBus"));
  userActivation = await import("./userActivation");
  // Pre-activate so existing tests see the same play() timing as before
  // the autoplay-recovery patch — new tests opt out by importing fresh.
  userActivation._markActivatedForTesting();
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

describe("storyAudio mute via AudioBus", () => {
  it("master mute before the voice timer fires keeps voice silent on resume", async () => {
    storyAudio.play({
      musicSrc: "/audio/story/music.ogg",
      voiceSrc: "/audio/story/voice.mp3",
      voiceDelayMs: 1000
    });
    await flushMicrotasks();
    audioBus.setMasterMuted(true);
    // Even after the delay, voice must NOT auto-play because we're muted.
    vi.advanceTimersByTime(1500);
    await flushMicrotasks();
    const voice = fakes.audio(1);
    expect(voice.playCalls).toBe(0);
    audioBus.setMasterMuted(false);
  });

  it("unmute mid-playback resumes both tracks", async () => {
    storyAudio.play({
      musicSrc: "/audio/story/music.ogg",
      voiceSrc: "/audio/story/voice.mp3",
      voiceDelayMs: 0
    });
    await flushMicrotasks();
    const music = fakes.audio(0);
    audioBus.setMasterMuted(true);
    // The mute path fades to 0 and pauses after VOICE_FADE_OUT_MS=300.
    vi.advanceTimersByTime(400);
    await flushMicrotasks();
    expect(music.paused).toBe(true);
    audioBus.setMasterMuted(false);
    await flushMicrotasks();
    expect(music.paused).toBe(false);
  });
});

describe("storyAudio autoplay recovery (deferred via userActivation)", () => {
  // The default beforeEach calls _markActivatedForTesting(); these tests
  // need a fresh module graph WITHOUT pre-activation so we can observe the
  // queue-then-flush-on-gesture flow that browsers actually exercise after
  // a hard refresh.
  beforeEach(async () => {
    vi.resetModules();
    ({ storyAudio } = await import("./story"));
    ({ audioBus } = await import("./AudioBus"));
    userActivation = await import("./userActivation");
  });

  it("play() before gesture allocates elements but defers the actual play() call", async () => {
    storyAudio.play({
      musicSrc: "/audio/story/music.ogg",
      voiceSrc: "/audio/story/voice.mp3",
      voiceDelayMs: 0
    });
    await flushMicrotasks();
    // Both elements are constructed up-front (so `stop()` has refs to fade
    // out / release), but neither has been told to start.
    expect(fakes.audios()).toHaveLength(2);
    expect(fakes.audio(0).playCalls).toBe(0);
    expect(fakes.audio(1).playCalls).toBe(0);
  });

  it("first user gesture flushes queued music and voice play()s in order", async () => {
    storyAudio.play({
      musicSrc: "/audio/story/music.ogg",
      voiceSrc: "/audio/story/voice.mp3",
      voiceDelayMs: 0
    });
    await flushMicrotasks();
    // Run the voiceDelayMs timer so the voice path queues itself behind
    // userActivation. setTimeout is mocked, so advanceTimersByTime is the
    // way to fire it deterministically; without this the voice queue-push
    // never happens and only music would re-play on activation.
    vi.advanceTimersByTime(1);
    await flushMicrotasks();
    expect(fakes.audio(0).playCalls).toBe(0);
    expect(fakes.audio(1).playCalls).toBe(0);
    userActivation._markActivatedForTesting();
    await flushMicrotasks();
    expect(fakes.audio(0).playCalls).toBe(1);
    expect(fakes.audio(1).playCalls).toBe(1);
  });

  it("voice gesture-queue waits until the voiceDelayMs timer has fired", async () => {
    storyAudio.play({
      musicSrc: "/audio/story/music.ogg",
      voiceSrc: "/audio/story/voice.mp3",
      voiceDelayMs: 1500
    });
    await flushMicrotasks();
    userActivation._markActivatedForTesting();
    await flushMicrotasks();
    // Music plays immediately on activation; voice must respect the delay.
    expect(fakes.audio(0).playCalls).toBe(1);
    expect(fakes.audio(1).playCalls).toBe(0);
    vi.advanceTimersByTime(1600);
    await flushMicrotasks();
    expect(fakes.audio(1).playCalls).toBe(1);
  });

  it("stop() before gesture cancels the queued play so a late activation stays silent", async () => {
    storyAudio.play({
      musicSrc: "/audio/story/music.ogg",
      voiceSrc: "/audio/story/voice.mp3",
      voiceDelayMs: 0
    });
    await flushMicrotasks();
    const [music, voice] = [fakes.audio(0), fakes.audio(1)];
    storyAudio.stop();
    userActivation._markActivatedForTesting();
    await flushMicrotasks();
    expect(music.playCalls).toBe(0);
    expect(voice.playCalls).toBe(0);
  });

  it("a second play() before gesture replaces the first — only the second beat plays on activation", async () => {
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
    // Run timers so both voice setTimeouts fire. The first play()'s timer
    // was already cancelled by the second play()'s stop() call; running
    // them is what gets the b-voice path to queue its play behind
    // activation in the first place.
    vi.advanceTimersByTime(1);
    await flushMicrotasks();
    userActivation._markActivatedForTesting();
    await flushMicrotasks();
    // The first beat's queued callback runs but bails on the ref-equality
    // guard (this.music has been swapped to the b-music element).
    expect(firstMusic.playCalls).toBe(0);
    // Find the b-music element by src — index ordering depends on stop()'s
    // fade-out timing and isn't worth pinning.
    const bMusic = fakes.audios().find((a) => a.src === "/audio/story/b-music.ogg");
    const bVoice = fakes.audios().find((a) => a.src === "/audio/story/b-voice.mp3");
    expect(bMusic?.playCalls).toBe(1);
    expect(bVoice?.playCalls).toBe(1);
  });
});
