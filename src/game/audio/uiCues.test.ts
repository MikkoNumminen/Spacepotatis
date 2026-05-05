import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installAudioFakes,
  uninstallAudioFakes,
  flushMicrotasks,
  type AudioFakes
} from "./__tests__/fakeAudio";
import type { UI_CUE as UiCueT, UiCueId, playUiCue as PlayUiCueT } from "./uiCues";
import type * as UserActivationT from "./userActivation";

// uiCues exposes one-shot Grandma voice cues for shop-UI actions. Each path
// is a separate /audio/ui/<kebab-id>-voice.mp3 file. playUiCue delegates to
// storyAudio.play with musicSrc=null so the cue reuses storyAudio's single
// voice slot — a second cue preempts the first, matching click-spam UX.

const camelToKebab = (s: string): string =>
  s.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);

let fakes: AudioFakes;
let UI_CUE: typeof UiCueT;
let playUiCue: typeof PlayUiCueT;
let userActivation: typeof UserActivationT;

beforeEach(async () => {
  fakes = installAudioFakes();
  vi.resetModules();
  ({ UI_CUE, playUiCue } = await import("./uiCues"));
  await import("./story");
  userActivation = await import("./userActivation");
  userActivation._markActivatedForTesting();
});

afterEach(() => {
  uninstallAudioFakes();
});

describe("UI_CUE path-id alignment", () => {
  const expectedIds: readonly UiCueId[] = [
    "upgradeMark",
    "augmentPickerOpen",
    "installAugment",
    "sellWeapon",
    "sellAugment",
    "slotPickerOpen",
    "equipWeapon",
    "unequipWeapon"
  ];

  it("has exactly the 8 expected ids", () => {
    expect(Object.keys(UI_CUE)).toHaveLength(8);
    expect(Object.keys(UI_CUE).sort()).toEqual([...expectedIds].sort());
  });

  it("each path is /audio/ui/<kebab(key)>-voice.mp3", () => {
    for (const id of expectedIds) {
      expect(UI_CUE[id]).toBe(`/audio/ui/${camelToKebab(id)}-voice.mp3`);
    }
  });

  it("every path starts with /audio/ui/ and ends with -voice.mp3", () => {
    for (const id of expectedIds) {
      const path = UI_CUE[id];
      expect(path.startsWith("/audio/ui/")).toBe(true);
      expect(path.endsWith("-voice.mp3")).toBe(true);
    }
  });
});

describe("playUiCue delegation", () => {
  it("plays each cue's path on storyAudio's voice slot (no music element)", async () => {
    const ids = Object.keys(UI_CUE) as UiCueId[];
    for (const id of ids) {
      playUiCue(id);
      // storyAudio.play wraps the voice start in a setTimeout(voiceDelayMs)
      // even when delay is 0, so we advance fake timers to flush the queued
      // play() call before asserting playCalls.
      vi.advanceTimersByTime(1);
      await flushMicrotasks();
      const latest = fakes.audios()[fakes.audios().length - 1];
      if (!latest) throw new Error(`expected an Audio element after playUiCue("${id}")`);
      expect(latest.src).toBe(UI_CUE[id]);
      expect(latest.playCalls).toBe(1);
    }
    // musicSrc=null path allocates only the voice element, so the running
    // total should equal the cue count exactly.
    expect(fakes.audios()).toHaveLength(ids.length);
  });

  it("a second cue preempts the first — previous voice is stopped and released", async () => {
    playUiCue("equipWeapon");
    vi.advanceTimersByTime(1);
    await flushMicrotasks();
    const first = fakes.audio(0);
    expect(first.src).toBe(UI_CUE.equipWeapon);
    expect(first.playCalls).toBe(1);
    playUiCue("sellWeapon");
    // storyAudio fades the previous voice out over VOICE_FADE_OUT_MS=300,
    // and queues the second voice's play() behind setTimeout(voiceDelayMs).
    vi.advanceTimersByTime(400);
    await flushMicrotasks();
    expect(first.paused).toBe(true);
    expect(first.src).toBe("");
    const second = fakes.audios().find((a) => a.src === UI_CUE.sellWeapon);
    expect(second?.playCalls).toBe(1);
  });
});
