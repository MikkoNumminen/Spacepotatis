"use client";

// Save/load sync against /api/save and /api/leaderboard.
// Every call is best-effort — a missing auth session or failed fetch must not
// break gameplay. The game stays playable offline; persistence is a bonus.

import { hydrate, toSnapshot, type StateSnapshot } from "./GameState";
import type { CombatSummary } from "@/game/phaser/config";
import { ROUTES } from "@/lib/routes";
import { RemoteSaveSchema } from "@/lib/schemas/save";

export async function loadSave(): Promise<boolean> {
  try {
    const res = await fetch(ROUTES.api.save, { cache: "no-store" });
    if (res.status === 401) return false;
    if (!res.ok) {
      // Surface server-side failures to the console — silent fallback to
      // INITIAL_STATE used to make a 500 indistinguishable from "no save yet"
      // and the user couldn't tell their save was actually unreachable.
      const detail = await res.text().catch(() => "");
      console.warn("loadSave: non-OK response", res.status, detail);
      return false;
    }
    const raw = (await res.json()) as unknown;
    if (raw === null) return false;

    const parsed = RemoteSaveSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        "loadSave: schema rejected save row\nissues:",
        JSON.stringify(parsed.error.issues, null, 2),
        "\nraw:",
        JSON.stringify(raw, null, 2)
      );
      return false;
    }
    const body = parsed.data;

    // shipConfig already passes the legacy-or-new union; hydrate -> migrateShip
    // does the real cleanup (drops unknown ids, clamps levels).
    const snapshot: Partial<StateSnapshot> = {
      credits: body.credits,
      completedMissions: [...body.completedMissions],
      unlockedPlanets: [...body.unlockedPlanets],
      playedTimeSeconds: body.playedTimeSeconds,
      ship: body.shipConfig as StateSnapshot["ship"],
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
    await fetch(ROUTES.api.save, {
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
    await fetch(ROUTES.api.leaderboard, {
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
