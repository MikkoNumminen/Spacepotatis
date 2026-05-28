"use client";

import type { PerkId } from "@/game/data";
import { audioBus } from "./AudioBus";

// PUBLIC API — this engine is part of the `audio` module's contract.
//   Stable. Breaking changes require a coordinated update of every caller.
//   See ./README.md for the rationale.
//
// Item-acquisition voice cues. Plays a short Grandma voice clip when the
// player receives an item or buff — fired from the Victory modal's
// first-clear reveal, every shop purchase, and the in-combat drop pickups
// (credit, weapon, shield, perk). One fresh `Audio` per fire, released
// on `ended` / `error` / play() rejection. Mute state owned by AudioBus
// (category: voice).
//
// INVARIANT: NO template-element cache. iOS Safari caps simultaneous
// HTMLAudioElement instances at ~6 per page; ANY element with src set +
// readyState > 0 counts toward the budget even if not playing. The previous
// design held 8 persistent template elements purely to enable cloneNode-
// based fast spawning, which alone exceeded the iOS budget when stacked
// with the menuMusic + combatMusic engines. Spawning fresh per fire trades
// a tiny per-call overhead (the browser HTTP-caches the file after first
// fetch) for zero persistent slots. PR #69 removed the cache; do not bring
// it back.

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

// INTERNAL — exposed only via the `itemSfx` singleton at file end.
class ItemSfxEngine {
  private lastMoneyAt = 0;

  constructor() {
    audioBus.register("voice", this);
  }

  // INTERNAL — every play() is funneled through this private helper.
  private play(src: string): void {
    if (typeof window === "undefined") return;
    if (audioBus.isMuted("voice")) return;
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

  /**
   * Voice cue for receiving a weapon — first-clear reveal, shop purchase,
   * or in-combat drop. Spawn-and-release HTMLAudioElement.
   *
   * @stable
   */
  weapon(): void {
    this.play(PATHS.weapon);
  }

  /**
   * Voice cue for receiving an augment — shop purchase (no in-combat drop
   * surface for augments today). Spawn-and-release HTMLAudioElement.
   *
   * @stable
   */
  augment(): void {
    this.play(PATHS.augment);
  }

  /**
   * Voice cue for ship upgrades (shop only). Spawn-and-release.
   *
   * @stable
   */
  upgrade(): void {
    this.play(PATHS.upgrade);
  }

  /**
   * Voice cue for credit pickups in combat. Throttled (1.8s cooldown)
   * because pickups can fire every ~0.5s during a wave clear and Grandma's
   * money line would step on itself constantly.
   *
   * @stable
   */
  money(): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - this.lastMoneyAt < MONEY_COOLDOWN_MS) return;
    this.lastMoneyAt = now;
    this.play(PATHS.money);
  }

  /**
   * Voice cue for shield pickups in combat / shop. Spawn-and-release.
   *
   * @stable
   */
  shield(): void {
    this.play(PATHS.shield);
  }

  /**
   * Voice cue for receiving a specific perk. Each perk gets its own line
   * so Grandma names the thing the player just picked up.
   *
   * @stable
   */
  perk(id: PerkId): void {
    this.play(PERK_PATHS[id]);
  }

  /**
   * AudioBus callback. Intentionally a no-op: this engine has no in-flight
   * persistent elements (every fire is spawn-and-release), and `play()`
   * already queries `audioBus.isMuted("voice")` to early-return before
   * allocating an element. There is nothing to silence on toggle.
   *
   * @stable
   */
  setMuted(_muted: boolean): void {
    // Intentionally empty. AudioBus owns the mute value; play() queries it
    // directly to early-return before allocating an HTMLAudioElement (the
    // iOS ~6-element budget defense). No engine-side reaction is needed —
    // this engine has no in-flight elements to silence on toggle (each fire
    // is spawn-and-release).
  }
}

/**
 * Per-category item-acquisition voice cues. Fired from the Victory modal's
 * first-clear reveal, every shop purchase, and the in-combat drop pickups
 * (credit, weapon, shield, perk). Spawn-and-release per fire — no
 * persistent template elements that would count against iOS Safari's
 * ~6-element HTMLAudioElement budget. Registered with the bus as `voice`.
 *
 * @stable
 */
export const itemSfx = new ItemSfxEngine();
