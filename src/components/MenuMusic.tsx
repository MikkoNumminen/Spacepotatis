"use client";

import { useEffect } from "react";
import { menuMusic, setAllMuted } from "@/game/audio/music";
import { onPlaybackAllowed } from "@/game/audio/playbackGate";

// Canonical mute key, shared with MuteToggle, menuBriefingAudio, storyAudio,
// storyLogAudio, itemSfx, and leaderboardAudio. Don't introduce a parallel
// key here — that drift caused refresh-time mute desync in the past.
const MUTE_KEY = "spacepotatis:muted";

// Mounts once at the root layout. Defers all menuMusic interaction (init,
// gesture-listener registration, mute restore) until the page's SplashGate
// has dismissed and called allowPlayback(). Doing the actual `new Audio()`
// + `el.play()` inside a real user-gesture handler — the same pattern
// storyLogAudio uses — is what makes playback start reliably; pre-creating
// the element during page mount has stalled engines in the wild.
export default function MenuMusic() {
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const cleanupGate = onPlaybackAllowed(() => {
      const stored = window.localStorage.getItem(MUTE_KEY);
      if (stored === "1") setAllMuted(true);

      const onGesture = (): void => {
        // Lazy-init AND arm in the same call stack as a user gesture.
        // init() / arm() / ensurePlaying() are all idempotent — safe to
        // call on every gesture, only the first one matters once playback
        // has actually started.
        menuMusic.init();
        menuMusic.arm();
        menuMusic.ensurePlaying();
      };
      window.addEventListener("pointerdown", onGesture);
      window.addEventListener("keydown", onGesture);

      const sub = menuMusic.subscribe(({ muted }) => {
        window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
      });

      unsubscribe = (): void => {
        window.removeEventListener("pointerdown", onGesture);
        window.removeEventListener("keydown", onGesture);
        sub();
      };
    });

    return () => {
      cleanupGate();
      unsubscribe?.();
    };
  }, []);

  return null;
}
