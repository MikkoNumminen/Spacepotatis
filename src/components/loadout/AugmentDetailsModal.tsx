"use client";

import { useEffect, useState } from "react";
import { storyAudio } from "@/game/audio/story";
import type { AugmentDefinition } from "@/game/data/augments";
import type { WeaponInstance } from "@/game/state/ShipConfig";
import type { WeaponDefinition } from "@/types/game";
import { BUTTON_BACK } from "../ui/buttonClasses";
import { Bar } from "./Bar";
import { AugmentDot } from "./dots";
import {
  computeAugmentImpact,
  describeAugmentEffect,
  type AugmentImpact
} from "./augmentImpact";

// Per-augment voiceover convention: /audio/augments/<augmentId>-voice.mp3.
// Missing files fail silently (HTMLAudioElement doesn't throw on 404).
function voicePathFor(augmentId: string): string {
  return `/audio/augments/${augmentId}-voice.mp3`;
}

// `context` is provided when the modal is opened from a weapon row (we
// know which weapon the augment is — or would be — installed on, so the
// bar diagram shows real before/after numbers). Null when opened from
// the shop (the modal falls back to the raw effect summary).
export interface AugmentDetailsContext {
  readonly weapon: WeaponDefinition;
  readonly instance: WeaponInstance;
}

export function AugmentDetailsModal({
  augment,
  context,
  onClose
}: {
  augment: AugmentDefinition;
  context: AugmentDetailsContext | null;
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

  const effectSummary = describeAugmentEffect(augment);
  const impact = context ? computeAugmentImpact(context.weapon, context.instance, augment) : null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-space-bg/80 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="augment-details-title"
        aria-describedby="augment-details-effect augment-details-impact augment-details-desc"
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

        <header className="mb-3 mt-8 flex items-baseline justify-center gap-2">
          <AugmentDot tint={augment.tint} />
          <span id="augment-details-title" className="font-display text-base tracking-widest text-hud-amber">
            {augment.name}
          </span>
        </header>

        <div id="augment-details-effect" className="mb-4 text-center font-mono text-[11px] text-hud-amber">
          {effectSummary}
        </div>

        {/* Always-present wrapper id so aria-describedby resolves cleanly
            whether or not the augment is currently installed (no impact).
            Empty wrapper is benign — screen reader announces nothing for
            this section and falls through to the description below. */}
        <div id="augment-details-impact">
          {impact && (
            <ImpactDiagram impact={impact} contextLabel={contextLabel(context)} />
          )}
        </div>

        <p id="augment-details-desc" className="text-xs leading-relaxed text-hud-green/80">{augment.description}</p>
      </div>
    </div>
  );
}

function contextLabel(context: AugmentDetailsContext | null): string {
  if (!context) return "";
  const lvl = context.instance.level;
  return lvl > 1 ? `${context.weapon.name} · MARK ${lvl}` : context.weapon.name;
}

function ImpactDiagram({
  impact,
  contextLabel: label
}: {
  impact: AugmentImpact;
  contextLabel: string;
}) {
  const { before, after, label: statLabel, unit } = impact;
  // Vertical bars share a max so the visual ratio mirrors the value
  // ratio. Tiny inflation (1.05×) leaves a sliver above the taller bar
  // so it doesn't touch the top of the frame.
  const max = Math.max(before, after, 1) * 1.05;
  const beforePct = (before / max) * 100;
  const afterPct = (after / max) * 100;
  // For energy, lower is better — flip the colour mapping so "after"
  // is green when it represents an improvement.
  const afterIsBetter = impact.stat === "energy" ? after < before : after > before;
  const afterColor = afterIsBetter ? "#66ffaa" : "#ff5566";

  return (
    <div className="mb-4 rounded border border-space-border bg-space-bg/40 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-hud-green/60">
        <span>{statLabel} impact</span>
        {label && <span className="truncate text-hud-green/50">{label}</span>}
      </div>
      <div className="flex items-end justify-center gap-6">
        <Bar value={before} unit={unit} pct={beforePct} caption="Before" tint="#888" />
        <Bar value={after} unit={unit} pct={afterPct} caption="After" tint={afterColor} />
      </div>
    </div>
  );
}

