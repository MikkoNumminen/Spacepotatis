"use client";

import { useEffect, useState } from "react";
import { storyAudio } from "@/game/audio/story";
import type { StatDefinition } from "@/game/data/stats";
import { BUTTON_BACK } from "../ui/buttonClasses";

// Per-stat voiceover convention: /audio/stats/<statId>-voice.mp3.
// Missing files fail silently (HTMLAudioElement doesn't throw on 404), so
// it's safe to wire the path before any voice is recorded — same shape as
// WeaponDetailsModal / AugmentDetailsModal / UpgradeDetailsModal.
function voicePathFor(statId: string): string {
  return `/audio/stats/${statId}-voice.mp3`;
}

export function StatDetailsModal({
  stat,
  detail,
  onClose
}: {
  stat: StatDefinition;
  // Trailing fact specific to the row that opened the modal — e.g. the
  // current DPS number, or "1/2 used" for the augment-slot chip. Kept on
  // the call site so the registry doesn't have to know about live values.
  detail: string;
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    storyAudio.play({
      musicSrc: null,
      voiceSrc: voicePathFor(stat.id),
      voiceDelayMs: 0
    });
    return () => {
      storyAudio.stop();
    };
  }, [stat.id]);

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="stat-details-title"
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
          <span aria-hidden className="text-base">{stat.icon}</span>
          <span id="stat-details-title" className="font-display text-base tracking-widest text-hud-amber">
            {stat.name}
          </span>
        </header>

        <div className="mb-4 text-center font-mono text-[11px] text-hud-amber">
          {detail}
        </div>

        <div className="space-y-3 text-xs leading-relaxed text-hud-green/80">
          {stat.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
