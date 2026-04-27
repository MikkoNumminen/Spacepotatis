"use client";

import { useEffect, useState } from "react";
import { sfx } from "@/game/audio/sfx";
import { music } from "@/game/audio/music";

const STORAGE_KEY = "spacepotatis:muted";

export default function MuteToggle() {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const initial = stored === "1";
    sfx.setMuted(initial);
    music.setMuted(initial);
    setMuted(initial);
    return sfx.subscribe(setMuted);
  }, []);

  const toggle = () => {
    const next = !muted;
    sfx.setMuted(next);
    music.setMuted(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={muted ? "Sound off" : "Sound on"}
      className="rounded border border-space-border px-2 py-1 text-[11px] text-hud-green/80 hover:bg-space-panel"
    >
      {muted ? "♪ off" : "♪ on"}
    </button>
  );
}
