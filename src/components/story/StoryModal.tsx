"use client";

import { useEffect, useState } from "react";
import type { StoryEntry } from "@/game/data/story";
import { menuMusic } from "@/game/audio/music";
import { storyAudio } from "@/game/audio/story";

// Cinematic story popup. Owns the lifecycle of the menu-music duck and the
// story audio engine — opening the modal pauses the menu bed and starts the
// story track; closing resumes the bed and silences both story tracks.
//
// `firstSeen` triggers a one-shot save (callback) so revisits from the
// Story log don't re-mark or re-fire any persistence side-effects.
export default function StoryModal({
  entry,
  firstSeen,
  onClose,
  onMarkSeen
}: {
  entry: StoryEntry;
  firstSeen: boolean;
  onClose: () => void;
  onMarkSeen?: () => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    menuMusic.duck();
    storyAudio.play({
      musicSrc: entry.musicTrack,
      voiceSrc: entry.voiceTrack,
      voiceDelayMs: entry.voiceDelayMs
    });
    if (firstSeen && onMarkSeen) onMarkSeen();
    return () => {
      storyAudio.stop();
      menuMusic.unduck();
    };
  }, [entry, firstSeen, onMarkSeen]);

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
        className={`max-w-xl rounded border border-hud-amber/60 bg-space-panel/95 p-8 shadow-[0_0_40px_rgba(255,204,51,0.15)] transition-all duration-200 ease-out ${
          ready ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        <div className="text-center font-display text-lg tracking-widest text-hud-amber">
          {entry.title}
        </div>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-hud-green/90">
          {entry.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-hud-amber/60 px-6 py-2 font-display text-xs tracking-widest text-hud-amber hover:bg-hud-amber/10"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
