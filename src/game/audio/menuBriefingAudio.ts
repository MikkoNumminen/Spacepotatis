// One-shot voice briefing on the landing page. Plays once per browser
// session (sessionStorage gate set by the caller) and is cancelled the
// moment the player commits to entering the game (PLAY/CONTINUE click).
//
// Independent of menuMusic — that bed keeps running underneath. Honors
// the master mute toggle.

const BRIEFING_PATH = "/audio/menu/system-briefing.mp3";
const TARGET_VOLUME = 1.0;

class MenuBriefingAudio {
  private voice: HTMLAudioElement | null = null;
  private muted = false;

  play(): void {
    if (this.voice) return;
    if (typeof window !== "undefined") {
      this.muted = window.localStorage.getItem("spacepotatis:muted") === "1";
    }
    const voice = new Audio(BRIEFING_PATH);
    voice.loop = false;
    voice.volume = this.muted ? 0 : TARGET_VOLUME;
    voice.preload = "auto";
    voice.addEventListener("ended", () => {
      if (this.voice === voice) {
        this.voice = null;
      }
    });
    this.voice = voice;
    if (!this.muted) {
      void voice.play().catch(() => {
        // Autoplay can fail if the user hasn't interacted yet — silently OK.
      });
    }
  }

  stop(): void {
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
    if (muted) {
      this.voice.pause();
    } else {
      this.voice.volume = TARGET_VOLUME;
      void this.voice.play().catch(() => {});
    }
  }
}

export const menuBriefingAudio = new MenuBriefingAudio();
