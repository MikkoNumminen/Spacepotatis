"use client";

import { useEffect, useState } from "react";
import { audioBus } from "@/game/audio/AudioBus";

// Mute is SESSION-ONLY by design. Every page load starts with audio on;
// clicking the toggle silences for the current session only. We do NOT
// persist to localStorage and we do NOT read it on cold load. The previous
// design (persist via `spacepotatis:muted`) was a recurring source of
// "no music after refresh" bugs during testing — stale "1" values from
// prior sessions silenced the page with no recovery beyond noticing the
// toggle visual or manually clearing storage. The cost of dropping
// persistence is one click per visit for users who want quiet; the
// upside is the page never lies about whether music is on.
//
// On re-mount within the same session (e.g. /play → / nav), the lazy
// initializer reads the singleton AudioBus's current master state so the
// button visual matches whatever the user toggled before navigating.
export default function MuteToggle() {
  const [muted, setMuted] = useState<boolean>(() => audioBus.isMasterMuted());

  useEffect(() => {
    return audioBus.subscribe((s) => setMuted(s.masterMuted));
  }, []);

  const toggle = () => {
    audioBus.toggleMaster();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={muted}
      aria-label={muted ? "Unmute audio" : "Mute audio"}
      title={muted ? "Sound off" : "Sound on"}
      className="inline-flex min-h-[44px] min-w-[44px] touch-manipulation select-none items-center justify-center rounded border border-space-border px-2 py-1 text-xs text-hud-green/80 hover:bg-space-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-green/60 active:bg-space-panel/80 sm:min-h-0 sm:min-w-0"
    >
      <span aria-hidden="true">{muted ? "♪ off" : "♪ on"}</span>
    </button>
  );
}
