"use client";

import { useEffect } from "react";
import { menuMusic } from "@/game/audio";
import { useGameState } from "@/game/state";
import { getSolarSystem } from "@/game/data";

// Mounted once at the root layout. Listens for the first user gesture and
// lazy-inits + arms + plays the menu/galaxy bed inside that gesture's task
// — the same pattern storyLogAudio uses, which is the one that "just works"
// across browsers (the constructor + play() share user-activation context).
//
// Track selection follows currentSolarSystemId. Each solar system declares
// its own galaxyMusicTrack in solarSystems.json; switching systems hot-swaps
// the bed via menuMusic.loadTrack(). Tutorial maps to menu-theme.ogg, so the
// pre-warp landing/menu still plays the original theme.
//
// No splash gate. The splash overlay is `pointer-events-auto` while it's
// fully opaque, so window-level clicks during the loading screen are
// physically captured by the overlay and never reach this listener;
// playback can't start until the player is interacting with the menu
// underneath. Mute state is handled by MuteToggle, not here.
export default function MenuMusic() {
  const systemId = useGameState((s) => s.currentSolarSystemId);

  useEffect(() => {
    const onGesture = (): void => {
      // The {once: true} option on each listener removes that listener after
      // its first invocation — but the sibling listener (pointerdown vs.
      // keydown) is still armed. Remove it here so a stray keystroke after
      // an early click doesn't re-fire init/arm/ensurePlaying for nothing.
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      menuMusic.init();
      menuMusic.arm();
      menuMusic.ensurePlaying();
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, []);

  useEffect(() => {
    menuMusic.loadTrack(getSolarSystem(systemId).galaxyMusicTrack);
  }, [systemId]);

  return null;
}
