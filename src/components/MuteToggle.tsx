"use client";

import { useEffect, useState } from "react";
import { sfx } from "@/game/audio/sfx";
import { setAllMuted } from "@/game/audio/music";

const STORAGE_KEY = "spacepotatis:muted";

export default function MuteToggle() {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const initial = stored === "1";
    sfx.setMuted(initial);
    setAllMuted(initial);
    setMuted(initial);
    return sfx.subscribe(setMuted);
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
      title={muted ? "Sound off" : "Sound on"}
      className="inline-flex min-h-[44px] min-w-[44px] touch-manipulation select-none items-center justify-center rounded border border-space-border px-2 py-1 text-xs text-hud-green/80 hover:bg-space-panel active:bg-space-panel/80 sm:min-h-0 sm:min-w-0"
    >
      {muted ? "♪ off" : "♪ on"}
    </button>
  );
}
