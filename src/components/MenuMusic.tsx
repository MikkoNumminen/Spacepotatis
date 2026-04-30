"use client";

import { useEffect } from "react";
import { menuMusic, setAllMuted } from "@/game/audio/music";

// Canonical mute key, shared with MuteToggle, menuBriefingAudio, storyAudio,
// storyLogAudio, itemSfx, and leaderboardAudio. Don't introduce a parallel
// key here — that drift caused refresh-time mute desync in the past.
const MUTE_KEY = "spacepotatis:muted";

// Mounts once at the root layout. Owns the autoplay-arming gesture listener
// and the cold-load mute restore. Does not render anything.
export default function MenuMusic() {
  useEffect(() => {
    menuMusic.init();
    const stored = window.localStorage.getItem(MUTE_KEY);
    if (stored === "1") setAllMuted(true);

    // Arm + nudge on every user gesture, not just the first. Browsers can
    // fire stray early pointerdowns (focus restoration, in-flight transition
    // clicks) before the page has full user-activation context for
    // autoplay. If a {once: true} listener consumed that stray event, the
    // music engine would stall armed-but-not-playing and never recover —
    // because no later listener was waiting for the actual user click.
    // arm() and ensurePlaying() are both idempotent on a healthy engine,
    // so calling them on every gesture costs nothing and self-heals stalls.
    const onGesture = (): void => {
      menuMusic.arm();
      menuMusic.ensurePlaying();
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);

    const unsubscribe = menuMusic.subscribe(({ muted }) => {
      window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    });

    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      unsubscribe();
    };
  }, []);

  return null;
}
