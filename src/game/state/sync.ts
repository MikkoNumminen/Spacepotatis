"use client";

// Save/load sync against /api/save and /api/leaderboard.
// Every call is best-effort — a missing auth session or failed fetch must not
// break gameplay. The game stays playable offline; persistence is a bonus.

import { hydrate, toSnapshot, type StateSnapshot } from "./GameState";
import type { CombatSummary } from "@/game/phaser/config";
import { ROUTES } from "@/lib/routes";
import { RemoteSaveSchema } from "@/lib/schemas/save";

// Module-level cache + in-flight de-dup. Both useCloudSaveSync (which
// hydrates the GameState) and useOptimisticAuth (which only needs to know
// whether a save exists for the CONTINUE label) want the same /api/save
// payload. Without this, both fired separate Edge invocations on every
// authenticated mount — doubling the cold-start cost for no gain. Cleared
// on sign-out so a different account doesn't see the previous one's save.
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export function clearLoadSaveCache(): void {
  cached = null;
  inflight = null;
}

// Read-only window into the module cache. Hooks consult this to seed their
// React initial state so a hot remount (e.g. nav between / and /play) can
// render with ready=true on the very first frame, skipping the splash.
export function isSaveCached(): boolean {
  return cached !== null;
}

export function getSaveCache(): boolean | null {
  return cached;
}

export async function loadSave(): Promise<boolean> {
  if (cached !== null) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      return await doLoadSave();
    } finally {
      inflight = null;
    }
  })();
  const result = await inflight;
  cached = result;
  return result;
}

async function doLoadSave(): Promise<boolean> {
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
      // The schema accepts both new and legacy ship shapes via union; hydrate
      // → migrateShip handles the runtime narrowing into the strict
      // ShipConfig. The cast through unknown is the standard "trust runtime
      // validation" pattern at this boundary.
      ship: body.shipConfig as unknown as StateSnapshot["ship"],
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
    const res = await fetch(ROUTES.api.save, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snap)
    });
    // After a successful POST, the server now definitely has a save row,
    // so any future loadSave() should report hasSave=true without re-fetching.
    if (res.ok) {
      cached = true;
      return;
    }
    // Surface server rejections (422 cheat-guard, 400 schema) to the
    // console so a legitimate player who somehow trips a guard has SOME
    // breadcrumb to follow — silent failure used to make "my progress
    // isn't saving" undebuggable. Cheat attempts also show up here, but
    // that's fine: a determined cheater can read network responses
    // anyway, this just keeps honest players informed.
    const detail = await res.text().catch(() => "");
    console.warn("saveNow: server rejected save", res.status, detail);
  } catch {
    // ignore — snapshot stays in memory
  }
}

export async function submitScore(summary: CombatSummary): Promise<void> {
  if (!summary.victory) return;
  try {
    const res = await fetch(ROUTES.api.leaderboard, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        missionId: summary.missionId,
        score: summary.score,
        timeSeconds: summary.timeSeconds
      })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn("submitScore: server rejected score", res.status, detail);
    }
  } catch {
    // ignore
  }
}
