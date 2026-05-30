"use client";

import { MusicEngine } from "./MusicEngine";

// PUBLIC API — the music engine singletons + combat-track helpers are part
// of the `audio` module's contract (re-exported via ./index.ts). Stable;
// breaking changes need a coordinated caller update. The MusicEngine class
// itself lives in ./MusicEngine.ts (internal machinery).
//
// Exported singletons:
//  - menuMusic: fixed src (ambient menu bed). Survives client-side nav
//    between root-layout pages; ducks when combat starts.
//  - combatMusic: src set per-mission via loadTrack(); stop() fades + unloads.
//  - shopMusic: src set on shop dock; native loop.
/**
 * The ambient menu bed. Native loop (gapless), `keepAlive` set so it never
 * gets paused by ducking or master mute — only volume changes. Survives
 * client-side nav between `/`, `/play`, `/shop`, and `/leaderboard` so the
 * player never lands on a silence window. Registered with the bus as
 * `music`.
 *
 * @stable
 */
export const menuMusic = new MusicEngine({
  src: "/audio/music/menu-theme.ogg",
  loop: true,
  keepAlive: true
});

/**
 * Per-mission combat bed. `src` is set via `loadTrack(src)` when combat
 * starts and cleared with `loadTrack(null)` (or `stop()`) on mission end.
 * Manual fade-out → silence → fade-in seam between loops, so a long stay on
 * one track has a "breath" instead of a hard cut. Slightly louder than the
 * menu bed since combat SFX are sparser than the menu's ambient layering;
 * fade-in is cut short so the bed starts WITH the mission, not over the
 * first ~2 seconds. Registered with the bus as `music`.
 *
 * @stable
 */
export const combatMusic = new MusicEngine({
  targetVolume: 0.55,
  fadeInSec: 0.15
});

/**
 * Fallback combat bed for missions whose `musicTrack` is `null`. Most
 * missions in missions.json don't yet ship a dedicated track; without a
 * fallback those drop into silent combat, which reads as broken audio.
 * A mission that DOES declare a `musicTrack` overrides this — ship a
 * per-mission asset and set the field to use it.
 *
 * @stable
 */
export const DEFAULT_COMBAT_MUSIC = "/audio/music/combat-tutorial.ogg";

/**
 * Resolve which combat bed plays for a mission's `musicTrack` field.
 * The pre-warm in `GameCanvas.handleLaunch` and the authoritative load in
 * `CombatScene.create` MUST agree on the src — otherwise `loadTrack`'s
 * `src === src` no-op guard misses and the two calls cross-fade between
 * the same file pointlessly. Both go through this single resolver so the
 * "resolve identically" contract is enforced in one place, not duplicated
 * inline at each call site.
 *
 * @stable
 */
export function resolveCombatTrack(musicTrack: string | null): string {
  return musicTrack ?? DEFAULT_COMBAT_MUSIC;
}

/**
 * Per-shop bed. `src` is set via `loadTrack(src)` on shop dock; native loop
 * (gapless) like `menuMusic` so a long browse never hits a silence window.
 * Different shops can carry different music in the future; today every
 * shop uses `/audio/music/shop.ogg`. Registered with the bus as `music`.
 *
 * @stable
 */
export const shopMusic = new MusicEngine({
  loop: true,
  targetVolume: 0.4
});

