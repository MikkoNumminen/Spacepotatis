"use client";

import { useEffect } from "react";
import { leaderboardAudio } from "@/game/audio/leaderboardAudio";

const LEAD_IN_MS = 6000;

// Mounts on the Leaderboard page and schedules the "Hall of Mediocrity"
// voice cue 6s after page entry. Cancels cleanly on unmount so a quick
// Back doesn't leak the voice onto the previous page.
export default function LeaderboardBriefing() {
  useEffect(() => {
    leaderboardAudio.play(LEAD_IN_MS);
    return () => {
      leaderboardAudio.stop();
    };
  }, []);

  return null;
}
