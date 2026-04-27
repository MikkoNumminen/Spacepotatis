"use client";

import { useEffect } from "react";
import { music } from "@/game/audio/music";

const MUTE_KEY = "spacepotatis:music-muted";

// Mounts once at the root layout. Owns the autoplay-arming gesture listener
// and the mute persistence. Does not render anything.
export default function MenuMusic() {
  useEffect(() => {
    music.init();
    const stored = window.localStorage.getItem(MUTE_KEY);
    if (stored === "1") music.setMuted(true);

    const onGesture = (): void => {
      music.arm();
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });

    const unsubscribe = music.subscribe(({ muted }) => {
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
