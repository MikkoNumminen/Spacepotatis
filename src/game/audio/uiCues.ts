"use client";

import { storyAudio } from "./story";

// One-shot Grandma voice cues for shop-UI actions (upgrade, sell, equip,
// install, picker open). Each path is a separate audio file that plays
// once on the click. Reuses storyAudio's single-voice slot —
// triggering another cue preempts the previous track, which is the
// desired behaviour when the player click-spams (no overlapping voices).
//
// Distinct from:
// - itemSfx.ts (per-category drop/shop browse cues, plays on item ACQUISITION)
// - the per-id voice files in /audio/{augments,upgrades,stats,weapons}/ that
//   play on a DetailsModal mount.
//
// Voice path convention: /audio/ui/<action>-voice.mp3.
// Missing files fail silently (HTMLAudioElement doesn't throw on 404),
// matching every other voice surface.
//
// Lifecycle note: callers fire-and-forget. There is intentionally NO
// useEffect-cleanup `storyAudio.stop()` for these cues — picker-open and
// action voices need to play through even after the picker that fired
// them unmounts (e.g. the slot-picker open voice plays while the user
// is already reading the option list, and the equip-weapon voice
// triggers on a click that immediately closes the picker).

export const UI_CUE = {
  upgradeMark: "/audio/ui/upgrade-mark-voice.mp3",
  augmentPickerOpen: "/audio/ui/augment-picker-open-voice.mp3",
  installAugment: "/audio/ui/install-augment-voice.mp3",
  sellWeapon: "/audio/ui/sell-weapon-voice.mp3",
  sellAugment: "/audio/ui/sell-augment-voice.mp3",
  slotPickerOpen: "/audio/ui/slot-picker-open-voice.mp3",
  equipWeapon: "/audio/ui/equip-weapon-voice.mp3",
  unequipWeapon: "/audio/ui/unequip-weapon-voice.mp3",
  // Cleared-state cues — fire on victory in handleMissionComplete when a
  // mission completion flips the player's progress to "all missions in
  // current system done" or "all missions in every unlocked system done".
  // Files are under /audio/sfx/ rather than /audio/ui/ for historical
  // grouping (ui_shop_* are also under sfx/).
  systemCleared: "/audio/sfx/ui_system_cleared.mp3",
  everythingCleared: "/audio/sfx/ui_everything_cleared.mp3"
} as const;

export type UiCueId = keyof typeof UI_CUE;

export function playUiCue(id: UiCueId): void {
  storyAudio.play({
    musicSrc: null,
    voiceSrc: UI_CUE[id],
    voiceDelayMs: 0
  });
}
