"use client";

import { useEffect } from "react";
import { menuMusic, setAllMuted } from "@/game/audio/music";
import { isPlaybackAllowed, onPlaybackAllowed } from "@/game/audio/playbackGate";

// Canonical mute key, shared with MuteToggle, menuBriefingAudio, storyAudio,
// storyLogAudio, itemSfx, and leaderboardAudio. Don't introduce a parallel
// key here — that drift caused refresh-time mute desync in the past.
const MUTE_KEY = "spacepotatis:muted";

// Mounted once at the root layout. Listens for the first user gesture and
// uses it to lazily create the Audio element + arm autoplay activation —
// the same pattern storyLogAudio uses, which is why storyLogAudio "just
// works" while a pre-created element stalls.
//
// Gesture listeners are registered AT MOUNT, not after the splash gate
// opens. Reason: when SplashGate flips `hide=true` it sets pointer-events
// to none on the overlay 400ms before the gate actually fires onDismiss,
// so clicks during that fade pass through to the menu (e.g. a "Play"
// button click that triggers navigation) — if our listener wasn't yet
// armed, that gesture is wasted and the user has to click again to get
// audio. Listening from mount catches every click; the gate only governs
// whether we actually start playback (we don't want the bed under the
// loading screen).
export default function MenuMusic() {
  useEffect(() => {
    // Restore mute state synchronously so a gesture that fires before the
    // gate opens still sees the right muted flag.
    if (window.localStorage.getItem(MUTE_KEY) === "1") setAllMuted(true);

    let gestureSeen = false;

    const startPlayback = (): void => {
      // All three are idempotent — safe to call repeatedly. Only the first
      // call has any effect once playback has actually started.
      menuMusic.init();
      menuMusic.arm();
      menuMusic.ensurePlaying();
    };

    const onGesture = (): void => {
      gestureSeen = true;
      // Always create the Audio element inside the gesture's task so the
      // browser's user-activation flag carries the eventual play() call.
      // (Safari in particular wants the Audio constructor and play() in
      // the same gesture-rooted task.) We only kick play() when the gate
      // is already open; otherwise this is just "warm up the engine".
      menuMusic.init();
      if (isPlaybackAllowed()) {
        menuMusic.arm();
        menuMusic.ensurePlaying();
      }
    };

    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);

    const cleanupGate = onPlaybackAllowed(() => {
      // Gate just opened. If the player already clicked during the splash
      // fade-out (common, since the overlay drops pointer-events the
      // instant `hide=true` even though dismiss is still 400ms away), the
      // page already has sticky user activation — kicking play() now
      // succeeds even though we're outside the original gesture's task.
      // If no gesture has happened yet, leave the engine cold; the next
      // pointerdown / keydown will run the full chain via onGesture.
      if (gestureSeen) startPlayback();
    });

    const sub = menuMusic.subscribe(({ muted }) => {
      window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    });

    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      cleanupGate();
      sub();
    };
  }, []);

  return null;
}
