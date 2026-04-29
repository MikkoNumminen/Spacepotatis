"use client";

import { useEffect } from "react";
import { menuBriefingAudio, type MenuBriefingItem } from "@/game/audio/menuBriefingAudio";
import { useOptimisticAuth } from "@/lib/useOptimisticAuth";

// Plays the landing-page voice queue every time the player enters the menu
// (initial load, refresh, or navigation back from /play). First nudge is
// keyed off the visible button label — CONTINUE for an authenticated
// player with a save, PLAY for everyone else. After that the queue is
// identical for both branches and ends with the system-briefing lecture.
export default function MenuBriefing() {
  const { status, hasSave } = useOptimisticAuth();
  const isContinue = status === "authenticated" && hasSave;

  useEffect(() => {
    const firstNudge = isContinue
      ? "/audio/menu/ui_idle_continue_nudge.mp3"
      : "/audio/menu/ui_idle_play_nudge.mp3";
    const sharedNudge = "/audio/menu/ui_idle_continue_nudge.mp3";

    // For PLAY users the first two items are play_nudge → continue_nudge.
    // For CONTINUE users they would both be continue_nudge — drop the
    // duplicate so the player isn't hearing the same line twice in a row.
    const queue: readonly MenuBriefingItem[] = [
      { src: firstNudge, gapBeforeMs: 0 },
      ...(firstNudge === sharedNudge
        ? []
        : [{ src: sharedNudge, gapBeforeMs: 5000 } satisfies MenuBriefingItem]),
      { src: "/audio/menu/ui_idle_final_warning.mp3", gapBeforeMs: 5000 },
      { src: "/audio/menu/ui_idle_surrender.mp3", gapBeforeMs: 5000 },
      { src: "/audio/menu/system-briefing.mp3", gapBeforeMs: 0 }
    ];
    menuBriefingAudio.playSequence(queue);

    // Autoplay arming: on a cold page load the first voice.play() rejects
    // because no user gesture has happened yet. The engine flags the stall
    // internally; calling arm() on the first interaction retries the stalled
    // voice. Listeners stay registered for the component's lifetime so a
    // later gesture (after the player has been idle) still recovers — arm()
    // is a no-op once the queue is running.
    const onGesture = (): void => menuBriefingAudio.arm();
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);

    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      menuBriefingAudio.stop();
    };
  }, [isContinue]);

  return null;
}
