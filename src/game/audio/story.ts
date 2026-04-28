// Story audio controller. Plays a music bed and a delayed voiceover for a
// single narrative beat at a time. Honors the master mute toggle: while
// muted, play() is a no-op (the popup just shows the text). Toggling the
// master switch mid-playback pauses/resumes both tracks together.
//
// All transitions are faded — the menu bed's duck/unduck already fades, so
// fading the story side too produces a smooth crossfade in both directions
// instead of a hard cut. Continue → menu bed should never feel like a snap.
//
// Lifecycle is owned by StoryModal — it calls play() on mount, stop() on
// Continue or unmount.

const MUSIC_TARGET_VOL = 0.45;
const VOICE_TARGET_VOL = 1.0;
const MUSIC_FADE_IN_MS = 1000;
const MUSIC_FADE_OUT_MS = 1500;
const VOICE_FADE_OUT_MS = 300;

class StoryAudio {
  private music: HTMLAudioElement | null = null;
  private voice: HTMLAudioElement | null = null;
  private voiceTimerId: number | null = null;
  private musicFadeRaf: number | null = null;
  private voiceFadeRaf: number | null = null;
  private muted = false;
  private active = false;

  play(opts: {
    musicSrc: string | null;
    voiceSrc: string;
    voiceDelayMs: number;
  }): void {
    this.stop();
    this.active = true;
    if (typeof window !== "undefined") {
      this.muted = window.localStorage.getItem("spacepotatis:muted") === "1";
    }

    if (opts.musicSrc !== null) {
      const music = new Audio(opts.musicSrc);
      music.loop = true;
      music.volume = 0;
      music.preload = "auto";
      this.music = music;
    }

    const voice = new Audio(opts.voiceSrc);
    voice.loop = false;
    voice.volume = this.muted ? 0 : VOICE_TARGET_VOL;
    voice.preload = "auto";
    this.voice = voice;

    if (!this.muted) {
      if (this.music) {
        void this.music.play().catch(() => {
          // Autoplay can fail if the user hasn't interacted yet — silently OK.
        });
        this.fadeMusic(MUSIC_TARGET_VOL, MUSIC_FADE_IN_MS);
      }
      this.voiceTimerId = window.setTimeout(() => {
        this.voiceTimerId = null;
        if (!this.active || !this.voice || this.muted) return;
        void this.voice.play().catch(() => {});
      }, Math.max(0, opts.voiceDelayMs));
    }
  }

  stop(): void {
    this.active = false;
    if (this.voiceTimerId !== null) {
      clearTimeout(this.voiceTimerId);
      this.voiceTimerId = null;
    }
    // Capture current refs so the post-fade callback releases the right
    // elements even if a new play() snapshots fresh ones in the meantime.
    const music = this.music;
    const voice = this.voice;
    this.music = null;
    this.voice = null;
    if (music) {
      this.cancelMusicFade();
      tweenVolume(music, music.volume, 0, MUSIC_FADE_OUT_MS, () => {
        music.pause();
        music.src = "";
      });
    }
    if (voice) {
      this.cancelVoiceFade();
      tweenVolume(voice, voice.volume, 0, VOICE_FADE_OUT_MS, () => {
        voice.pause();
        voice.src = "";
      });
    }
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (!this.active) return;

    if (muted) {
      // Quick fade to silence so a mid-toggle doesn't click. Don't pause —
      // unmute should resume from the same playhead position.
      if (this.music) this.fadeMusic(0, VOICE_FADE_OUT_MS);
      if (this.voice) this.fadeVoice(0, VOICE_FADE_OUT_MS);
      // Pause after the fade so paused-state is reached only after silence.
      window.setTimeout(() => {
        if (!this.muted) return;
        this.music?.pause();
        this.voice?.pause();
      }, VOICE_FADE_OUT_MS);
    } else {
      if (this.music) {
        void this.music.play().catch(() => {});
        this.fadeMusic(MUSIC_TARGET_VOL, MUSIC_FADE_IN_MS);
      }
      if (this.voice && this.voiceTimerId === null) {
        void this.voice.play().catch(() => {});
        this.fadeVoice(VOICE_TARGET_VOL, VOICE_FADE_OUT_MS);
      }
    }
  }

  private fadeMusic(toVol: number, durationMs: number): void {
    if (!this.music) return;
    this.cancelMusicFade();
    this.musicFadeRaf = tweenVolume(this.music, this.music.volume, toVol, durationMs);
  }

  private fadeVoice(toVol: number, durationMs: number): void {
    if (!this.voice) return;
    this.cancelVoiceFade();
    this.voiceFadeRaf = tweenVolume(this.voice, this.voice.volume, toVol, durationMs);
  }

  private cancelMusicFade(): void {
    if (this.musicFadeRaf !== null) {
      cancelAnimationFrame(this.musicFadeRaf);
      this.musicFadeRaf = null;
    }
  }

  private cancelVoiceFade(): void {
    if (this.voiceFadeRaf !== null) {
      cancelAnimationFrame(this.voiceFadeRaf);
      this.voiceFadeRaf = null;
    }
  }
}

// Tween an audio element's volume over `durationMs` using rAF. Returns the
// rAF handle so callers can cancel a stale fade. Calls `onDone` once volume
// reaches the target (used by stop() to pause AFTER the fade resolves).
function tweenVolume(
  el: HTMLAudioElement,
  fromVol: number,
  toVol: number,
  durationMs: number,
  onDone?: () => void
): number {
  const start = performance.now();
  const fromClamped = clamp01(fromVol);
  const toClamped = clamp01(toVol);
  const tick = (now: number): void => {
    const t = Math.min(1, (now - start) / Math.max(1, durationMs));
    el.volume = clamp01(fromClamped + (toClamped - fromClamped) * t);
    if (t < 1) {
      requestAnimationFrame(tick);
    } else if (onDone) {
      onDone();
    }
  };
  return requestAnimationFrame(tick);
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export const storyAudio = new StoryAudio();
