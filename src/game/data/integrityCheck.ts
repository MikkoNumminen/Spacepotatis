// Cross-reference drift check for the content JSON files.
//
// Today, ID drift between collections (a wave referencing a deleted enemy, a
// mission requiring a renamed one, a loot pool listing a weapon that's no
// longer in weapons.json) is only caught at runtime by the silent try/catch
// in saveValidation.ts:108 — and only when a save happens to touch the
// broken ref. With ~50+ enemies and missions projected per chapter,
// build-time catching of dangling refs becomes load-bearing for content
// velocity.
//
// This module walks every cross-reference between content collections at
// boot and throws with a useful path on the first dangling ref. Invoked
// once at the bottom of missions.ts (the most universally-imported
// accessor); tests inject synthetic data via the parameter to exercise
// the failure paths without breaking the live data.
//
// Cross-references covered:
//   waves.json:        spawn.enemy            → enemies.json id
//   waves.json:        missionId              → missions.json id
//   missions.json:     solarSystemId          → solarSystems.json id
//   missions.json:     requires[]             → missions.json id
//   missions.json:     orbitParentId          → missions.json id (same system)
//   lootPools.ts:      systemId               → solarSystems.json id
//   lootPools.ts:      weapons[]              → weapons.json id
//   lootPools.ts:      augments[]             → augments.ts id
//   story.ts:          on-mission-select      → missions.json id
//   story.ts:          on-system-enter        → solarSystems.json id
//   story.ts:          on-system-cleared-idle → solarSystems.json id
//
// NOT covered (intentional): texture file paths, audio file paths.
// Filesystem checks are too brittle for module-load — tests in
// public/textures and public/audio are the right layer for that.

import { getAllEnemies } from "./enemies";
import { getAllSolarSystems } from "./solarSystems";
import { getAllWeapons } from "./weapons";
import { getAllAugments, type AugmentDefinition } from "./augments";
import { getAllLootPools, type LootPool } from "./lootPools";
import { getAllMissionWaves } from "./waves";
import { STORY_ENTRIES, type StoryEntry } from "./story";
import type {
  EnemyDefinition,
  MissionDefinition,
  MissionWaves,
  SolarSystemDefinition,
  WeaponDefinition
} from "@/types/game";

// All collections the check operates on. The defaults pull from the live
// accessors; tests inject synthetic versions to exercise failure paths.
export interface IntegrityData {
  readonly enemies: readonly EnemyDefinition[];
  readonly weapons: readonly WeaponDefinition[];
  readonly augments: readonly AugmentDefinition[];
  readonly missions: readonly MissionDefinition[];
  readonly solarSystems: readonly SolarSystemDefinition[];
  readonly lootPools: readonly LootPool[];
  readonly missionWaves: readonly MissionWaves[];
  readonly stories: readonly StoryEntry[];
}

// "did you mean" suggestion — picks the closest known id by Levenshtein
// distance, only surfacing it when the typo is plausible (distance <= 3
// and within ~half the id length). Pure presentation aid; never used to
// auto-fix.
function suggestSimilar(
  unknown: string,
  known: readonly string[]
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const k of known) {
    const d = levenshtein(unknown, k);
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  if (best === null) return null;
  const cap = Math.max(2, Math.floor(unknown.length / 2));
  return bestDist <= Math.min(3, cap) ? best : null;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev: number[] = new Array<number>(b.length + 1);
  const curr: number[] = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j] ?? 0;
  }
  return prev[b.length] ?? 0;
}

function fail(
  path: string,
  kind: string,
  value: string,
  known: readonly string[]
): never {
  const hint = suggestSimilar(value, known);
  const suffix = hint ? ` (typo of '${hint}'?)` : "";
  throw new Error(
    `integrityCheck: ${path} references unknown ${kind} '${value}'${suffix}`
  );
}

// Public entry point. Throws on the first dangling cross-reference.
//
// `data` is required so missions.ts can pass its already-parsed list and
// avoid forming a top-level load cycle through ./missions. Callers that
// want the live full check (tests, future tooling) build the IntegrityData
// themselves via `buildLiveIntegrityData()`.
export function runDataIntegrityCheck(data: IntegrityData): void {
  const enemyIds = new Set(data.enemies.map((e) => e.id));
  const enemyIdList = data.enemies.map((e) => e.id);
  const weaponIds = new Set(data.weapons.map((w) => w.id));
  const weaponIdList = data.weapons.map((w) => w.id);
  const augmentIds = new Set(data.augments.map((a) => a.id));
  const augmentIdList = data.augments.map((a) => a.id);
  const missionIds = new Set(data.missions.map((m) => m.id));
  const missionIdList = data.missions.map((m) => m.id);
  const systemIds = new Set(data.solarSystems.map((s) => s.id));
  const systemIdList = data.solarSystems.map((s) => s.id);
  const missionsById = new Map(data.missions.map((m) => [m.id, m]));

  // missions.json → solarSystems + missions (requires + orbitParent)
  for (const mission of data.missions) {
    if (!systemIds.has(mission.solarSystemId)) {
      fail(
        `missions['${mission.id}'].solarSystemId`,
        "solar system",
        mission.solarSystemId,
        systemIdList
      );
    }
    for (let i = 0; i < mission.requires.length; i++) {
      const req = mission.requires[i];
      if (req === undefined) continue;
      if (req === mission.id) {
        throw new Error(
          `integrityCheck: missions['${mission.id}'].requires[${i}] is a self-reference`
        );
      }
      if (!missionIds.has(req)) {
        fail(
          `missions['${mission.id}'].requires[${i}]`,
          "mission",
          req,
          missionIdList
        );
      }
    }
    if (mission.orbitParentId !== undefined) {
      const parent = missionsById.get(mission.orbitParentId);
      if (!parent) {
        fail(
          `missions['${mission.id}'].orbitParentId`,
          "mission",
          mission.orbitParentId,
          missionIdList
        );
      }
      if (parent.solarSystemId !== mission.solarSystemId) {
        throw new Error(
          `integrityCheck: missions['${mission.id}'].orbitParentId points to '${parent.id}' in a different solar system ('${parent.solarSystemId}' vs '${mission.solarSystemId}')`
        );
      }
    }
  }

  // waves.json → missions + enemies
  for (let mi = 0; mi < data.missionWaves.length; mi++) {
    const mw = data.missionWaves[mi];
    if (!mw) continue;
    if (!missionIds.has(mw.missionId)) {
      fail(
        `missionWaves[${mi}].missionId`,
        "mission",
        mw.missionId,
        missionIdList
      );
    }
    for (let wi = 0; wi < mw.waves.length; wi++) {
      const wave = mw.waves[wi];
      if (!wave) continue;
      for (let si = 0; si < wave.spawns.length; si++) {
        const spawn = wave.spawns[si];
        if (!spawn) continue;
        if (!enemyIds.has(spawn.enemy)) {
          fail(
            `missionWaves['${mw.missionId}'].waves['${wave.id}'].spawns[${si}].enemy`,
            "enemy",
            spawn.enemy,
            enemyIdList
          );
        }
      }
    }
  }

  // lootPools.ts → solarSystems / weapons / augments
  for (const pool of data.lootPools) {
    if (!systemIds.has(pool.systemId)) {
      fail(
        `lootPools['${pool.systemId}'].systemId`,
        "solar system",
        pool.systemId,
        systemIdList
      );
    }
    for (let i = 0; i < pool.weapons.length; i++) {
      const w = pool.weapons[i];
      if (w === undefined) continue;
      if (!weaponIds.has(w)) {
        fail(
          `lootPools['${pool.systemId}'].weapons[${i}]`,
          "weapon",
          w,
          weaponIdList
        );
      }
    }
    for (let i = 0; i < pool.augments.length; i++) {
      const a = pool.augments[i];
      if (a === undefined) continue;
      if (!augmentIds.has(a)) {
        fail(
          `lootPools['${pool.systemId}'].augments[${i}]`,
          "augment",
          a,
          augmentIdList
        );
      }
    }
  }

  // story.ts → missions / solarSystems
  for (const entry of data.stories) {
    const trigger = entry.autoTrigger;
    if (trigger === null) continue;
    switch (trigger.kind) {
      case "on-mission-select":
        if (!missionIds.has(trigger.missionId)) {
          fail(
            `story['${entry.id}'].autoTrigger.missionId`,
            "mission",
            trigger.missionId,
            missionIdList
          );
        }
        break;
      case "on-system-enter":
      case "on-system-cleared-idle":
        if (!systemIds.has(trigger.systemId)) {
          fail(
            `story['${entry.id}'].autoTrigger.systemId`,
            "solar system",
            trigger.systemId,
            systemIdList
          );
        }
        break;
      case "first-time":
      case "on-shop-open":
        // No cross-reference to validate.
        break;
      default: {
        // Exhaustiveness guard — adding a new trigger kind without
        // updating this switch fails tsc.
        const _exhaustive: never = trigger;
        void _exhaustive;
      }
    }
  }
}

// Convenience builder for callers that want a snapshot of the live data
// and the missions list. Used by tests and any future tooling.
export function buildLiveIntegrityData(
  missions: readonly MissionDefinition[]
): IntegrityData {
  return {
    enemies: getAllEnemies(),
    weapons: getAllWeapons(),
    augments: getAllAugments(),
    missions,
    solarSystems: getAllSolarSystems(),
    lootPools: getAllLootPools(),
    missionWaves: getAllMissionWaves(),
    stories: STORY_ENTRIES
  };
}
