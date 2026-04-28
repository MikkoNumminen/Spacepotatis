// Story audio controller. Plays a music bed and a delayed voiceover for a
// single narrative beat at a time. Honors the master mute toggle: while
// muted, play() is a no-op (the popup just shows the text). Toggling the
// master switch mid-playback pauses/resumes both tracks together.
//
// Lifecycle is owned by StoryModal — it calls play() on mount, stop() on
// Continue or unmount. The menu music engine ducks/unducks around this.

class StoryAudio {
  private music: HTMLAudioElement | null = null;
  private voice: HTMLAudioElement | null = null;
  private voiceTimerId: number | null = null;
  private muted = false;
  private active = false;

  play(opts: {
    musicSrc: string;
    voiceSrc: string;
    voiceDelayMs: number;
    musicVolume?: number;
    voiceVolume?: number;
  }): void {
    this.stop();
    this.active = true;
    // Seed from the master toggle so the first run respects the persisted
    // setting even before setAllMuted has been called this session.
    if (typeof window !== "undefined") {
      this.muted = window.localStorage.getItem("spacepotatis:muted") === "1";
    }

    const musicVol = opts.musicVolume ?? 0.45;
    const voiceVol = opts.voiceVolume ?? 1.0;

    const music = new Audio(opts.musicSrc);
    music.loop = true;
    music.volume = this.muted ? 0 : musicVol;
    music.preload = "auto";
    this.music = music;

    const voice = new Audio(opts.voiceSrc);
    voice.loop = false;
    voice.volume = this.muted ? 0 : voiceVol;
    voice.preload = "auto";
    this.voice = voice;

    if (!this.muted) {
      void music.play().catch(() => {
        // autoplay can fail if the user hasn't interacted yet — silently OK
      });
      this.voiceTimerId = window.setTimeout(() => {
        if (!this.active || !this.voice) return;
        if (this.muted) return;
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
    if (this.music) {
      this.music.pause();
      this.music.src = "";
      this.music = null;
    }
    if (this.voice) {
      this.voice.pause();
      this.voice.src = "";
      this.voice = null;
    }
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (!this.active) return;

    if (muted) {
      this.music?.pause();
      this.voice?.pause();
    } else {
      // Resume only what was already loaded — don't re-trigger the delay
      // timer. If muting happened during the delay window, voice will
      // simply not play this run.
      if (this.music) {
        this.music.volume = 0.45;
        void this.music.play().catch(() => {});
      }
      if (this.voice && this.voiceTimerId === null) {
        // Voice was already started before mute — resume.
        this.voice.volume = 1.0;
        void this.voice.play().catch(() => {});
      }
    }
  }
}

export const storyAudio = new StoryAudio();
