"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  MissionDefinition,
  MissionId,
  SolarSystemId
} from "@/types";
import { getAllMissions, getMission, getSolarSystem } from "@/game/data";
import { useGameState } from "@/game/state";
import { bucketMissions } from "./questBuckets";
import {
  CollapsibleRow,
  Section,
  ShopRow,
  SuggestedRow,
  SystemClearCta
} from "./QuestPanelRows";

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
