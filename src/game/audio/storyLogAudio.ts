"use client";

import { audioBus } from "./AudioBus";

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

class StoryLogAudio {
  private music: HTMLAudioElement | null = null;
  private muted = false;
  private fadeRaf: number | null = null;

  constructor() {
    audioBus.register("music", this);
  }

  play(): void {
    if (this.music) return;
    const music = new Audio(STORY_LOG_MUSIC_PATH);
    music.loop = true;
    music.volume = 0;
    music.preload = "auto";
    this.music = music;
    if (!this.muted) {
      void music.play().catch(() => {
        // Autoplay blocked — silent fallback. The user has clicked the
        // Story menu item to get here, so a gesture has happened, but
        // be defensive against odd browser states anyway.
      });
      this.fade(TARGET_VOLUME);
    }
  }

  stop(): void {
    const music = this.music;
    this.music = null;
    if (this.fadeRaf !== null) {
      cancelAnimationFrame(this.fadeRaf);
      this.fadeRaf = null;
    }
    if (!music) return;
    tween(music, music.volume, 0, FADE_MS, () => {
      music.pause();
      music.src = "";
    });
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (!this.music) return;
    if (muted) {
      this.music.pause();
    } else {
      this.music.volume = TARGET_VOLUME;
      void this.music.play().catch(() => {});
    }
  }

  private fade(toVol: number): void {
    if (!this.music) return;
    if (this.fadeRaf !== null) cancelAnimationFrame(this.fadeRaf);
    this.fadeRaf = tween(this.music, this.music.volume, toVol, FADE_MS);
  }
}

function tween(
  el: HTMLAudioElement,
  fromVol: number,
  toVol: number,
  durationMs: number,
  onDone?: () => void
): number {
  const start = performance.now();
  const tick = (now: number): void => {
    const t = Math.min(1, (now - start) / Math.max(1, durationMs));
    el.volume = Math.max(0, Math.min(1, fromVol + (toVol - fromVol) * t));
    if (t < 1) requestAnimationFrame(tick);
    else if (onDone) onDone();
  };
  return requestAnimationFrame(tick);
}

export const storyLogAudio = new StoryLogAudio();
