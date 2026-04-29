"use client";

// Item-acquisition voice cues. Plays one of four short voice clips when the
// player receives a permanent item — fired from the Victory modal's
// first-clear reveal, every shop purchase, and the in-combat drop pickups.
// Templates are cached and cloned per fire so back-to-back plays overlap
// cleanly. Honors the master mute toggle.

const PATHS = {
  weapon: "/audio/sfx/ui_shop_gun.mp3",
  augment: "/audio/sfx/ui_shop_gun_mod.mp3",
  upgrade: "/audio/sfx/ui_shop_ship_upgrade.mp3",
  money: "/audio/sfx/ui_shop_money.mp3"
} as const;

// Throttle window for money(). Credit pickups in combat can fire every
// ~0.5s during a wave clear; without a gate Grandma's money line would
// step on itself constantly. 1.8s lets the cue land cleanly between
// pickups without dropping every fire.
const MONEY_COOLDOWN_MS = 1800;

class ItemSfxEngine {
  private muted = false;
  private templates = new Map<string, HTMLAudioElement>();
  private lastMoneyAt = 0;

  private play(src: string): void {
    if (typeof window === "undefined") return;
    if (this.muted) return;
    let tmpl = this.templates.get(src);
    if (!tmpl) {
      tmpl = new Audio(src);
      tmpl.preload = "auto";
      this.templates.set(src, tmpl);
    }
    const clone = tmpl.cloneNode(true) as HTMLAudioElement;
    clone.volume = 1.0;
    // iOS Safari caps simultaneous HTMLAudioElement instances at ~6 per page.
    // Drop the clone's src as soon as it finishes (or errors) so the element
    // becomes GC-eligible immediately instead of lingering as a "live" slot.
    const release = (): void => {
      clone.removeEventListener("ended", release);
      clone.removeEventListener("error", release);
      clone.src = "";
    };
    clone.addEventListener("ended", release);
    clone.addEventListener("error", release);
    void clone.play().catch(release);
  }

  weapon(): void {
    this.play(PATHS.weapon);
  }

  augment(): void {
    this.play(PATHS.augment);
  }

  upgrade(): void {
    this.play(PATHS.upgrade);
  }

  money(): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - this.lastMoneyAt < MONEY_COOLDOWN_MS) return;
    this.lastMoneyAt = now;
    this.play(PATHS.money);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }
}

export const itemSfx = new ItemSfxEngine();
