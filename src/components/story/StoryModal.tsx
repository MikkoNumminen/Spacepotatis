"use client";

import { useEffect, useState } from "react";
import type { StoryEntry } from "@/game/data/story";
import { storyAudio } from "@/game/audio/story";
import { menuMusic } from "@/game/audio/music";
import { BUTTON_BACK } from "../ui/buttonClasses";

// Cinematic story popup. Two presentation modes:
//
//   "first-time" — auto-fired beats. Ducks the galaxy bed and plays the
//                  entry's music + voice in the foreground. Continue
//                  unducks the galaxy bed and stops the cinematic audio.
//                  Without the duck, three streams (galaxy bed +
//                  cinematic music + voice) play on top of each other
//                  and the chapter beat sounds muddy.
//   "replay-from-log" — user opened this from the Story log. The
//                  storyLogAudio bed is already playing; this modal does
//                  NOT change music, only plays the voice on top. Back
//                  button (top-left of screen) returns to the Story log.
export default function StoryModal({
  entry,
  mode,
  firstSeen,
  onClose,
  onMarkSeen
}: {
  entry: StoryEntry;
  mode: "first-time" | "replay-from-log";
  firstSeen: boolean;
  onClose: () => void;
  onMarkSeen?: () => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    if (mode === "first-time") {
      // Duck the galaxy bed only when this entry actually brings its own
      // music. Modal entries today always do, but the guard keeps the
      // contract self-evident.
      const ducks = entry.musicTrack !== null;
      if (ducks) menuMusic.duck();
      storyAudio.play({
        musicSrc: entry.musicTrack,
        voiceSrc: entry.voiceTrack,
        voiceDelayMs: entry.voiceDelayMs
      });
      if (firstSeen && onMarkSeen) onMarkSeen();
      return () => {
        storyAudio.stop();
        if (ducks) menuMusic.unduck();
      };
    }
    // Replay-from-log: storyLogAudio is already playing the bed (managed
    // in GameCanvas). Don't touch the menu/log music — just play the
    // voice on top.
    storyAudio.play({
      musicSrc: null,
      voiceSrc: entry.voiceTrack,
      voiceDelayMs: 0
    });
    return () => {
      storyAudio.stop();
    };
  }, [entry, mode, firstSeen, onMarkSeen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-space-bg/80 p-3 backdrop-blur-sm sm:p-6">
      <div
        className={`relative w-full max-w-xl rounded border border-hud-amber/60 bg-space-panel/95 p-5 shadow-[0_0_40px_rgba(255,204,51,0.15)] transition-all duration-200 ease-out sm:p-8 ${
          ready ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        {mode === "replay-from-log" && (
          <button
            type="button"
            onClick={onClose}
            className={`absolute left-3 top-3 z-10 min-h-[44px] ${BUTTON_BACK}`}
          >
            ← Back
          </button>
        )}
        <div className="text-center font-display text-lg tracking-widest text-hud-amber">
          {entry.title}
        </div>
        <div className="mt-6 space-y-4 text-xs leading-relaxed text-hud-green/90">
          {entry.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
        {mode === "first-time" && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={onClose}
              className="touch-manipulation select-none rounded border border-hud-amber/60 px-6 py-2 font-display text-xs tracking-widest text-hud-amber hover:bg-hud-amber/10 active:bg-hud-amber/20"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
