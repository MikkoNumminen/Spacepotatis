"use client";

import type { SolarSystemDefinition, SolarSystemId } from "@/types/game";
import { getAllSolarSystems } from "@/game/data/solarSystems";
import { BUTTON_BACK } from "../ui/buttonClasses";

export default function WarpPicker({
  currentSystemId,
  unlockedSystemIds,
  onClose,
  onSelect
}: {
  currentSystemId: SolarSystemId;
  unlockedSystemIds: readonly SolarSystemId[];
  onClose: () => void;
  onSelect: (id: SolarSystemId) => void;
}) {
  const systems: readonly SolarSystemDefinition[] = getAllSolarSystems().filter((s) =>
    unlockedSystemIds.includes(s.id)
  );

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6">
      <div className="relative w-[min(28rem,100%)] rounded border border-space-border bg-space-panel/95 p-5">
        <button
          type="button"
          onClick={onClose}
          className={`absolute left-3 top-3 z-10 min-h-[44px] ${BUTTON_BACK}`}
        >
          ← Back
        </button>
        <div className="mt-6 text-center font-display text-lg tracking-widest text-hud-green">WARP DRIVE</div>
        <p className="mt-1 text-center text-xs text-hud-amber">Select a destination system.</p>
        <ul className="mt-4 flex flex-col gap-2">
          {systems.map((sys) => {
            const active = sys.id === currentSystemId;
            return (
              <li key={sys.id}>
                <button
                  type="button"
                  onClick={() => onSelect(sys.id)}
                  disabled={active}
                  className="w-full touch-manipulation select-none rounded border border-hud-green/60 bg-space-bg/40 px-3 py-2 text-left transition-colors enabled:hover:bg-hud-green/10 enabled:active:bg-hud-green/20 disabled:cursor-default disabled:border-space-border"
                >
                  <div className="flex items-baseline justify-between">
                    <span
                      className={`font-display tracking-widest ${active ? "text-hud-amber" : "text-hud-green"}`}
                    >
                      {sys.name}
                    </span>
                    <span
                      className="ml-3 inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: sys.sunColor }}
                      aria-hidden
                    />
                  </div>
                  <div className="mt-1 text-xs text-hud-green/70">{sys.description}</div>
                  {active && (
                    <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-hud-amber/80">
                      current
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
