"use client";

import { playUiCue } from "./uiCues";

// Cleared-state Grandma cues. Two one-shot voice clips that fire when a
// mission victory flips the player's progress to a cleared boundary:
//
//   ui_system_cleared.mp3      — every mission in the CURRENT solar system done
//   ui_everything_cleared.mp3  — every mission in every UNLOCKED system done
//
// The two are mutually exclusive: when "everything cleared" fires it
// suppresses the system-cleared cue, so the player never hears two voices
// stacked on top of each other.
//
// The catalog/progress math that decides those two booleans lives in
// `content` (evaluateClearedBoundaries in src/game/data/clearedState.ts) so
// this engine stays a types-only audio module — it consumes the verdict, it
// does not compute it. The ui caller (useVictoryFlow) runs the selector and
// passes the result in. See docs/audit/04-found-bugs.md 2026-06-13.
//
// Persistence for the once-per-device "everything cleared" semantics lives
// in localStorage rather than on StateSnapshot. The cue is a player-feel
// signal, not gameplay state — losing it across devices is acceptable, and
// the localStorage approach avoids a save-roundtrip-audit + DB migration
// for one boolean. If the player later completes a mission while NOT in
// the all-cleared state, the flag re-arms so the cue fires again when
// they next reach all-cleared (post-new-content scenario).
//
// Distinct from the looping `on-system-cleared-idle` storyTrigger overlay
// (handled in useStoryTriggers.ts) — that loop plays a longer narration
// every ~30s while idling in a cleared system. These cues fire ONCE at
// the moment of clearing.

const EVERYTHING_CLEARED_KEY = "spacepotatis:ui_everything_cleared_fired_v1";

interface Input {
  readonly systemNowCleared: boolean;
  readonly everythingNowCleared: boolean;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readFiredFlag(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return storage.getItem(EVERYTHING_CLEARED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeFiredFlag(value: boolean): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (value) storage.setItem(EVERYTHING_CLEARED_KEY, "1");
    else storage.removeItem(EVERYTHING_CLEARED_KEY);
  } catch {
    // Quota / private-mode: silently drop. Worst case the cue plays an extra
    // time on the next visit, which is an acceptable degradation.
  }
}

/**
 * Decide whether to play `systemCleared` or `everythingCleared` after a
 * mission victory, given the cleared-boundary verdict computed by
 * `evaluateClearedBoundaries` (content). At most one cue fires per call.
 *
 * Re-arming: if the player's post-victory state is NOT all-cleared but the
 * "everything cleared" flag is set, drop the flag so a future return to
 * all-cleared (e.g. after new content ships) plays the cue again.
 */
export function maybePlayClearedCue(input: Input): void {
  const { systemNowCleared, everythingNowCleared } = input;

  const alreadyFired = readFiredFlag();

  if (everythingNowCleared && !alreadyFired) {
    playUiCue("everythingCleared");
    writeFiredFlag(true);
    return;
  }

  // Re-arm: if we're back below all-cleared (e.g. new content shipped),
  // drop the flag so the next return to all-cleared plays the cue.
  if (!everythingNowCleared && alreadyFired) {
    writeFiredFlag(false);
  }

  // System-cleared fires ONLY when everything-cleared didn't. Voice-
  // stacking on the same victory would be confusing — the bigger event
  // wins. If everything was already cleared and the flag was set, the
  // current victory isn't the moment that flipped it, so neither cue
  // fires (no-op).
  if (systemNowCleared && !everythingNowCleared) {
    playUiCue("systemCleared");
  }
}
