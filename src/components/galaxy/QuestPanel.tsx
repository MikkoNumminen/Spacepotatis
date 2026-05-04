"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  MissionDefinition,
  MissionId,
  SolarSystemId
} from "@/types/game";
import { getAllMissions, getMission } from "@/game/data/missions";
import { getSolarSystem } from "@/game/data/solarSystems";
import { useGameState } from "@/game/state/useGameState";
import { bucketMissions } from "./questBuckets";

export default function QuestPanel({
  currentSolarSystemId,
  focusedPlanetId,
  onLaunch,
  onWarpToNext,
  onMissionSelect
}: {
  currentSolarSystemId: SolarSystemId;
  focusedPlanetId: MissionId | null;
  onLaunch: (mission: MissionDefinition) => void;
  onWarpToNext: () => void;
  onMissionSelect?: (missionId: MissionId) => void;
}) {
  const unlockedPlanets = useGameState((s) => s.unlockedPlanets);
  const completedMissions = useGameState((s) => s.completedMissions);
  const unlockedSystems = useGameState((s) => s.unlockedSolarSystems);
  const system = getSolarSystem(currentSolarSystemId);

  const buckets = useMemo(
    () =>
      bucketMissions(
        getAllMissions(),
        currentSolarSystemId,
        unlockedPlanets,
        completedMissions
      ),
    [currentSolarSystemId, unlockedPlanets, completedMissions]
  );

  // The suggested mission is expanded by default. When the system changes,
  // collapse back to the new suggestion. Local state — the parent only
  // tells us about external focus events (planet clicks in the 3D view).
  const [expandedId, setExpandedId] = useState<MissionId | null>(
    buckets.suggested?.id ?? null
  );

  useEffect(() => {
    setExpandedId(buckets.suggested?.id ?? null);
  }, [currentSolarSystemId, buckets.suggested?.id]);

  // Planet click in the 3D view → expand the matching panel entry. Skip if
  // the focused planet isn't in this system (e.g. legacy state, or the user
  // warped before the click resolved).
  useEffect(() => {
    if (!focusedPlanetId) return;
    const m = getAllMissions().find((x) => x.id === focusedPlanetId);
    if (!m || m.solarSystemId !== currentSolarSystemId) return;
    setExpandedId(focusedPlanetId);
  }, [focusedPlanetId, currentSolarSystemId]);

  const otherSystemsUnlocked = unlockedSystems.some((id) => id !== currentSolarSystemId);

  // True only if any unlocked OTHER system still has uncleared mission-kind
  // missions. When false, "warp to next system" is misleading — there's no
  // more queued content to find. We surface a "more content coming" CTA
  // instead.
  //
  // Counts gated-but-incomplete missions as unfinished too — i.e. only
  // checks `!completedSet.has(m.id)` rather than also requiring the planet
  // to be in `unlockedPlanets`. The filter the other way around (only
  // unlocked planets count) is robust for a linear-chain DAG (today's
  // content), but a future non-linear DAG with a still-locked side-branch
  // could falsely trip "ALL SECTORS CLEAR" while real content waited.
  const hasUnfinishedInOtherSystems = useMemo(() => {
    const completedSet = new Set(completedMissions);
    return getAllMissions().some(
      (m) =>
        m.kind === "mission" &&
        m.solarSystemId !== currentSolarSystemId &&
        unlockedSystems.includes(m.solarSystemId) &&
        !completedSet.has(m.id)
    );
  }, [currentSolarSystemId, unlockedSystems, completedMissions]);

  // Notify the parent every time a mission becomes the expanded one — both
  // explicit toggles and the auto-expansion of the suggested mission count
  // as "selecting" it. The on-mission-select story trigger gates on the
  // seen-set so an entry only fires once per save no matter how many times
  // the same card is opened.
  useEffect(() => {
    if (expandedId) onMissionSelect?.(expandedId);
  }, [expandedId, onMissionSelect]);

  const toggle = (id: MissionId) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="pointer-events-auto absolute left-3 top-44 w-[min(20rem,calc(100vw-1.5rem))] rounded border border-space-border bg-space-panel/90 p-4 backdrop-blur-md sm:left-6 sm:top-32">
      <header className="mb-3 select-none">
        <div className="font-display text-sm tracking-widest text-hud-green">QUESTS</div>
        <div className="text-xs text-hud-amber/80">{system.name}</div>
      </header>

      {buckets.suggested ? (
        <Section label="suggested">
          <SuggestedRow
            mission={buckets.suggested}
            expanded={expandedId === buckets.suggested.id}
            onToggle={toggle}
            onLaunch={onLaunch}
          />
        </Section>
      ) : (
        <Section label="suggested">
          <SystemClearCta
            warpAvailable={otherSystemsUnlocked && hasUnfinishedInOtherSystems}
            allContentCleared={otherSystemsUnlocked && !hasUnfinishedInOtherSystems}
            onWarp={onWarpToNext}
          />
        </Section>
      )}

      {buckets.available.length > 0 && (
        <Section label="available">
          {buckets.available.map((m) => (
            <CollapsibleRow
              key={m.id}
              mission={m}
              expanded={expandedId === m.id}
              onToggle={toggle}
              prefix=""
              tone="green"
              actionLabel="LAUNCH MISSION"
              onAction={() => onLaunch(m)}
            />
          ))}
        </Section>
      )}

      {buckets.locked.length > 0 && (
        <Section label="locked">
          {buckets.locked.map((m) => (
            <CollapsibleRow
              key={m.id}
              mission={m}
              expanded={expandedId === m.id}
              onToggle={toggle}
              prefix="? "
              tone="muted"
              hint={`requires: ${m.requires.map(prereqName).join(", ")}`}
            />
          ))}
        </Section>
      )}

      {buckets.cleared.length > 0 && (
        <Section label="cleared">
          {buckets.cleared.map((m) => (
            <CollapsibleRow
              key={m.id}
              mission={m}
              expanded={expandedId === m.id}
              onToggle={toggle}
              prefix="✓ "
              tone="cleared"
              actionLabel="PLAY AGAIN"
              onAction={() => onLaunch(m)}
            />
          ))}
        </Section>
      )}

      {buckets.shop && (
        <Section label={buckets.shop.name.toLowerCase()}>
          <ShopRow shop={buckets.shop} onLaunch={onLaunch} />
        </Section>
      )}
    </div>
  );
}

function prereqName(id: string): string {
  try {
    return getMission(id as MissionId).name;
  } catch {
    return id;
  }
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
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

function SuggestedRow({
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

type RowTone = "green" | "muted" | "cleared";

function CollapsibleRow({
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

function ShopRow({
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

function SystemClearCta({
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
