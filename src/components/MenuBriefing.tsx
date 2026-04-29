"use client";

import { useEffect } from "react";
import { menuBriefingAudio } from "@/game/audio/menuBriefingAudio";

const SESSION_KEY = "spacepotatis:menuBriefingPlayed";

// Plays the system briefing voice once per browser session on the landing
// page. The sessionStorage gate keeps it from re-firing when the player
// navigates back to the menu mid-session. Cleared on tab close, so the
// next visit gets the briefing again — that's the "logs on" semantic.
export default function MenuBriefing() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(SESSION_KEY) === "1") return;
    window.sessionStorage.setItem(SESSION_KEY, "1");
    menuBriefingAudio.play();
    return () => {
      menuBriefingAudio.stop();
    };
  }, []);

  return null;
}
