"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { MissionDefinition } from "@/types/game";
import { useGameState } from "@/game/state/useGameState";

interface Props {
  mission: MissionDefinition | null;
  onClose: () => void;
  onLaunch?: (mission: MissionDefinition) => void;
}

export default function MissionSelect({ mission, onClose, onLaunch }: Props) {
  const completed = useGameState((s) => (mission ? s.completedMissions.includes(mission.id) : false));
  const unlocked = useGameState((s) => (mission ? s.unlockedPlanets.includes(mission.id) : false));
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mission || !panelRef.current) return;
    gsap.fromTo(
      panelRef.current,
      { x: 32, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.28, ease: "power3.out" }
    );
  }, [mission?.id]);

  if (!mission) return null;

  const isShop = mission.kind === "shop";
  const locked = !isShop && !unlocked;

  return (
    <div
      ref={panelRef}
      className="pointer-events-auto absolute right-6 top-1/2 w-80 -translate-y-1/2 rounded border border-space-border bg-space-panel/90 p-5 backdrop-blur-md"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-2 text-space-border hover:text-hud-green"
      >
        ×
      </button>

      <div className="font-display text-lg tracking-widest text-hud-green">{mission.name}</div>
      <div className="mt-1 text-[11px] text-hud-amber">
        {isShop ? "shop" : `difficulty ${"★".repeat(mission.difficulty)}`}
        {completed && <span className="ml-2 text-hud-green">· cleared</span>}
        {locked && <span className="ml-2 text-hud-red">· locked</span>}
      </div>

      <p className="mt-4 text-sm leading-relaxed text-hud-green/80">{mission.description}</p>

      {locked && mission.requires.length > 0 && (
        <div className="mt-3 text-[11px] text-hud-red">
          requires: {mission.requires.join(", ")}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onLaunch?.(mission)}
          disabled={locked}
          className="rounded border border-hud-green/60 px-4 py-2 font-display text-sm tracking-widest enabled:hover:bg-hud-green/10 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
        >
          {isShop ? "DOCK" : "LAUNCH MISSION"}
        </button>
      </div>
    </div>
  );
}
