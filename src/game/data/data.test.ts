import { describe, expect, it } from "vitest";

import enemiesJson from "./enemies.json";
import obstaclesJson from "./obstacles.json";
import weaponsJson from "./weapons.json";
import missionsJson from "./missions.json";
import solarSystemsJson from "./solarSystems.json";
import { getAllEnemies, getEnemy } from "./enemies";
import { getAllObstacles, getObstacle } from "./obstacles";
import { getAllWeapons, getWeapon } from "./weapons";
import { getAllMissionWaves, getWavesForMission } from "./waves";
import { getAllSolarSystems, getSolarSystem } from "./solarSystems";
import type {
  EnemyDefinition,
  MissionDefinition,
  ObstacleDefinition,
  SolarSystemDefinition,
  WeaponDefinition
} from "@/types/game";

const KNOWN_FORMATIONS = new Set(["line", "vee", "scatter", "column"]);
const KNOWN_OBSTACLE_FORMATIONS = new Set(["line", "scatter", "column"]);
const KNOWN_BEHAVIORS = new Set(["straight", "zigzag", "homing", "boss"]);
const KNOWN_OBSTACLE_BEHAVIORS = new Set(["drift"]);
const KNOWN_KINDS = new Set(["mission", "shop", "scenery"]);

describe("enemies.json", () => {
  const enemies = enemiesJson.enemies as readonly EnemyDefinition[];

  it("declares at least one enemy", () => {
    expect(enemies.length).toBeGreaterThan(0);
  });

  it("has unique enemy ids", () => {
    const ids = enemies.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(enemies.map((e) => [e.id, e] as const))(
    "%s has sane numeric fields and a known behavior",
    (_id, e) => {
      expect(e.hp).toBeGreaterThan(0);
      expect(e.speed).toBeGreaterThan(0);
      expect(e.scoreValue).toBeGreaterThanOrEqual(0);
      expect(e.creditValue).toBeGreaterThanOrEqual(0);
      expect(e.collisionDamage).toBeGreaterThanOrEqual(0);
      expect(e.spriteKey.length).toBeGreaterThan(0);
      expect(KNOWN_BEHAVIORS.has(e.behavior)).toBe(true);
      if (e.fireRateMs !== null) {
        expect(e.fireRateMs).toBeGreaterThan(0);
      }
    }
  );

  it("getEnemy returns the matching definition", () => {
    expect(getEnemy("aphid").id).toBe("aphid");
    expect(getEnemy("caterpillar-monarch").behavior).toBe("boss");
  });

  it("getAllEnemies exposes the same set as the JSON", () => {
    expect(getAllEnemies().length).toBe(enemies.length);
  });
});

describe("weapons.json", () => {
  const weapons = weaponsJson.weapons as readonly WeaponDefinition[];

  it("declares at least one weapon", () => {
    expect(weapons.length).toBeGreaterThan(0);
  });

  it("has unique weapon ids", () => {
    const ids = weapons.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes a free starter weapon", () => {
    const free = weapons.filter((w) => w.cost === 0);
    expect(free.length).toBeGreaterThan(0);
  });

  it.each(weapons.map((w) => [w.id, w] as const))(
    "%s has positive damage / fireRate / bulletSpeed and a non-negative cost",
    (_id, w) => {
      expect(w.damage).toBeGreaterThan(0);
      expect(w.fireRateMs).toBeGreaterThan(0);
      expect(w.bulletSpeed).toBeGreaterThan(0);
      expect(w.projectileCount).toBeGreaterThanOrEqual(1);
      expect(w.spreadDegrees).toBeGreaterThanOrEqual(0);
      expect(w.spreadDegrees).toBeLessThan(180);
      expect(w.cost).toBeGreaterThanOrEqual(0);
      expect(w.name.length).toBeGreaterThan(0);
      expect(w.energyCost).toBeGreaterThanOrEqual(0);
    }
  );

  it.each(weapons.map((w) => [w.id, w] as const))(
    "%s has a positive energyCost",
    (_id, w) => {
      expect(w.energyCost).toBeGreaterThan(0);
    }
  );

  it("getWeapon returns the matching definition", () => {
    expect(getWeapon("rapid-fire").id).toBe("rapid-fire");
    expect(getWeapon("heavy-cannon").damage).toBeGreaterThan(getWeapon("rapid-fire").damage);
  });

  it("getAllWeapons matches the JSON length", () => {
    expect(getAllWeapons().length).toBe(weapons.length);
  });
});

describe("missions.json", () => {
  const missions = missionsJson.missions as readonly MissionDefinition[];

  it("declares at least one mission", () => {
    expect(missions.length).toBeGreaterThan(0);
  });

  it("has unique mission ids", () => {
    const ids = missions.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has at least one mission with no prerequisites (entry point)", () => {
    const entry = missions.filter((m) => m.requires.length === 0);
    expect(entry.length).toBeGreaterThan(0);
  });

  it("only references known mission ids in `requires`", () => {
    const ids = new Set(missions.map((m) => m.id));
    for (const m of missions) {
      for (const req of m.requires) {
        expect(ids.has(req)).toBe(true);
      }
    }
  });

  it("does not require itself", () => {
    for (const m of missions) {
      expect(m.requires).not.toContain(m.id);
    }
  });

  it.each(missions.map((m) => [m.id, m] as const))(
    "%s has plausible orbital + display fields",
    (_id, m) => {
      expect([1, 2, 3]).toContain(m.difficulty);
      expect(KNOWN_KINDS.has(m.kind)).toBe(true);
      expect(m.orbitRadius).toBeGreaterThan(0);
      expect(m.scale).toBeGreaterThan(0);
      expect(m.texture.startsWith("/textures/")).toBe(true);
      if (m.musicTrack !== null) {
        expect(m.musicTrack.startsWith("/audio/")).toBe(true);
      }
      if (m.ring) {
        expect(m.ring.outerRadius).toBeGreaterThan(m.ring.innerRadius);
        expect(m.ring.innerRadius).toBeGreaterThan(0);
      }
    }
  );

  it("every mission references a known solarSystemId", () => {
    const systemIds = new Set(
      (solarSystemsJson.systems as readonly SolarSystemDefinition[]).map((s) => s.id)
    );
    for (const m of missions) {
      expect(systemIds.has(m.solarSystemId)).toBe(true);
    }
  });
});

describe("solarSystems.json", () => {
  const systems = solarSystemsJson.systems as readonly SolarSystemDefinition[];

  it("declares at least one solar system", () => {
    expect(systems.length).toBeGreaterThan(0);
  });

  it("has unique system ids", () => {
    const ids = systems.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(systems.map((s) => [s.id, s] as const))(
    "%s has a name, sun color, and positive sun size",
    (_id, s) => {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.sunColor.startsWith("#")).toBe(true);
      expect(s.ambientHue.startsWith("#")).toBe(true);
      expect(s.sunSize).toBeGreaterThan(0);
    }
  );

  it("getSolarSystem returns the matching definition", () => {
    expect(getSolarSystem("tutorial").id).toBe("tutorial");
  });

  it("getAllSolarSystems matches the JSON length", () => {
    expect(getAllSolarSystems().length).toBe(systems.length);
  });

  it("every solar system has at least one mission bound to it", () => {
    const allMissions = missionsJson.missions as readonly MissionDefinition[];
    const systemsWithMissions = new Set(allMissions.map((m) => m.solarSystemId));
    for (const s of systems) {
      expect(systemsWithMissions.has(s.id)).toBe(true);
    }
  });
});

describe("obstacles.json", () => {
  const obstacles = obstaclesJson.obstacles as readonly ObstacleDefinition[];

  it("declares at least one obstacle", () => {
    expect(obstacles.length).toBeGreaterThan(0);
  });

  it("has unique obstacle ids", () => {
    const ids = obstacles.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(obstacles.map((o) => [o.id, o] as const))(
    "%s has sane numeric fields and a known behavior",
    (_id, o) => {
      expect(o.speed).toBeGreaterThan(0);
      expect(o.collisionDamage).toBeGreaterThanOrEqual(0);
      expect(o.hitboxRadius).toBeGreaterThan(0);
      expect(o.spriteKey.length).toBeGreaterThan(0);
      expect(KNOWN_OBSTACLE_BEHAVIORS.has(o.behavior)).toBe(true);
    }
  );

  it("getObstacle returns the matching definition", () => {
    expect(getObstacle("asteroid-small").id).toBe("asteroid-small");
  });

  it("getAllObstacles exposes the same set as the JSON", () => {
    expect(getAllObstacles().length).toBe(obstacles.length);
  });
});

describe("waves.json referential integrity", () => {
  const enemyIds = new Set((enemiesJson.enemies as readonly EnemyDefinition[]).map((e) => e.id));
  const obstacleIds = new Set(
    (obstaclesJson.obstacles as readonly ObstacleDefinition[]).map((o) => o.id)
  );
  const missionIds = new Set(
    (missionsJson.missions as readonly MissionDefinition[]).map((m) => m.id)
  );
  const allWaves = getAllMissionWaves();

  it("only references known mission ids", () => {
    for (const m of allWaves) {
      expect(missionIds.has(m.missionId)).toBe(true);
    }
  });

  it("every spawn references an enemy that exists in enemies.json", () => {
    for (const m of allWaves) {
      for (const w of m.waves) {
        for (const s of w.spawns) {
          expect(enemyIds.has(s.enemy)).toBe(true);
        }
      }
    }
  });

  it("every obstacle spawn references an obstacle that exists in obstacles.json", () => {
    for (const m of allWaves) {
      for (const w of m.waves) {
        for (const o of w.obstacleSpawns ?? []) {
          expect(obstacleIds.has(o.obstacle)).toBe(true);
        }
      }
    }
  });

  it("waves and spawns have sane numeric / formation fields", () => {
    for (const m of allWaves) {
      for (const w of m.waves) {
        expect(w.id.length).toBeGreaterThan(0);
        expect(w.durationMs).toBeGreaterThan(0);
        for (const s of w.spawns) {
          expect(s.count).toBeGreaterThan(0);
          expect(s.delayMs).toBeGreaterThanOrEqual(0);
          expect(s.intervalMs).toBeGreaterThanOrEqual(0);
          expect(s.xPercent).toBeGreaterThanOrEqual(0);
          expect(s.xPercent).toBeLessThanOrEqual(1);
          expect(KNOWN_FORMATIONS.has(s.formation)).toBe(true);
        }
        for (const o of w.obstacleSpawns ?? []) {
          expect(o.count).toBeGreaterThan(0);
          expect(o.delayMs).toBeGreaterThanOrEqual(0);
          expect(o.intervalMs).toBeGreaterThanOrEqual(0);
          expect(o.xPercent).toBeGreaterThanOrEqual(0);
          expect(o.xPercent).toBeLessThanOrEqual(1);
          expect(KNOWN_OBSTACLE_FORMATIONS.has(o.formation)).toBe(true);
        }
      }
    }
  });

  it("a wave's last spawn fits inside its declared durationMs", () => {
    for (const m of allWaves) {
      for (const w of m.waves) {
        for (const s of w.spawns) {
          const lastSpawnAt = s.delayMs + Math.max(0, s.count - 1) * s.intervalMs;
          expect(lastSpawnAt).toBeLessThanOrEqual(w.durationMs);
        }
        for (const o of w.obstacleSpawns ?? []) {
          const lastSpawnAt = o.delayMs + Math.max(0, o.count - 1) * o.intervalMs;
          expect(lastSpawnAt).toBeLessThanOrEqual(w.durationMs);
        }
      }
    }
  });

  it("getWavesForMission returns the JSON entry for known missions and [] for unknown", () => {
    const tutorial = getWavesForMission("tutorial");
    expect(tutorial.length).toBeGreaterThan(0);
    // unknown mission id is intentionally not part of MissionId; cast to keep
    // strict typing happy while still exercising the fallback branch.
    const unknown = getWavesForMission("not-a-mission" as Parameters<typeof getWavesForMission>[0]);
    expect(unknown).toEqual([]);
  });

  it("every mission with `kind === 'mission'` has at least one wave defined", () => {
    const missions = missionsJson.missions as readonly MissionDefinition[];
    const definedFor = new Set(allWaves.map((m) => m.missionId));
    for (const m of missions) {
      if (m.kind === "mission") {
        expect(definedFor.has(m.id)).toBe(true);
      }
    }
  });
});

describe("getEnemy / getWeapon throw on unknown ids", () => {
  it("getEnemy throws", () => {
    expect(() => getEnemy("not-an-enemy" as Parameters<typeof getEnemy>[0])).toThrow(
      /Unknown enemy/
    );
  });
  it("getWeapon throws", () => {
    expect(() => getWeapon("not-a-weapon" as Parameters<typeof getWeapon>[0])).toThrow(
      /Unknown weapon/
    );
  });
  it("getSolarSystem throws", () => {
    expect(() =>
      getSolarSystem("not-a-system" as Parameters<typeof getSolarSystem>[0])
    ).toThrow(/Unknown solar system/);
  });
});
