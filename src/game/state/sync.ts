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

// Accepts either the new shape (slots + reactor) OR a legacy shape
// (primaryWeapon, no reactor) so old saves load cleanly. The actual migration
// to the new shape happens in GameState.hydrate via migrateShip.
export function isShipConfig(value: unknown): value is StateSnapshot["ship"] {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.unlockedWeapons)) return false;
  if (typeof v.shieldLevel !== "number" || typeof v.armorLevel !== "number") return false;

  const hasNewShape = isWeaponSlots(v.slots);
  const hasLegacyShape = typeof v.primaryWeapon === "string";
  if (!hasNewShape && !hasLegacyShape) return false;

  if (v.reactor !== undefined && !isReactorConfig(v.reactor)) return false;
  if (v.weaponLevels !== undefined && !isWeaponLevels(v.weaponLevels)) return false;
  if (v.weaponAugments !== undefined && !isWeaponAugments(v.weaponAugments)) return false;
  if (v.augmentInventory !== undefined && !isAugmentInventory(v.augmentInventory)) return false;
  return true;
}

function isWeaponLevels(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const lvl of Object.values(value as Record<string, unknown>)) {
    if (typeof lvl !== "number" || !Number.isFinite(lvl)) return false;
  }
  return true;
}

function isWeaponAugments(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const list of Object.values(value as Record<string, unknown>)) {
    if (!Array.isArray(list)) return false;
    if (list.some((item) => typeof item !== "string")) return false;
  }
  return true;
}

function isAugmentInventory(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every((item) => typeof item === "string");
}

function isWeaponSlots(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const slotKeys = ["front", "rear", "sidekickLeft", "sidekickRight"] as const;
  for (const k of slotKeys) {
    const slot = v[k];
    if (slot !== null && typeof slot !== "string") return false;
  }
  return true;
}

function isReactorConfig(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.capacityLevel === "number" && typeof v.rechargeLevel === "number";
}
