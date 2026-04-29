"use client";

import { useEffect, useState } from "react";
import type { StoryEntry } from "@/game/data/story";
import { menuMusic } from "@/game/audio/music";
import { storyAudio } from "@/game/audio/story";

// Cinematic story popup. Two presentation modes:
//
//   "first-time" — auto-fired beats. Owns the music lifecycle: ducks the
//                  menu bed and plays the entry's music + voice. Continue
//                  button dismisses.
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
      // Auto-fire owns the music lifecycle. Only duck the menu bed when
      // the entry brings its own music — otherwise the modal would sit
      // silent over the existing bed.
      const hasOwnMusic = entry.musicTrack !== null;
      if (hasOwnMusic) menuMusic.duck();
      storyAudio.play({
        musicSrc: entry.musicTrack,
        voiceSrc: entry.voiceTrack,
        voiceDelayMs: entry.voiceDelayMs
      });
      if (firstSeen && onMarkSeen) onMarkSeen();
      return () => {
        storyAudio.stop();
        if (hasOwnMusic) menuMusic.unduck();
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
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-space-bg/80 backdrop-blur-sm">
      <div
        className={`relative max-w-xl rounded border border-hud-amber/60 bg-space-panel/95 p-8 shadow-[0_0_40px_rgba(255,204,51,0.15)] transition-all duration-200 ease-out ${
          ready ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        {mode === "replay-from-log" && (
          <button
            type="button"
            onClick={onClose}
            className="absolute left-3 top-3 rounded border border-hud-green/60 px-3 py-1 font-mono text-xs text-hud-green/90 transition-colors hover:bg-hud-green/10"
          >
            ← Back
          </button>
        )}
        <div className="text-center font-display text-lg tracking-widest text-hud-amber">
          {entry.title}
        </div>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-hud-green/90">
          {entry.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
        {mode === "first-time" && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-hud-amber/60 px-6 py-2 font-display text-xs tracking-widest text-hud-amber hover:bg-hud-amber/10"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
