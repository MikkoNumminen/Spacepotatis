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
  // Cues that follow the /audio/ui/<kebab-id>-voice.mp3 convention.
  const uiPatternIds: readonly UiCueId[] = [
    "upgradeMark",
    "augmentPickerOpen",
    "installAugment",
    "sellWeapon",
    "sellAugment",
    "slotPickerOpen",
    "equipWeapon",
    "unequipWeapon"
  ];

  // Cleared-state cues live under /audio/sfx/ alongside ui_shop_* voice
  // files for historical grouping reasons. The two patterns coexist.
  const sfxPatternIds: readonly UiCueId[] = ["systemCleared", "everythingCleared"];

  it("has exactly the 10 expected ids", () => {
    expect(Object.keys(UI_CUE)).toHaveLength(10);
    expect(Object.keys(UI_CUE).sort()).toEqual([...uiPatternIds, ...sfxPatternIds].sort());
  });

  it("ui-pattern cues live at /audio/ui/<kebab(key)>-voice.mp3", () => {
    for (const id of uiPatternIds) {
      expect(UI_CUE[id]).toBe(`/audio/ui/${camelToKebab(id)}-voice.mp3`);
    }
  });

  it("sfx-pattern cues live at /audio/sfx/ui_<snake(key)>.mp3", () => {
    // systemCleared -> ui_system_cleared.mp3
    expect(UI_CUE.systemCleared).toBe("/audio/sfx/ui_system_cleared.mp3");
    expect(UI_CUE.everythingCleared).toBe("/audio/sfx/ui_everything_cleared.mp3");
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
