"use client";

import { audioBus } from "./AudioBus";

// PUBLIC API — this engine is part of the `audio` module's contract.
//   Stable. Breaking changes require a coordinated update of every caller.
//   See ./README.md for the rationale.
//
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

// INTERNAL — exposed only via the `leaderboardAudio` singleton at file end.
class LeaderboardAudio {
  private voice: HTMLAudioElement | null = null;
  private leadInTimerId: number | null = null;

  constructor() {
    audioBus.register("voice", this);
  }

  /**
   * Schedule the voice to start `delayMs` after this call. If a previous
   * schedule is still pending, it's cancelled — the latest call wins.
   * SSR-safe (no-op on server).
   *
   * @stable
   */
  play(delayMs: number): void {
    this.stop();
    if (typeof window === "undefined") return;
    this.leadInTimerId = window.setTimeout(() => {
      this.leadInTimerId = null;
      this.startVoice();
    }, Math.max(0, delayMs));
  }

  /**
   * Cancel the pending lead-in (if any) and release the in-flight voice
   * element. Called on Leaderboard page unmount so a quick Back-out before
   * the delay fires doesn't leak audio onto another page. Idempotent.
   *
   * @stable
   */
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

  /**
   * AudioBus callback. Sets `voice.volume` to 0 on mute (without pausing)
   * so the playhead keeps advancing — unmute resumes audibly without a
   * jump or restart.
   *
   * @stable
   */
  setMuted(muted: boolean): void {
    if (!this.voice) return;
    this.voice.volume = muted ? 0 : TARGET_VOLUME;
  }

  // INTERNAL — every method below is private to the engine.

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

/**
 * Leaderboard intro voice ("Hall of Mediocrity"). Plays once per page mount
 * with a configurable lead-in delay; cancels on unmount. Mirrors the
 * `menuBriefingAudio` shape but simpler — there's only one clip, no queue,
 * and no autoplay-arming retry (the player must click "Leaderboard" to land
 * here, so a user gesture has already happened). Registered with the bus
 * as `voice`.
 *
 * @stable
 */
export const leaderboardAudio = new LeaderboardAudio();
