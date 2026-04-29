"use client";

// Music controller. One HTMLAudioElement per engine, manual loop with a
// fade-out → silence → fade-in seam so a long stay on one track sounds like
// the music takes a breath rather than restarting on a hard cut.
//
// Two singletons are exported:
//  - menuMusic: fixed src (the ambient menu bed). Survives client-side nav
//    between root layout pages. Ducks when combat starts.
//  - combatMusic: src is set per-mission via loadTrack(); calling stop()
//    fades it out and unloads.
//
// Autoplay note: browsers block .play() until a user gesture. Menu engine is
// armed once on first input by MenuMusic.tsx; combat engine inherits the
// gesture (combat is always reached via a click).
//
// iOS Safari budget: the platform caps simultaneous HTMLAudioElement
// instances at roughly 6 per page; above that, play() silently fails or the
// audio session is torn down. The whole audio cluster (this file plus
// story/storyLog/menuBriefing/itemSfx) keeps the live count well under that
// by (a) lazy-creating elements only when about to play and (b) releasing
// them on `ended`/stop via `src = ""` so the slot frees immediately. The
// only persistent element is menuMusic (native loop, never released);
// every other engine drops to zero elements when not actively playing.

const TARGET_VOLUME = 0.45;
const FADE_OUT_SEC = 4;
const FADE_IN_SEC = 2.5;
const SILENCE_MS = 800;
// Watchdog cadence. Cheap (one boolean check per tick + maybe a play call) so
// tight is fine; the point is "any silent failure heals within ~2 s".
const WATCHDOG_MS = 2000;
// Delay before re-trying play() after a rejection (autoplay block, audio
// session interrupt, etc.). Short enough that the user perceives no gap.
const RETRY_DELAY_MS = 250;

interface EngineOptions {
  readonly src?: string;
  readonly targetVolume?: number;
  readonly fadeInSec?: number;
  readonly fadeOutSec?: number;
  readonly silenceMs?: number;
  // When true, the browser loops the audio natively (gapless, bulletproof).
  // The manual fade-out → silence → fade-in routine is bypassed entirely so
  // there's no window where a navigation event can land mid-silence and
  // make the bed feel like it stopped. Use for ambient menu music that
  // should play forever; leave false for combat music that needs a clean
  // stop on mission end.
  readonly loop?: boolean;
}

type Listener = (state: { muted: boolean; armed: boolean }) => void;

class MusicEngine {
  private el: HTMLAudioElement | null = null;
  private src: string | null;
  private muted = false;
  private armed = false;
  private ducked = false;
  private fadeRaf: number | null = null;
  private silenceTimer: number | null = null;
  // Deterministic schedule for the loop-end fade. The browser's `timeupdate`
  // event fires only every ~250ms, which used to make the end feel like a
  // hard cut whenever the last tick landed too close to the natural end.
  private fadeOutTimer: number | null = null;
  // Self-healing scaffolding. The watchdog is a periodic "if I should be
  // playing and I'm not, kick myself"; retry handles play() rejections;
  // pause-event handles browser-induced pauses (visibility change on mobile,
  // audio session interrupts, OS audio focus loss). These together guarantee
  // that whatever knocks the music off, it comes back within a couple seconds
  // without requiring a user gesture.
  private watchdogInterval: number | null = null;
  private retryTimer: number | null = null;
  private visibilityAttached = false;
  private readonly targetVolume: number;
  private readonly fadeInSec: number;
  private readonly fadeOutSec: number;
  private readonly silenceMs: number;
  private readonly loop: boolean;
  private readonly listeners = new Set<Listener>();

  constructor(opts: EngineOptions = {}) {
    this.src = opts.src ?? null;
    this.targetVolume = opts.targetVolume ?? TARGET_VOLUME;
    this.fadeInSec = opts.fadeInSec ?? FADE_IN_SEC;
    this.fadeOutSec = opts.fadeOutSec ?? FADE_OUT_SEC;
    this.silenceMs = opts.silenceMs ?? SILENCE_MS;
    this.loop = opts.loop ?? false;
  }

  init(): void {
    if (typeof window === "undefined") return;
    if (this.el || !this.src) return;
    this.attachElement(this.src);
    this.startWatchdog();
    this.attachVisibilityListener();
  }

  // For the combat engine: hot-swap the track. Fades out the old, swaps src,
  // and (if armed and not muted/ducked) fades the new one in.
  loadTrack(src: string | null): void {
    if (typeof window === "undefined") return;
    if (this.src === src) return;
    this.src = src;
    if (!src) {
      this.cancelFade();
      this.cancelSilence();
      this.cancelFadeOutTimer();
      if (this.el) {
        this.el.pause();
        this.el.removeAttribute("src");
        this.el.load();
      }
      return;
    }
    if (!this.el) {
      this.attachElement(src);
      this.startWatchdog();
      this.attachVisibilityListener();
    } else {
      this.cancelFade();
      this.cancelSilence();
      this.cancelFadeOutTimer();
      this.el.pause();
      this.el.src = src;
      this.el.volume = 0;
      this.el.load();
    }
    this.armed = true;
    if (!this.muted && !this.ducked) void this.startPlayback();
    this.notify();
  }

  // First user gesture unlocks autoplay. Idempotent.
  arm(): void {
    if (!this.el || this.armed) return;
    this.armed = true;
    if (!this.muted && !this.ducked) void this.startPlayback();
    this.notify();
  }

  // Forceful resume — if shouldBePlaying() is true but the element is
  // actually paused (typical aftermath of a play() rejection that the
  // promise's catch handler couldn't recover from), kick startPlayback
  // immediately. Cheaper than waiting for the watchdog (~2s) and safe
  // to call repeatedly. Caller is GameCanvas.handleMissionComplete which
  // observes a race where the mode-effect's unduck doesn't actually
  // resume audio on return to the galaxy.
  ensurePlaying(): void {
    this.kickIfShouldBePlaying();
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (muted) {
      this.fadeAndPause();
    } else if (this.armed && !this.ducked && this.src) {
      void this.startPlayback();
    }
    this.notify();
  }

  isMuted(): boolean {
    return this.muted;
  }

  duck(): void {
    if (this.ducked) return;
    this.ducked = true;
    this.fadeAndPause();
  }

  unduck(): void {
    if (!this.ducked) return;
    this.ducked = false;
    if (this.armed && !this.muted && this.src) void this.startPlayback();
  }

  // Fade out and pause. Combat scene calls this on shutdown so the next
  // mission boot starts from a clean slate. Clearing src first is what makes
  // it actually stay stopped — otherwise the natural-end loop logic would
  // happily restart the track during or right after the fade.
  //
  // Also releases the underlying HTMLAudioElement so it stops counting
  // against the iOS Safari ~6-element budget while the player is back on
  // the galaxy view. Native-loop engines (menuMusic) skip the release —
  // they're meant to live forever and re-arming them would cost a reload.
  stop(): void {
    this.cancelSilence();
    this.cancelFadeOutTimer();
    this.src = null;
    const el = this.el;
    if (!el) return;
    if (this.loop) {
      this.fadeTo(0, this.fadeOutSec, () => el.pause());
      return;
    }
    this.fadeTo(0, this.fadeOutSec, () => {
      el.pause();
      el.removeEventListener("ended", this.onEnded);
      el.removeEventListener("pause", this.onPause);
      el.src = "";
      el.load();
      if (this.el === el) this.el = null;
    });
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

  private attachElement(src: string): void {
    const el = new Audio(src);
    el.preload = "auto";
    el.loop = this.loop;
    el.volume = 0;
    // Manual fade-out → silence → restart only when native loop is off.
    // With native loop the browser handles seamless restart; we never want
    // to react to "ended" because it never fires.
    if (!this.loop) {
      el.addEventListener("ended", this.onEnded);
    }
    // Catch unintended pauses (browser-induced visibility/audio interrupt,
    // any external code calling .pause()). Intentional pauses always set one
    // of muted/ducked/!src/silenceTimer first, so the handler sees those and
    // bails — only the surprise pauses leak through to scheduleRetry().
    el.addEventListener("pause", this.onPause);
    this.el = el;
  }

  private onPause = (): void => {
    if (this.shouldBePlaying() && this.silenceTimer === null) {
      this.scheduleRetry();
    }
  };

  private shouldBePlaying(): boolean {
    return this.armed && !this.muted && !this.ducked && this.src !== null;
  }

  // The audio element should be actively playing right now AND it isn't.
  // Used by the watchdog and by visibility/retry handlers to decide whether
  // to kick startPlayback.
  private kickIfShouldBePlaying(): void {
    if (!this.shouldBePlaying()) return;
    if (this.silenceTimer !== null) return;  // intentional silence between loops
    const el = this.el;
    if (!el || !el.paused) return;
    void this.startPlayback();
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.kickIfShouldBePlaying();
    }, RETRY_DELAY_MS);
  }

  private startWatchdog(): void {
    if (this.watchdogInterval !== null) return;
    if (typeof window === "undefined") return;
    this.watchdogInterval = window.setInterval(
      () => this.kickIfShouldBePlaying(),
      WATCHDOG_MS
    );
  }

  private attachVisibilityListener(): void {
    if (this.visibilityAttached) return;
    if (typeof document === "undefined") return;
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.visibilityAttached = true;
  }

  private onVisibilityChange = (): void => {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "visible") this.kickIfShouldBePlaying();
  };

  private async startPlayback(): Promise<void> {
    const el = this.el;
    if (!el) return;
    this.cancelFade();
    this.cancelSilence();
    this.cancelFadeOutTimer();
    if (el.paused) {
      try {
        await el.play();
      } catch (err) {
        // Autoplay block, audio session interrupt, or load failure. Stay
        // armed and schedule a retry — the watchdog and the next user
        // gesture will both back this up, but the explicit retry handles
        // transient failures within a frame or two.
        if (typeof console !== "undefined") {
          console.warn("[MusicEngine] play() rejected, scheduling retry", err);
        }
        this.scheduleRetry();
        return;
      }
    }
    this.fadeTo(this.targetVolume, this.fadeInSec);
    // Native-loop tracks never need an end fade — the browser restarts
    // seamlessly. Manual-loop tracks (combat) still get the scheduled
    // fade so the loop has a "breath" instead of a hard cut.
    if (!this.loop) {
      this.scheduleEndFade();
    }
  }

  private fadeAndPause(): void {
    const el = this.el;
    if (!el) return;
    this.cancelSilence();
    this.cancelFadeOutTimer();
    this.fadeTo(0, this.fadeOutSec, () => {
      if (this.muted || this.ducked || !this.src) el.pause();
    });
  }

  // Set a precise timer for "when to start fading toward the end". Falls back
  // to a one-shot loadedmetadata listener if the duration isn't known yet
  // (common for OGG that hasn't fully buffered when play() resolves).
  private scheduleEndFade(): void {
    const el = this.el;
    if (!el) return;
    this.cancelFadeOutTimer();
    if (!Number.isFinite(el.duration) || el.duration <= 0) {
      const onMeta = (): void => {
        el.removeEventListener("loadedmetadata", onMeta);
        if (el === this.el && !el.paused) this.scheduleEndFade();
      };
      el.addEventListener("loadedmetadata", onMeta);
      return;
    }
    const msUntilFade = Math.max(0, (el.duration - el.currentTime - this.fadeOutSec) * 1000);
    this.fadeOutTimer = window.setTimeout(() => {
      this.fadeOutTimer = null;
      const cur = this.el;
      if (!cur || cur.paused || this.muted || this.ducked || !this.src) return;
      this.fadeTo(0, this.fadeOutSec);
    }, msUntilFade);
  }

  private onEnded = (): void => {
    const el = this.el;
    if (!el) return;
    this.cancelFade();
    this.cancelFadeOutTimer();
    el.pause();
    el.currentTime = 0;
    el.volume = 0;
    this.cancelSilence();
    this.silenceTimer = window.setTimeout(() => {
      this.silenceTimer = null;
      if (this.muted || this.ducked || !this.src) return;
      void this.startPlayback();
    }, this.silenceMs);
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

  private cancelFadeOutTimer(): void {
    if (this.fadeOutTimer !== null) {
      window.clearTimeout(this.fadeOutTimer);
      this.fadeOutTimer = null;
    }
  }
}

// Menu bed loops natively (gapless) so navigating between /, /play, /shop,
// and /leaderboard never lands on a silence window. The engine's manual
// fade-out → silence → fade-in routine is bypassed for this engine.
export const menuMusic = new MusicEngine({
  src: "/audio/music/menu-theme.ogg",
  loop: true
});

// Combat src is set via loadTrack() per mission. Slightly louder bed since
// combat SFX are sparser than the menu's ambient layering. Fade-in is cut
// to a snap so the mission bed feels like it starts WITH the mission, not
// like it ramps up over the first ~2 seconds the player is fighting.
export const combatMusic = new MusicEngine({
  targetVolume: 0.55,
  fadeInSec: 0.15
});

export function setAllMuted(muted: boolean): void {
  menuMusic.setMuted(muted);
  combatMusic.setMuted(muted);
  // Lazily import to avoid a circular module-init issue.
  void import("./story").then(({ storyAudio }) => storyAudio.setMuted(muted));
  void import("./storyLogAudio").then(({ storyLogAudio }) => storyLogAudio.setMuted(muted));
  void import("./menuBriefingAudio").then(({ menuBriefingAudio }) =>
    menuBriefingAudio.setMuted(muted)
  );
  void import("./itemSfx").then(({ itemSfx }) => itemSfx.setMuted(muted));
}

// Back-compat alias so existing imports of `music` keep working as the menu
// engine. Remove after callers migrate to the named exports.
export const music = menuMusic;
