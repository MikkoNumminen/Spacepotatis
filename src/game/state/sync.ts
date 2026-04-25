"use client";

// Save/load sync against /api/save and /api/leaderboard.
// Every call is best-effort — a missing auth session or failed fetch must not
// break gameplay. The game stays playable offline; persistence is a bonus.

import { hydrate, toSnapshot, type StateSnapshot } from "./GameState";
import type { CombatSummary } from "@/game/phaser/config";

interface RemoteSave {
  slot: number;
  credits: number;
  currentPlanet: string | null;
  shipConfig: Record<string, unknown>;
  completedMissions: string[];
  unlockedPlanets: string[];
  playedTimeSeconds: number;
  updatedAt: string;
}

export async function loadSave(): Promise<boolean> {
  try {
    const res = await fetch("/api/save", { cache: "no-store" });
    if (res.status === 401) return false;
    if (!res.ok) return false;
    const body = (await res.json()) as RemoteSave | null;
    if (!body) return false;

    const snapshot: Partial<StateSnapshot> = {
      credits: body.credits,
      completedMissions: body.completedMissions as StateSnapshot["completedMissions"],
      unlockedPlanets: body.unlockedPlanets as StateSnapshot["unlockedPlanets"],
      playedTimeSeconds: body.playedTimeSeconds,
      ship: isShipConfig(body.shipConfig) ? body.shipConfig : undefined,
      saveSlot: body.slot
    };
    hydrate(snapshot);
    return true;
  } catch {
    return false;
  }
}

export async function saveNow(): Promise<void> {
  const snap = toSnapshot();
  try {
    await fetch("/api/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snap)
    });
  } catch {
    // ignore — snapshot stays in memory
  }
}

export async function submitScore(summary: CombatSummary): Promise<void> {
  if (!summary.victory) return;
  try {
    await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        missionId: summary.missionId,
        score: summary.score,
        timeSeconds: summary.timeSeconds
      })
    });
  } catch {
    // ignore
  }
}

export function isShipConfig(value: unknown): value is StateSnapshot["ship"] {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.primaryWeapon === "string" &&
    Array.isArray(v.unlockedWeapons) &&
    typeof v.shieldLevel === "number" &&
    typeof v.armorLevel === "number"
  );
}
