"use client";

import { audioBus } from "./AudioBus";

// One-shot voice cue for the Leaderboard page ("Hall of Mediocrity").
// Plays once per page mount with a configurable lead-in delay; cancels on
// unmount so a quick Back-out before the delay fires doesn't leak audio
// onto another page. Mute state owned by AudioBus (category: voice).
//
// Mirrors the menuBriefingAudio shape but simpler — there's only one clip,
// no queue, no autoplay-arming retry (the player must click "Leaderboard"
// to land here, so a user gesture has already happened).

const VOICE_PATH = "/audio/leaderboard/hall-of-mediocrity.mp3";
const TARGET_VOLUME = 1.0;

class LeaderboardAudio {
  private voice: HTMLAudioElement | null = null;
  private leadInTimerId: number | null = null;

  constructor() {
    audioBus.register("voice", this);
  }

  // Schedule the voice to start `delayMs` after this call. If a previous
  // schedule is still pending, it's cancelled — the latest call wins.
  play(delayMs: number): void {
    this.stop();
    if (typeof window === "undefined") return;
    this.leadInTimerId = window.setTimeout(() => {
      this.leadInTimerId = null;
      this.startVoice();
    }, Math.max(0, delayMs));
  }

  stop(): void {
    if (this.leadInTimerId !== null) {
      clearTimeout(this.leadInTimerId);
      this.leadInTimerId = null;
    }
    const voice = this.voice;
    this.voice = null;
    if (!voice) return;
    voice.pause();
    voice.src = "";
  }

  setMuted(muted: boolean): void {
    if (!this.voice) return;
    this.voice.volume = muted ? 0 : TARGET_VOLUME;
  }

  private startVoice(): void {
    const voice = new Audio(VOICE_PATH);
    voice.loop = false;
    voice.volume = audioBus.isMuted("voice") ? 0 : TARGET_VOLUME;
    voice.preload = "auto";
    voice.addEventListener("ended", () => {
      voice.src = "";
      if (this.voice === voice) this.voice = null;
    });
    this.voice = voice;
    void voice.play().catch(() => {
      // Autoplay blocked is unlikely here (the player just clicked the
      // Leaderboard link, so a gesture exists), but be defensive.
      voice.src = "";
      if (this.voice === voice) this.voice = null;
    });
  }
}

export const leaderboardAudio = new LeaderboardAudio();
