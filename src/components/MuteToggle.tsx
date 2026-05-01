"use client";

import { useEffect, useState } from "react";
import { sfx } from "@/game/audio/sfx";
import { setAllMuted } from "@/game/audio/music";

const STORAGE_KEY = "spacepotatis:muted";

// Lazy initializer keeps the very first render in sync with localStorage so
// the button doesn't flash "♪ on" for one paint while a returning muted
// player's effect catches up. The `typeof window` guard is required because
// "use client" components still render on the server during streaming SSR.
function readStoredMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export default function MuteToggle() {
  const [muted, setMuted] = useState<boolean>(readStoredMuted);

  useEffect(() => {
    sfx.setMuted(muted);
    setAllMuted(muted);
    return sfx.subscribe(setMuted);
    // Empty deps: initial mute application + subscription is a one-time
    // mount concern; subsequent toggles flow through `toggle` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const next = !muted;
    sfx.setMuted(next);
    setAllMuted(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
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
