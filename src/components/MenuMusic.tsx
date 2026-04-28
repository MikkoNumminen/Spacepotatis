"use client";

import { useEffect } from "react";
import { menuMusic, setAllMuted } from "@/game/audio/music";

const MUTE_KEY = "spacepotatis:music-muted";

// Mounts once at the root layout. Owns the autoplay-arming gesture listener
// and the mute persistence. Does not render anything.
export default function MenuMusic() {
  useEffect(() => {
    menuMusic.init();
    const stored = window.localStorage.getItem(MUTE_KEY);
    if (stored === "1") setAllMuted(true);

    const onGesture = (): void => {
      menuMusic.arm();
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });

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
