"use client";

import { useEffect, useState } from "react";
import { storyAudio } from "@/game/audio/story";
import type { UpgradeDefinition } from "@/game/data/upgrades";
import { BUTTON_BACK } from "../ui/buttonClasses";

// Per-upgrade voiceover convention: /audio/upgrades/<upgradeId>-voice.mp3.
// Missing files fail silently (HTMLAudioElement doesn't throw on 404), so
// it's safe to wire the path before any voice is recorded — same shape as
// WeaponDetailsModal / AugmentDetailsModal.
function voicePathFor(upgradeId: string): string {
  return `/audio/upgrades/${upgradeId}-voice.mp3`;
}

export function UpgradeDetailsModal({
  upgrade,
  level,
  maxLevel,
  cost,
  detail,
  onClose
}: {
  upgrade: UpgradeDefinition;
  level: number;
  maxLevel: number;
  cost: number | null;
  // Live "level X/Y · max ⚡ Z" or similar string from the shop row, so the
  // modal stays a thin presentation layer instead of duplicating the
  // ShipConfig math.
  detail: string;
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    storyAudio.play({
      musicSrc: null,
      voiceSrc: voicePathFor(upgrade.id),
      voiceDelayMs: 0
    });
    return () => {
      storyAudio.stop();
    };
  }, [upgrade.id]);

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

        <header className="mb-4 mt-8 text-center">
          <span className="font-display text-base tracking-widest text-hud-amber">
            {upgrade.name}
          </span>
        </header>

        <div className="mb-3 text-center font-mono text-[11px] text-hud-green/70">
          level {level}/{maxLevel}
          {cost !== null && (
            <>
              <span className="mx-1.5 text-hud-green/30">·</span>
              <span className="text-hud-amber">¢ {cost} next</span>
            </>
          )}
        </div>
        <div className="mb-4 text-center font-mono text-[10px] text-hud-green/60">
          {detail}
        </div>

        <div className="space-y-3 text-xs leading-relaxed text-hud-green/80">
          {upgrade.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
