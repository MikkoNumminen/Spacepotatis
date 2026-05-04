"use client";

import { audioBus } from "./AudioBus";

// PUBLIC API — this engine is part of the `audio` module's contract.
//   Stable. Breaking changes require a coordinated update of every caller.
//   See ./README.md for the rationale.
//
// Voice queue for the landing page. Plays a series of nudge clips with a
// configurable gap between each, ending with the system-briefing lecture.
// The full sequence runs once per browser session (sessionStorage gate set
// by the caller) and is cancelled the moment the player commits to entering
// the game (PLAY/CONTINUE click).
//
// Independent of menuMusic — that bed keeps running underneath. Mute state
// is owned by AudioBus (category: voice); flipping the toggle sets
// voice.volume to 0 without pausing the queue, so timing stays stable
// across mute toggles.

const TARGET_VOLUME = 1.0;

/**
 * One item in a menu-briefing voice queue. The first item typically uses
 * `gapBeforeMs: 0`; subsequent items count their gap from the previous
 * item's `ended` event so the natural pause-and-respond cadence falls out
 * of declaring a list of (src, gap) pairs.
 *
 * @stable
 */
export interface MenuBriefingItem {
  readonly src: string;
  readonly gapBeforeMs: number;
}

// INTERNAL — exposed only via the `menuBriefingAudio` singleton at file end.
class MenuBriefingAudio {
  private voice: HTMLAudioElement | null = null;
  private queue: readonly MenuBriefingItem[] = [];
  private queueIdx = 0;
  private gapTimerId: number | null = null;
  // True if the most recent voice.play() promise rejected (typically the
  // autoplay block on a cold load). arm() reads this to know the queue is
  // stalled and needs to retry the current item; otherwise arm() is a no-op
  // so mid-playback gestures don't interfere with the running queue.
  private startFailed = false;

  constructor() {
    audioBus.register("voice", this);
  }

  /**
   * Start a fresh queue. Cancels any in-flight queue first (latest call
   * wins). Items run in order, each respecting its own `gapBeforeMs` from
   * the previous item's `ended` event. Caller is the landing page; the
   * sessionStorage gate that prevents repeats per browser session is the
   * caller's responsibility.
   *
   * @stable
   */
  playSequence(items: readonly MenuBriefingItem[]): void {
    this.stop();
    if (items.length === 0) return;
    this.queue = items;
    this.queueIdx = 0;
    this.scheduleNext();
  }

  /**
   * Called on the first user gesture after mount. If the queue stalled
   * because `voice.play()` rejected (cold-load autoplay block), retry the
   * stalled item immediately; otherwise no-op so mid-playback gestures
   * don't interfere with the running queue.
   *
   * @stable
   */
  arm(): void {
    if (!this.startFailed) return;
    this.startFailed = false;
    const item = this.queue[this.queueIdx];
    if (!item) return;
    this.startVoice(item.src);
  }

  /**
   * Cancel the queue and release any in-flight voice element. Called when
   * the player commits to entering the game (PLAY/CONTINUE click) and by
   * `playSequence()` to tear down a previous queue. Idempotent.
   *
   * @stable
   */
  stop(): void {
    if (this.gapTimerId !== null) {
      clearTimeout(this.gapTimerId);
      this.gapTimerId = null;
    }
    this.queue = [];
    this.queueIdx = 0;
    this.startFailed = false;
    const voice = this.voice;
    this.voice = null;
    if (!voice) return;
    voice.pause();
    voice.src = "";
  }

  /**
   * AudioBus callback. Sets `voice.volume` to 0 on mute (without pausing)
   * so timing stays stable across mute toggles — the queue keeps marching
   * through clips silently and resumes audibly on unmute. Pausing instead
   * of zeroing volume would shift queue timing under the player's UI.
   *
   * @stable
   */
  setMuted(muted: boolean): void {
    if (!this.voice) return;
    this.voice.volume = muted ? 0 : TARGET_VOLUME;
  }

  // INTERNAL — every method below is private to the engine.

  private scheduleNext(): void {
    if (this.queueIdx >= this.queue.length) return;
    const item = this.queue[this.queueIdx];
    if (!item) return;
    const startNow = (): void => {
      this.gapTimerId = null;
      this.startVoice(item.src);
    };
    if (item.gapBeforeMs > 0) {
      this.gapTimerId = window.setTimeout(startNow, item.gapBeforeMs);
    } else {
      startNow();
    }
  }

  private startVoice(src: string): void {
    const voice = new Audio(src);
    voice.loop = false;
    voice.volume = audioBus.isMuted("voice") ? 0 : TARGET_VOLUME;
    voice.preload = "auto";
    voice.addEventListener("ended", () => {
      // Release the element promptly so it stops counting against iOS
      // Safari's ~6-element audio budget. Without src="" the element can
      // linger as a "live" slot until GC.
      voice.src = "";
      if (this.voice !== voice) return;
      this.voice = null;
      this.queueIdx += 1;
      this.scheduleNext();
    });
    this.voice = voice;
    voice
      .play()
      .then(() => {
        this.startFailed = false;
      })
      .catch(() => {
        // Autoplay blocked — release the voice so arm() can re-create and
        // retry it on the next user gesture.
        voice.src = "";
        this.startFailed = true;
        if (this.voice === voice) this.voice = null;
      });
  }
}

/**
 * Landing-page voice queue. Plays a series of nudge clips with configurable
 * gaps, ending with the system briefing. Independent of `menuMusic` (which
 * keeps playing underneath). Cancels when the player commits to the game.
 * Registered with the bus as `voice`.
 *
 * @stable
 */
export const menuBriefingAudio = new MenuBriefingAudio();
