// Voice queue for the landing page. Plays a series of nudge clips with a
// configurable gap between each, ending with the system-briefing lecture.
// The full sequence runs once per browser session (sessionStorage gate set
// by the caller) and is cancelled the moment the player commits to entering
// the game (PLAY/CONTINUE click).
//
// Independent of menuMusic — that bed keeps running underneath. Honors the
// master mute toggle by setting voice.volume to 0; the queue keeps
// advancing so timing stays stable across mute toggles.

const TARGET_VOLUME = 1.0;

export interface MenuBriefingItem {
  readonly src: string;
  // Pause inserted BEFORE this item starts. The first item typically uses 0.
  // Subsequent items count their gap from the previous item's `ended` event.
  readonly gapBeforeMs: number;
}

class MenuBriefingAudio {
  private voice: HTMLAudioElement | null = null;
  private muted = false;
  private queue: readonly MenuBriefingItem[] = [];
  private queueIdx = 0;
  private gapTimerId: number | null = null;

  playSequence(items: readonly MenuBriefingItem[]): void {
    this.stop();
    if (items.length === 0) return;
    if (typeof window !== "undefined") {
      this.muted = window.localStorage.getItem("spacepotatis:muted") === "1";
    }
    this.queue = items;
    this.queueIdx = 0;
    this.scheduleNext();
  }

  stop(): void {
    if (this.gapTimerId !== null) {
      clearTimeout(this.gapTimerId);
      this.gapTimerId = null;
    }
    this.queue = [];
    this.queueIdx = 0;
    const voice = this.voice;
    this.voice = null;
    if (!voice) return;
    voice.pause();
    voice.src = "";
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (!this.voice) return;
    this.voice.volume = muted ? 0 : TARGET_VOLUME;
  }

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
    voice.volume = this.muted ? 0 : TARGET_VOLUME;
    voice.preload = "auto";
    voice.addEventListener("ended", () => {
      if (this.voice !== voice) return;
      this.voice = null;
      this.queueIdx += 1;
      this.scheduleNext();
    });
    this.voice = voice;
    void voice.play().catch(() => {
      // Autoplay blocked — silent fallback. Queue stalls until next user
      // interaction; PLAY/CONTINUE click still clears it cleanly.
    });
  }
}

export const menuBriefingAudio = new MenuBriefingAudio();
