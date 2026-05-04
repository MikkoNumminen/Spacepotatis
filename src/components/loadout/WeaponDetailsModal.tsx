"use client";

import { useEffect, useState } from "react";
import { storyAudio } from "@/game/audio/story";
import { getAugment } from "@/game/data/augments";
import type { AugmentId, WeaponDefinition } from "@/types/game";
import { WeaponStats } from "@/components/WeaponStats";
import { BUTTON_BACK } from "../ui/buttonClasses";
import { AugmentDot, WeaponDot } from "./dots";

// Per-weapon voiceover convention: /audio/weapons/<weaponId>-voice.mp3.
// Missing files fail silently (HTMLAudioElement doesn't throw on 404), so
// it's safe to wire the path before any voice is recorded.
function voicePathFor(weaponId: string): string {
  return `/audio/weapons/${weaponId}-voice.mp3`;
}

export function WeaponDetailsModal({
  weapon,
  level,
  augmentIds,
  onClose
}: {
  weapon: WeaponDefinition;
  level?: number;
  augmentIds?: readonly AugmentId[];
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);
  const installed = augmentIds ?? [];

  useEffect(() => {
    setReady(true);
    storyAudio.play({
      musicSrc: null,
      voiceSrc: voicePathFor(weapon.id),
      voiceDelayMs: 0
    });
    return () => {
      storyAudio.stop();
    };
  }, [weapon.id]);

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
          <WeaponDot tint={weapon.tint} />
          <span className="font-display text-base tracking-widest text-hud-amber">
            {weapon.name}
          </span>
          <TierBadge tier={weapon.tier} />
          {(level ?? 1) > 1 && (
            <span className="rounded border border-hud-green/40 px-1.5 py-0.5 font-mono text-[10px] text-hud-green/80">
              Mk {level}
            </span>
          )}
        </header>

        <WeaponStats weapon={weapon} level={level ?? 1} augmentIds={installed} />

        <p className="mt-4 text-xs text-hud-green/80">{weapon.description}</p>

        {installed.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-space-border pt-3">
            <span className="font-mono text-[10px] text-hud-green/60">
              augment{installed.length === 1 ? "" : "s"}:
            </span>
            {installed.map((id, idx) => {
              const aug = getAugment(id);
              return (
                <span
                  key={`${id}-${idx}`}
                  className="flex items-center gap-1 text-[11px] text-hud-amber/80"
                >
                  <AugmentDot tint={aug.tint} title={aug.name} />
                  {aug.name}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: 1 | 2 }) {
  const cls =
    tier === 1
      ? "border-hud-green/40 text-hud-green/70"
      : "border-hud-amber/50 text-hud-amber/80";
  return (
    <span
      aria-label={`Tier ${tier}`}
      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${cls}`}
    >
      T{tier}
    </span>
  );
}
