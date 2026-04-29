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

    const queue: readonly MenuBriefingItem[] = [
      { src: firstNudge, gapBeforeMs: 0 },
      { src: "/audio/menu/ui_idle_continue_nudge.mp3", gapBeforeMs: 5000 },
      { src: "/audio/menu/ui_idle_final_warning.mp3", gapBeforeMs: 5000 },
      { src: "/audio/menu/ui_idle_surrender.mp3", gapBeforeMs: 5000 },
      { src: "/audio/menu/system-briefing.mp3", gapBeforeMs: 0 }
    ];
    menuBriefingAudio.playSequence(queue);

    return () => {
      menuBriefingAudio.stop();
    };
  }, [isContinue]);

  return null;
}
