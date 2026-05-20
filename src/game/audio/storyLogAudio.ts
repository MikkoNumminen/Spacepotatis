"use client";

import { audioBus } from "./AudioBus";

// PUBLIC API — this engine is part of the `audio` module's contract.
//   Stable. Breaking changes require a coordinated update of every caller.
//   See ./README.md for the rationale.
//
// Dedicated music engine for the Story log experience. Plays a single
// looping bed while the Story menu is open OR while the player is replaying
// any entry from the log — calling play() while already playing is a no-op,
// so the bed never restarts when the user transitions between the list view
// and a replay popup. Mute state owned by AudioBus (category: music).
//
// The replay voice goes through `storyAudio` (with musicSrc: null) so it
// layers on top of this bed without touching it.

const STORY_LOG_MUSIC_PATH = "/audio/story/great-potato-awakening-music.ogg";
const TARGET_VOLUME = 0.45;
const FADE_MS = 800;

// INTERNAL — exposed only via the `storyLogAudio` singleton at file end.
class StoryLogAudio {
  private music: HTMLAudioElement | null = null;
  private fadeRaf: number | null = null;

  constructor() {
    audioBus.register("music", this);
  }

  /**
   * Start the looping bed at a fade-in. Idempotent — calling while already
   * playing is a no-op (the bed never restarts when the user transitions
   * between the Story-log list view and a replay popup).
   *
   * @stable
   */
  play(): void {
    if (this.music) return;
    const music = new Audio(STORY_LOG_MUSIC_PATH);
    music.loop = true;
    music.volume = 0;
    music.preload = "auto";
    this.music = music;
    if (!audioBus.isMuted("music")) {
      void music.play().catch(() => {
        // Autoplay blocked — silent fallback. The user has clicked the
        // Story menu item to get here, so a gesture has happened, but
        // be defensive against odd browser states anyway.
      });
      this.fade(TARGET_VOLUME);
    }
  }

  /**
   * Fade out and release the bed. Called when the player closes the Story
   * menu. Idempotent — safe to call when nothing is playing.
   *
   * @stable
   */
  stop(): void {
    const music = this.music;
    this.music = null;
    if (this.fadeRaf !== null) {
      cancelAnimationFrame(this.fadeRaf);
      this.fadeRaf = null;
    }
    if (!music) return;
    this.fadeOutThenRelease(music);
  }

  /**
   * AudioBus callback. Pauses the bed on mute, resumes on unmute. Volume
   * snaps to target rather than fading because the bed is already at
   * steady-state volume by the time mute toggles can happen.
   *
   * @stable
   */
  setMuted(muted: boolean): void {
    if (!this.music) return;
    if (muted) {
      this.music.pause();
    } else {
      this.music.volume = TARGET_VOLUME;
      void this.music.play().catch(() => {});
    }
  }

  // INTERNAL — every method below is private to the engine.

  private fade(toVol: number): void {
    if (!this.music) return;
    if (this.fadeRaf !== null) cancelAnimationFrame(this.fadeRaf);
    tween(this.music, this.music.volume, toVol, FADE_MS, undefined, (id) => {
      this.fadeRaf = id;
    });
  }

  // INTERNAL — entry point used by stop() to fade out and then release the
  // captured `music` ref. Mirrors fade() but routes the cancel handle into a
  // local closure so the stop() chain can cancel without competing with a
  // subsequent play().
  private fadeOutThenRelease(music: HTMLAudioElement): void {
    if (this.fadeRaf !== null) cancelAnimationFrame(this.fadeRaf);
    tween(
      music,
      music.volume,
      0,
      FADE_MS,
      () => {
        music.pause();
        music.src = "";
      },
      (id) => {
        this.fadeRaf = id;
      }
    );
  }
}

// INTERNAL
//
// Tween an audio element's volume over `durationMs` using rAF. The recursive
// frames each call `setHandle` so the engine's `fadeRaf` field tracks the
// CURRENT scheduled frame — `cancelAnimationFrame(this.fadeRaf)` actually
// stops the chain instead of only stopping the first frame and letting the
// recursive ticks keep running on a released element.
function tween(
  el: HTMLAudioElement,
  fromVol: number,
  toVol: number,
  durationMs: number,
  onDone: (() => void) | undefined,
  setHandle: (id: number | null) => void
): void {
  const start = performance.now();
  const tick = (now: number): void => {
    const t = Math.min(1, (now - start) / Math.max(1, durationMs));
    el.volume = Math.max(0, Math.min(1, fromVol + (toVol - fromVol) * t));
    if (t < 1) {
      setHandle(requestAnimationFrame(tick));
    } else {
      setHandle(null);
      if (onDone) onDone();
    }
  };
  setHandle(requestAnimationFrame(tick));
}

/**
 * Story-log bed. Plays a single looping ambient track while the Story menu
 * is open or the player is replaying any entry from the log. The replay
 * voice goes through `storyAudio.play({ musicSrc: null, ... })` so it
 * layers on top without restarting this bed. Registered with the bus as
 * `music`.
 *
 * @stable
 */
export const storyLogAudio = new StoryLogAudio();
