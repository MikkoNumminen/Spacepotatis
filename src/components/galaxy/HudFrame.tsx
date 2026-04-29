"use client";

import type { MissionDefinition } from "@/types/game";
import MuteToggle from "@/components/MuteToggle";
import UserMenu from "@/components/UserMenu";
import { useGameState } from "@/game/state/useGameState";
import { getSolarSystem } from "@/game/data/solarSystems";

function StatRow({
  label,
  value,
  valueClass
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-20 text-[10px] uppercase tracking-[0.2em] text-hud-green/70">
        {label}
      </span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function StatsPanel({ credits, cleared }: { credits: number; cleared: number }) {
  return (
    <div className="flex flex-col gap-1.5 font-mono text-xs">
      <StatRow label="credits" value={`¢ ${credits}`} valueClass="text-hud-amber" />
      <StatRow label="cleared" value={String(cleared)} valueClass="text-hud-green" />
    </div>
  );
}

export default function HudFrame({
  hovered,
  onBackToMenu,
  onOpenWarp,
  warpAvailable,
  onOpenStoryList
}: {
  hovered: MissionDefinition | null;
  onBackToMenu: () => void;
  onOpenWarp: () => void;
  warpAvailable: boolean;
  onOpenStoryList: () => void;
}) {
  const credits = useGameState((s) => s.credits);
  const cleared = useGameState((s) => s.completedMissions.length);
  const currentSystemId = useGameState((s) => s.currentSolarSystemId);
  const currentSystem = getSolarSystem(currentSystemId);

  return (
    <>
      <div className="absolute left-1/2 top-3 flex -translate-x-1/2 select-none flex-col items-center sm:top-6">
        <div className="font-display text-lg tracking-widest text-hud-green/90 drop-shadow-[0_0_8px_rgba(94,255,167,0.25)] sm:text-xl">
          SPACEPOTATIS
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-hud-amber/80">
          {currentSystem.name}
        </div>
      </div>
      <div className="absolute left-3 top-16 flex flex-col gap-3 sm:left-6 sm:top-6">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onBackToMenu}
            className="touch-manipulation select-none rounded border border-hud-green/60 px-3 py-1.5 font-mono text-xs text-hud-green/90 transition-colors hover:bg-hud-green/10 active:bg-hud-green/20"
          >
            ← Menu
          </button>
          <button
            type="button"
            onClick={onOpenWarp}
            disabled={!warpAvailable}
            title={warpAvailable ? "Warp to another system" : "No other systems unlocked yet"}
            className="touch-manipulation select-none rounded border border-hud-green/60 px-3 py-1.5 font-mono text-xs text-hud-green/90 transition-colors enabled:hover:bg-hud-green/10 enabled:active:bg-hud-green/20 disabled:cursor-not-allowed disabled:border-space-border disabled:text-space-border"
          >
            Warp
          </button>
        </div>
        <StatsPanel credits={credits} cleared={cleared} />
      </div>
      <div className="pointer-events-auto absolute right-3 top-3 flex items-center gap-2 font-mono text-xs sm:right-6 sm:top-6 sm:gap-3">
        <MuteToggle />
        <UserMenu onOpenStoryList={onOpenStoryList} />
      </div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 select-none flex-col items-center gap-2 px-3 text-center sm:bottom-6">
        {hovered && (
          <div className="rounded border border-space-border bg-space-panel/80 px-4 py-2 backdrop-blur-sm">
            <div className="font-display tracking-widest text-hud-green">{hovered.name}</div>
            <div className="text-xs text-hud-amber">
              {hovered.kind === "shop"
                ? "shop"
                : hovered.kind === "scenery"
                  ? null
                  : `difficulty ${"★".repeat(hovered.difficulty)}`}
            </div>
          </div>
        )}
        <div className="hidden font-mono text-xs text-hud-green/60 sm:block">
          drag to orbit · scroll to zoom · hover a planet · click to select
        </div>
        <div className="font-mono text-[10px] text-hud-green/60 sm:hidden">
          drag · pinch · tap a planet
        </div>
      </div>
    </>
  );
}
