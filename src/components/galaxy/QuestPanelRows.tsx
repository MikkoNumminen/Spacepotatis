"use client";

import type { MissionDefinition, MissionId } from "@/types";

export type RowTone = "green" | "muted" | "cleared";

export function Section({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-3 first:mt-0">
      <div className="mb-1 select-none font-mono text-[10px] uppercase tracking-[0.2em] text-hud-green/60">
        {label}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function Stars({ n }: { n: number }) {
  return <span className="text-hud-amber">{"★".repeat(n)}</span>;
}

export function SuggestedRow({
  mission,
  expanded,
  onToggle,
  onLaunch
}: {
  mission: MissionDefinition;
  expanded: boolean;
  onToggle: (id: MissionId) => void;
  onLaunch: (mission: MissionDefinition) => void;
}) {
  return (
    <div className="rounded border border-hud-green/40 bg-space-bg/30 p-3">
      <button
        type="button"
        onClick={() => onToggle(mission.id)}
        className="flex w-full touch-manipulation select-none items-baseline justify-between text-left"
      >
        <span className="font-display text-sm tracking-widest text-hud-green">
          {mission.name}
        </span>
        <Stars n={mission.difficulty} />
      </button>
      {expanded && (
        <>
          <p className="mt-2 text-xs leading-relaxed text-hud-green/80">
            {mission.description}
          </p>
          <button
            type="button"
            onClick={() => onLaunch(mission)}
            className="mt-3 w-full touch-manipulation select-none rounded border border-hud-green/60 px-3 py-2 font-display text-xs tracking-widest text-hud-green hover:bg-hud-green/10 active:bg-hud-green/20"
          >
            LAUNCH MISSION
          </button>
        </>
      )}
    </div>
  );
}

export function CollapsibleRow({
  mission,
  expanded,
  onToggle,
  prefix,
  tone,
  hint,
  actionLabel,
  onAction
}: {
  mission: MissionDefinition;
  expanded: boolean;
  onToggle: (id: MissionId) => void;
  prefix: string;
  tone: RowTone;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const nameColor =
    tone === "muted"
      ? "text-hud-green/40"
      : tone === "cleared"
        ? "text-hud-green/70"
        : "text-hud-green";
  return (
    <div className="rounded border border-space-border/60 bg-space-bg/20 px-2 py-1.5">
      <button
        type="button"
        onClick={() => onToggle(mission.id)}
        className="flex w-full touch-manipulation select-none items-baseline justify-between text-left"
      >
        <span className={`font-mono text-xs ${nameColor}`}>
          {prefix}
          {mission.name}
        </span>
        <Stars n={mission.difficulty} />
      </button>
      {expanded && (
        <div className="mt-2 border-t border-space-border/40 pt-2">
          <p className="text-xs leading-relaxed text-hud-green/70">
            {mission.description}
          </p>
          {hint && <div className="mt-2 text-xs text-hud-red/80">{hint}</div>}
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="mt-2 w-full touch-manipulation select-none rounded border border-hud-green/40 px-3 py-1.5 font-display text-xs tracking-widest text-hud-green hover:bg-hud-green/10 active:bg-hud-green/20"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ShopRow({
  shop,
  onLaunch
}: {
  shop: MissionDefinition;
  onLaunch: (mission: MissionDefinition) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded border border-hud-amber/40 bg-space-bg/30 px-3 py-2">
      <div>
        <div className="font-display text-xs tracking-widest text-hud-amber">
          {shop.name}
        </div>
        <div className="text-xs text-hud-green/60">{shop.description}</div>
      </div>
      <button
        type="button"
        onClick={() => onLaunch(shop)}
        className="ml-3 touch-manipulation select-none rounded border border-hud-amber/60 px-3 py-1 font-display text-xs tracking-widest text-hud-amber hover:bg-hud-amber/10 active:bg-hud-amber/20"
      >
        DOCK
      </button>
    </div>
  );
}

export function SystemClearCta({
  warpAvailable,
  allContentCleared,
  onWarp
}: {
  warpAvailable: boolean;
  allContentCleared: boolean;
  onWarp: () => void;
}) {
  if (allContentCleared) {
    // Every unlocked system the player has access to is cleared end-to-end.
    // The warp picker has nowhere useful to send them, so we don't render
    // the button — the on-all-cleared-idle voice cue covers the audio side,
    // this is the visible counterpart.
    return (
      <div className="rounded border border-hud-amber/30 bg-space-bg/30 p-3 text-center">
        <div className="font-display text-xs tracking-widest text-hud-amber">
          ALL SECTORS CLEAR
        </div>
        <p className="mt-1 text-xs text-hud-green/70">
          Every charted system is done. New sectors are being mapped.
        </p>
        <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-hud-green/50">
          more content coming soon
        </p>
      </div>
    );
  }
  return (
    <div className="rounded border border-hud-amber/30 bg-space-bg/30 p-3 text-center">
      <div className="font-display text-xs tracking-widest text-hud-amber">
        SYSTEM CLEAR
      </div>
      <p className="mt-1 text-xs text-hud-green/70">
        Every mission in this system is done.
      </p>
      {warpAvailable ? (
        <button
          type="button"
          onClick={onWarp}
          className="mt-3 w-full touch-manipulation select-none rounded border border-hud-amber/60 px-3 py-2 font-display text-xs tracking-widest text-hud-amber hover:bg-hud-amber/10 active:bg-hud-amber/20"
        >
          WARP TO NEXT SYSTEM
        </button>
      ) : (
        <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-hud-green/40">
          more content coming
        </p>
      )}
    </div>
  );
}
