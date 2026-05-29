"use client";

import { useEffect, useRef } from "react";
import {
  markStorySeen,
  saveNow,
  useGameState
} from "@/game/state";
import { STORY_ENTRIES } from "@/game/data";
import { menuMusic, shopMusic, storyAudio } from "@/game/audio";

// Owns the /shop session's audio lifecycle. Lifted out of ShopUI because
// ShopUI mounts/unmounts on every market↔garage tab switch — its useEffect
// cleanups were stopping `shopMusic` and `unduck`-ing `menuMusic` mid-visit,
// which the player heard as a jarring music interruption on every tap of
// the tab pill. The hook lives at the ShopTabs level so the music engines
// are bound to the /shop session, not to the tab.
//
// Contract:
//   - shopMusic + menuMusic duck/unduck run on /shop session boundaries
//     (ShopTabs mount + unmount). Tab switches do NOT touch them.
//   - storyAudio (the on-shop-open Grandma voice + cinematic bed) plays
//     once per /shop session, on the first time the player is on the
//     market tab. Switching AWAY from market cancels the voice (the user
//     wants tab switches to interrupt the market voice so a future
//     dedicated garage voice can take over cleanly).
//   - Returning to market after the voice has already played in this
//     session does NOT replay it (gated by `voicePlayedRef`).
export function useShopAudio(tab: "market" | "garage"): void {
  const seenStoryEntries = useGameState((s) => s.seenStoryEntries);
  // Stale-capture guard: read seenStoryEntries via a ref inside the
  // effect so the mark-seen + saveNow branch checks the LATEST value at
  // the moment the effect runs. Without this, a re-dock that lands
  // before the previous saveNow has flushed would see a stale
  // `seenStoryEntries` snapshot and re-POST the same mark-seen state.
  const seenStoryEntriesRef = useRef(seenStoryEntries);
  seenStoryEntriesRef.current = seenStoryEntries;

  // /shop session music. Mounts once per /shop entry, unmounts on leave.
  // Tab switches don't affect this — that's the whole point of lifting it
  // up here from ShopUI.
  useEffect(() => {
    menuMusic.duck();
    shopMusic.loadTrack("/audio/music/shop.ogg");
    return () => {
      shopMusic.stop();
      menuMusic.unduck();
    };
  }, []);

  // Dock-arrival voice. One-shot per /shop session, gated to the market
  // tab. Switching to garage cancels any in-flight voice. The ref pattern
  // makes the play-once contract robust to React Strict Mode's
  // double-invoke in dev.
  const voicePlayedRef = useRef(false);
  useEffect(() => {
    if (tab !== "market") {
      storyAudio.stop();
      return;
    }
    if (voicePlayedRef.current) return;
    voicePlayedRef.current = true;
    const entry = STORY_ENTRIES.find((e) => e.autoTrigger?.kind === "on-shop-open");
    if (!entry) return;
    storyAudio.play({
      musicSrc: entry.musicTrack,
      voiceSrc: entry.voiceTrack,
      voiceDelayMs: entry.voiceDelayMs
    });
    if (!seenStoryEntriesRef.current.includes(entry.id)) {
      markStorySeen(entry.id);
      void saveNow();
    }
    return () => {
      // Cleanup on /shop unmount OR on next tab change: cancel the voice
      // either way. The dual-purpose return is intentional — the
      // non-market branch above also stops, so re-entry from garage with
      // voicePlayedRef set just no-ops.
      storyAudio.stop();
    };
  }, [tab]);
}
