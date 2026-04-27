"use client";

// Menu music controller. Owns a single HTMLAudioElement and runs a manual
// loop with a fade-out → silence → fade-in seam so the track feels like a
// long ambient bed rather than a hard cut every N minutes. The element is
// shared across menu routes (root layout mount) and is "ducked" while the
// player is in a combat scene.
//
// Autoplay note: browsers block .play() until a user gesture. The provider
// component arms the controller on first pointerdown / keydown.

const SRC = "/audio/music/menu-theme.ogg";
const TARGET_VOLUME = 0.45;
const FADE_OUT_SEC = 2.5;
const FADE_IN_SEC = 2.5;
const SILENCE_MS = 800;

type Listener = (state: { muted: boolean; armed: boolean }) => void;

class MusicEngine {
  private el: HTMLAudioElement | null = null;
  private muted = false;
  private armed = false;
  private ducked = false;
  private fadeRaf: number | null = null;
  private silenceTimer: number | null = null;
  private readonly listeners = new Set<Listener>();

  init(): void {
    if (typeof window === "undefined") return;
    if (this.el) return;
    const el = new Audio(SRC);
    el.preload = "auto";
    el.loop = false;
    el.volume = 0;
    el.addEventListener("timeupdate", this.onTimeUpdate);
    el.addEventListener("ended", this.onEnded);
    this.el = el;
  }

  // First user gesture unlocks autoplay. Idempotent.
  arm(): void {
    if (!this.el || this.armed) return;
    this.armed = true;
    if (!this.muted && !this.ducked) void this.startPlayback();
    this.notify();
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (muted) {
      this.fadeAndPause();
    } else if (this.armed && !this.ducked) {
      void this.startPlayback();
    }
    this.notify();
  }

  isMuted(): boolean {
    return this.muted;
  }

  // Combat scene calls duck() on enter and unduck() on exit so the menu bed
  // doesn't fight the in-game SFX.
  duck(): void {
    if (this.ducked) return;
    this.ducked = true;
    this.fadeAndPause();
  }

  unduck(): void {
    if (!this.ducked) return;
    this.ducked = false;
    if (this.armed && !this.muted) void this.startPlayback();
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb({ muted: this.muted, armed: this.armed });
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    const snap = { muted: this.muted, armed: this.armed };
    for (const cb of this.listeners) cb(snap);
  }

  private async startPlayback(): Promise<void> {
    const el = this.el;
    if (!el) return;
    this.cancelFade();
    this.cancelSilence();
    if (el.paused) {
      try {
        await el.play();
      } catch {
        // Autoplay or load failure — stay armed; next gesture/unduck retries.
        return;
      }
    }
    this.fadeTo(TARGET_VOLUME, FADE_IN_SEC);
  }

  private fadeAndPause(): void {
    const el = this.el;
    if (!el) return;
    this.cancelSilence();
    this.fadeTo(0, FADE_OUT_SEC, () => {
      if (this.muted || this.ducked) el.pause();
    });
  }

  private onTimeUpdate = (): void => {
    const el = this.el;
    if (!el || el.paused || this.muted || this.ducked) return;
    const remaining = el.duration - el.currentTime;
    if (Number.isFinite(el.duration) && remaining > 0 && remaining < FADE_OUT_SEC) {
      // Idempotent: fadeTo no-ops if we're already ramping toward the same target.
      this.fadeTo(0, remaining);
    }
  };

  private onEnded = (): void => {
    const el = this.el;
    if (!el) return;
    this.cancelFade();
    el.pause();
    el.currentTime = 0;
    el.volume = 0;
    this.cancelSilence();
    this.silenceTimer = window.setTimeout(() => {
      this.silenceTimer = null;
      if (this.muted || this.ducked) return;
      void this.startPlayback();
    }, SILENCE_MS);
  };

  private fadeTo(target: number, seconds: number, done?: () => void): void {
    const el = this.el;
    if (!el) return;
    this.cancelFade();
    const start = performance.now();
    const from = el.volume;
    const dur = Math.max(50, seconds * 1000);
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / dur);
      el.volume = from + (target - from) * t;
      if (t < 1) {
        this.fadeRaf = requestAnimationFrame(tick);
      } else {
        this.fadeRaf = null;
        done?.();
      }
    };
    this.fadeRaf = requestAnimationFrame(tick);
  }

  private cancelFade(): void {
    if (this.fadeRaf !== null) {
      cancelAnimationFrame(this.fadeRaf);
      this.fadeRaf = null;
    }
  }

  private cancelSilence(): void {
    if (this.silenceTimer !== null) {
      window.clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}

export const music = new MusicEngine();
