"use client";

import { useEffect, useState } from "react";
import { storyAudio } from "@/game/audio/story";
import type { AugmentDefinition } from "@/game/data/augments";
import { BUTTON_BACK } from "../ui/buttonClasses";
import { AugmentDot } from "./dots";

// Per-augment voiceover convention: /audio/augments/<augmentId>-voice.mp3.
// Missing files fail silently (HTMLAudioElement doesn't throw on 404).
function voicePathFor(augmentId: string): string {
  return `/audio/augments/${augmentId}-voice.mp3`;
}

export function AugmentDetailsModal({
  augment,
  onClose
}: {
  augment: AugmentDefinition;
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    storyAudio.play({
      musicSrc: null,
      voiceSrc: voicePathFor(augment.id),
      voiceDelayMs: 0
    });
    return () => {
      storyAudio.stop();
    };
  }, [augment.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-space-bg/80 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-md rounded border border-hud-amber/60 bg-space-panel/95 p-5 shadow-[0_0_40px_rgba(255,204,51,0.15)] transition-all duration-200 ease-out sm:p-6 ${
          ready ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          className={`absolute left-3 top-3 z-10 ${BUTTON_BACK}`}
        >
          ← Back
        </button>

        <header className="mb-4 mt-8 flex items-baseline justify-center gap-2">
          <AugmentDot tint={augment.tint} />
          <span className="font-display text-base tracking-widest text-hud-amber">
            {augment.name}
          </span>
        </header>

        <p className="text-xs text-hud-green/80">{augment.description}</p>
      </div>
    </div>
  );
}
