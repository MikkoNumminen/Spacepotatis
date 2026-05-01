"use client";

import type { PerkId } from "@/game/data/perks";

// Item-acquisition voice cues. Plays a short Grandma voice clip when the
// player receives an item or buff — fired from the Victory modal's
// first-clear reveal, every shop purchase, and the in-combat drop pickups
// (credit, weapon, shield, perk). One fresh `Audio` per fire, released
// on `ended` / `error` / play() rejection. Honors the master mute toggle.
//
// Why no template cache: iOS Safari caps simultaneous HTMLAudioElement
// instances at ~6 per page; ANY element with src set + readyState > 0
// counts toward the budget even if not playing. The previous design held
// 8 persistent template elements purely to enable cloneNode-based fast
// spawning, which alone exceeded the iOS budget when stacked with the
// menuMusic + combatMusic engines. Spawning fresh per fire trades a
// tiny per-call overhead (the browser HTTP-caches the file after first
// fetch) for zero persistent slots.

const PATHS = {
  weapon: "/audio/sfx/ui_shop_gun.mp3",
  augment: "/audio/sfx/ui_shop_gun_mod.mp3",
  upgrade: "/audio/sfx/ui_shop_ship_upgrade.mp3",
  money: "/audio/sfx/ui_shop_money.mp3",
  shield: "/audio/sfx/ui_shield_pickup.mp3"
} as const;

// Per-perk voice paths — each perk gets its own line so Grandma names the
// thing the player just picked up.
const PERK_PATHS: Readonly<Record<PerkId, string>> = {
  overdrive: "/audio/sfx/ui_perk_overdrive.mp3",
  hardened: "/audio/sfx/ui_perk_hardened.mp3",
  emp: "/audio/sfx/ui_perk_emp.mp3"
};

// Throttle window for money(). Credit pickups in combat can fire every
// ~0.5s during a wave clear; without a gate Grandma's money line would
// step on itself constantly. 1.8s lets the cue land cleanly between
// pickups without dropping every fire.
const MONEY_COOLDOWN_MS = 1800;

class ItemSfxEngine {
  private muted = false;
  private lastMoneyAt = 0;

  private play(src: string): void {
    if (typeof window === "undefined") return;
    if (this.muted) return;
    const el = new Audio(src);
    el.volume = 1.0;
    // preload="none" skips the metadata pre-fetch; the actual file fetches
    // on play(). Once the browser HTTP-caches the response, subsequent
    // fires for the same src play immediately. This costs a tiny first-
    // fire delay in exchange for not paying eager-fetch bandwidth on
    // session start.
    el.preload = "none";
    // Release the slot the moment playback finishes (or fails) so the
    // element becomes GC-eligible and stops counting toward iOS Safari's
    // ~6 simultaneous-element budget.
    const release = (): void => {
      el.removeEventListener("ended", release);
      el.removeEventListener("error", release);
      el.src = "";
    };
    el.addEventListener("ended", release);
    el.addEventListener("error", release);
    void el.play().catch(release);
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

  shield(): void {
    this.play(PATHS.shield);
  }

  perk(id: PerkId): void {
    this.play(PERK_PATHS[id]);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }
}

export const itemSfx = new ItemSfxEngine();
